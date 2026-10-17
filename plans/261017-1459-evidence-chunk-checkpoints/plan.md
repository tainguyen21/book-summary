---
title: "Evidence chunk checkpoints: resume generation instead of restarting"
description: "Persist each chunk's validated evidence output so a retried, paused, or failed summary run skips chunks it already paid for."
status: completed
priority: P1
effort: 0.5d
branch: master
tags: [worker, generation, cost]
blocks: [261016-2325-safety-rails phase 3 daily budget pause]
created: 2026-10-17
---

# Evidence chunk checkpoints

Why: evidence is held in memory until the final persist, so any failure or a
budget pause throws away every finished chunk. At the measured rate a
100,000-word book costs about $4–5, so under a $1/day cap it would restart
every day and never finish. See
`plans/reports/eval-261017-1047-slow-orchard/report.md`.

## Contract

- **Outcome:** after a chunk's evidence is validated, it is saved; a later run
  of the same command reuses saved chunks without a model call and only calls
  the provider for the rest.
- **Constraints:** Python owns `data`; append-only (insert/select) like the
  other generated tables; owner row-level security; no new dependencies; no
  new automated tests; no push.
- **Non-goals:** reusing evidence across different commands or processing
  versions; resuming the summary or embedding steps (single calls); deleting
  old checkpoints.
- **Acceptance:**
  1. A forced failure after 2 of N chunks, followed by a retry, finishes the
     book with exactly N evidence calls in `data.model_usage` across both runs.
  2. The retry logs `evidence_resumed` with `chunks_reused=2`.
  3. The final summary and evidence persist as before (same tables, no rejections).
  4. Changing the evidence prompt, provider, or model invalidates old checkpoints.
  5. ruff and compileall pass; migration applies locally after a backup.

## Design

- **Key:** `(command_id, source_document_id, chunk_input_hash, provider, model,
  prompt_version)`. The chunk input hash already covers node, sequence, and
  span content hashes. `prompt_version` is a short hash of the shared evidence
  instructions, so a prompt change re-extracts.
- **Stored value:** the validated `EvidenceExtractionOutput` JSON. Evidence ids
  are deterministic from chunk input and output, so reuse rebuilds identical
  records through the normal validation path.
- **Migration 009:** `data.generation_evidence_checkpoints` with a unique key,
  FK to `data.source_documents`, RLS owner policy, `SELECT, INSERT` for
  `data_rw`, and a revoke in `roles/data_rw.sql`.
- **Repository:** new `evidence_checkpoint_repository.py`: `load(command,
  source_document_id, provider, model, prompt_version)` returns outputs by
  chunk hash; `save(...)` inserts with `ON CONFLICT DO NOTHING` in its own
  short transaction, right after the chunk validates.
- **Use case:** `GenerateSummary` takes an optional checkpoint store; for each
  chunk it reuses a saved output or calls the provider and saves the result.
  A failed save is logged (`evidence_checkpoint_failed`) and does not fail the
  run, since the output is still in memory.
- **Logs:** `evidence_resumed` (INFO) with `chunks_reused` and `chunk_count`,
  only when at least one chunk is reused.

## Verification

Back up the local DB, apply 009, then run the evaluation book with
`BOOKWISE_GENERATION_CHUNK_CHARS=3000` (several chunks): run 1 loses its lease
before chunk 3, run 2 completes. Check ledger counts, logs, and outputs.

## Results (2026-10-17)

Evaluation book with 3,000-character chunks (4 chunks). Run 1 lost its lease
before chunk 3 and failed retryably after 2 evidence calls, leaving 2
checkpoints. Run 2 logged `evidence_resumed` (2 of 4 reused), made only 2
evidence calls, and completed: 4 evidence calls in total, 74 evidence items,
and the summary persisted. `data_rw` cannot update or delete checkpoints, and
`app_rw` cannot read them. Prompt, provider, or model changes miss by key.
Acceptance 1–5 met.

## Rollback

The worker works without the store (it is optional). The table can stay;
removing it needs a new forward migration and a backup.
