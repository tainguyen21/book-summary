---
title: "Summary coverage, TXT paragraph spans, and pure-JSON worker logs"
description: "Fix the gaps found by the Slow Orchard evaluation: sparse evidence, whole-book TXT citations, and SDK text in JSON logs."
status: completed
priority: P1
effort: 0.5d
branch: master
tags: [worker, generation, parser]
created: 2026-10-17
---

# Summary coverage, TXT paragraph spans, pure-JSON logs

Evidence: `plans/reports/eval-261017-1047-slow-orchard/report.md` (coverage 5/12,
one span per TXT book, AFC warning on stderr).

## Contract

- **Outcome:**
  - Evidence extraction covers every distinct fact in a chunk, and the summary uses all of it.
  - A TXT book is stored as one document node with one span per paragraph, each with line coordinates.
  - TXT books longer than one chunk no longer fail.
  - Vertex generate calls print nothing outside the JSON log stream.
- **Constraints:** no schema migration; no new dependencies; no new automated tests (AGENTS.md); production settings unchanged except the output-token ceiling; no push.
- **Non-goals:** chunking across structure nodes (DOCX makes one node, and so one model call, per paragraph — recorded as a follow-up); heading detection in TXT; resuming paused books.
- **Acceptance:**
  1. Re-running the Slow Orchard rubric scores at least 10/12 key facts with 0 traps triggered.
  2. The new run's evidence and summary cite paragraph spans with `line_start`/`line_end`.
  3. A TXT larger than 12,000 characters builds multiple chunks instead of raising `SourceSpanChunkLimitError` (offline check, no model call).
  4. The worker run prints only JSON lines.
  5. Existing checks (ruff, compileall) pass.

## Root cause found while planning

`build_chunks` never splits a span. TXT was one span, so any TXT over the
12,000-character chunk size raised `SourceSpanChunkLimitError`, a permanent
failure. The 9 KB evaluation book was just under that limit.

## Design

1. **Parser model:** `ParsedSection` gains optional `spans` (text plus location).
   `normalize_source` emits one span per entry, and the section's node covers
   their sequence range. Sections without `spans` behave exactly as before.
2. **TXT parser:** one `text` section whose spans are blank-line-separated
   paragraphs, with `paragraph_number`, `line_start`, `line_end`. A paragraph
   over 4,000 characters is split at line breaks, then at whitespace, so every
   span fits well inside a chunk.
3. **Coverage prompts:** shared evidence and summary prompt text for both
   providers. Evidence: one item per distinct claim, number, date, name, rule,
   cause, outcome, or caveat; no merging; no one-per-type limit; cite the
   narrowest spans. Summary: cover every evidence item with its key numbers
   and names, grouped by theme.
4. **Output ceiling:** raise `BOOKWISE_MODEL_MAX_OUTPUT_TOKENS` from 4000 to
   16384 and `BOOKWISE_MODEL_TIMEOUT_SECONDS` from 60 to 120 (ConfigMap and
   `.env.example`). 8192 truncated the evidence JSON in run 2.
5. **AFC and thinking:** pass `AutomaticFunctionCallingConfig(disable=True)`
   and `ThinkingConfig(thinking_level=LOW)` to Vertex `generate_content`.
6. **Summary prompt:** no ids or citation markers in the body; combine
   related facts; under about 600 words.

## Results

Acceptance 1–5 met; see the re-run section of
`plans/reports/eval-261017-1047-slow-orchard/report.md`. Coverage was 11.5/12
with 0 traps, citations are at paragraph level, and logs are JSON only. A
59,000-character TXT now builds 5 chunks offline. Cost per book rose 3.9×.

## Rollout risk

- Already-ingested books keep their stored spans; only new ingests change.
- Denser evidence means more output tokens per book (higher cost per book);
  the re-run measures it.

## Follow-ups (out of scope)

- Pack adjacent small structure nodes into one chunk (DOCX one-call-per-paragraph).
- Same oversized-span risk for EPUB chapters and PDF pages over 12,000 characters.
- Save finished chunks before the daily budget pause, or a full book never completes.
- Hierarchical summary for long books (the summary input grows with evidence count).
