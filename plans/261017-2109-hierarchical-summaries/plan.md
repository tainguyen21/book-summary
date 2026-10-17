---
title: "Hierarchical summaries for long books"
description: "Summarize evidence in bounded groups, then summarize the group summaries, so long books stay within call limits and keep coverage."
status: completed
priority: P1
effort: 1d
branch: master
tags: [worker, generation, cost]
created: 2026-10-17
---

# Hierarchical summaries

## Problem

The summary step sends every accepted evidence record in one call. The
evaluation book (1,678 words) produced 63 records; a 100,000-word book would
produce several thousand. That is hundreds of thousands of input tokens in one
call, a single answer capped at about 600 words, and one expensive call to
repeat after any failure.

## Contract

- **Outcome:** when evidence exceeds a group size, it is summarized in
  consecutive groups. The group summaries are then summarized again, repeating
  until one group remains, and that final pass produces the book summary.
  Short books keep today's single call.
- **Constraints:**
  - The final summary still cites only spans that accepted evidence cites, so
    `accepted_summary_from_output` is unchanged.
  - The daily budget is checked before every call.
  - No migration: intermediate summaries reuse the checkpoint table under a
    separate prompt-version key.
  - No new dependencies, no new automated tests, no push.
- **Non-goals:** persisting or showing section summaries (chapter summaries,
  roadmap A7); changing the final length target; parallel calls.
- **Acceptance:**
  1. With at most `BOOKWISE_SUMMARY_GROUP_RECORDS` records (default 120), the
     book makes exactly one summary call, as before.
  2. With more records, groups are balanced and consecutive. Each group summary
     cites only spans from its own group; the final summary passes the existing
     citation check.
  3. A retry after a failure in the reduce phase reuses saved group summaries.
  4. With a small group size, the evaluation book completes through 2 levels,
     and its rubric score stays within 1 point of the single-pass 11.5/12.
  5. ruff and compileall pass.

## Design

- **Records:** each group summary becomes a record shaped like an evidence
  record (`evidence_type` `section_summary`), carrying the union of the spans
  it cites.
- **Grouping:** `ceil(n / size)` groups of near-equal size, in reading order.
- **Checkpoints:** an `EvidenceCheckpoints` instance with prompt version
  `section:<summary prompt hash>`, keyed by a hash of the group's records,
  storing the `SummaryDraft`.
- **Failure stages:** `section_summary_generation` and
  `section_summary_validation` (validation outcomes). Section citations
  outside the group are rejected like evidence citations.
- **Configuration:** `BOOKWISE_SUMMARY_GROUP_RECORDS` (positive integer,
  default 120).

## Results (2026-10-17)

- **Offline** (fake summarizer):
  - 250 records at group size 120 become 3 groups (84/83/83), then 3 records.
  - 2,000 records at 30 reduce through 2 levels (70 calls) to 3 records.
  - 100 records at 120 make no extra calls.
  - A section citing a foreign span is rejected (`invalid_section_summary_citation`).
- **Live** (evaluation TXT, group size 30, live Vertex): 41 evidence records became 2 sections.
  - Run 1 lost its lease at section 2, after 1 evidence call and 1 section call.
  - Run 2 reused the evidence and section 1 (checkpoints), called only section 2
    and the final pass, and completed: 32 citations, no validation outcomes
    except the simulated lease loss.
  - Totals: 1 evidence call and 3 summary calls (2 sections + final), about $0.092.
- **Quality:** 10.5/12 with 0 traps, against 11.5 single-pass, so within the
  1-point target. It omitted the core thesis sentence; 503 words.
- **Design fix found while building:** a section summary is validated before
  it is checkpointed; otherwise an invalid one would be reused on every retry.
- **Checks:** ruff and compileall pass.

Acceptance 1–5 met.
