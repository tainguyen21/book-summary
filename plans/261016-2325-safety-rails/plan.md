---
title: "Safety rails: worker logs, token ledger, budget alert, daily budget"
description: "Make model spend visible and capped, and make the worker observable, before any Q&A feature spends tokens."
status: in-progress
priority: P1
effort: 4d
branch: master
tags: [backend, worker, devops, cost]
blockedBy: []
blocks: []
created: 2026-10-16
---

# Safety rails

## Contract

- **Outcome:**
  - The worker writes structured JSON logs.
  - Every model call records its token count and estimated cost.
  - Generation pauses once the day's spend reaches $1 and resumes after midnight Asia/Saigon.
  - A GCP billing budget alert exists.
- **Constraints:**
  - Python owns the `data` schema; the API only reads data projections.
  - Never log tokens, signed URLs, file names, book text, or raw exceptions.
  - No new automated tests unless the user asks (AGENTS.md).
  - Model prices must be configurable, not hard-coded.
- **Non-goals:**
  - The answer cache. It moves to the "Ask a book" (A3) plan, by user decision.
  - Langfuse.
  - Tracing (B7).
  - Retry limits.
  - Saving finished chunks so a paused book can resume where it stopped.
- **Acceptance:**
  1. Local worker run shows JSON lines for start, claim, stage, completion, failure, and budget pause, each with `command_id`, `book_id`, and `run_id`.
  2. After one summary, `data.model_usage` has rows per call with input/output tokens and an estimated cost.
  3. With `BOOKWISE_DAILY_BUDGET_USD=0.0001`, a new book stays queued, the run is marked retryable, the log says `budget_paused`, and the library shows "Paused: daily budget reached".
  4. The budget script creates a GCP budget with 50%, 90%, and 100% email alerts when the user runs it.

## Decisions

| Topic | Decision |
| --- | --- |
| Answer cache | Deferred to the A3 plan |
| Daily cap | $1/day, set by `BOOKWISE_DAILY_BUDGET_USD` |
| On limit | Pause generation; resume after midnight Asia/Saigon |
| GCP alert | Reviewed `gcloud` script; the user runs it with billing access |

## Phases

| # | Phase | Effort | Depends on |
| --- | --- | --- | --- |
| 1 | [Structured worker logs](phase-01-structured-worker-logs.md) | 0.5d | none |
| 2 | [Usage capture and ledger](phase-02-usage-ledger.md) | 1.5d | 1; model-migration branch merged (shares `model_provider.py`) |
| 3 | [Daily budget pause](phase-03-daily-budget-pause.md) | 1d | 2 |
| 4 | [Cost card and paused state](phase-04-web-cost-card-and-paused-state.md) | 0.5d | 2, 3; web redesign committed first |
| 5 | [GCP budget alert](phase-05-gcp-budget-alert.md) | 0.5d | none (can run any time) |

The sections below are summaries. The phase files are the execution contract.

### 1. Structured worker logs
- **New `workers/logging_setup.py`:** a standard-library JSON formatter (no new dependency) that writes `severity`, `message`, `event`, and context fields to stdout. GKE Cloud Logging parses this format natively.
- **Log events:**
  - `bootstrap.py`: `worker_started` and `worker_stopping`.
  - `command_worker.py`: `command_claimed`, `command_completed`, `command_failed` (with retryable/permanent and an error code only), and `batch_idle` at debug level.
- **Files:** `workers/bootstrap.py`, `workers/command_worker.py`, new `workers/logging_setup.py`.

### 2. Usage capture and ledger
- **Provider hook:** an optional `usage_sink(operation, model, input_tokens, output_tokens)` callback in `infrastructure/providers/model_provider.py`.
  - Vertex: read `response.usage_metadata`, from both `generate_content` and `embed_content`.
  - OpenAI-compatible: read `usage` from the response.
- **Migration `infrastructure/database/migrations/008_create_model_usage.sql`:**
  - Table `data.model_usage`: `id`, `owner_id`, `book_id`, `command_id`, `operation` (`evidence`, `summary`, or `embedding`), `provider`, `model`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `created_at`.
  - Index on `created_at`.
  - Row-level security keyed on owner, like the other `data` tables.
  - A `SECURITY DEFINER` function that returns only the global daily total, for the budget check.
  - A daily view granted to `app_rw` inside the migration, following the pattern of migration 006.
- **Cost estimate:** read prices from `BOOKWISE_MODEL_PRICING_JSON` (per million input/output tokens, per model). A model without a price is recorded as cost 0, with a warning logged once.
- **New `infrastructure/database/usage_repository.py`:** inserts in its own short transaction, so a failed run still records what it spent.
- **Wiring:** `generate_summary.py` passes the sink for the current command.
- **Rollout:** back up the local DB before applying migration 008. Production applies it through the existing migration Job.

### 3. Daily budget pause
- **New `application/daily_budget.py`:** sums today's `estimated_cost_usd`, with the day boundary in Asia/Saigon (configurable through `BOOKWISE_BUDGET_TIMEZONE`).
- **Before claiming:** if over budget, the claim excludes `regenerate_summary` commands. They stay queued, and ingestion keeps running.
- **During generation:** before each provider call, if over budget, raise a retryable `DailyBudgetExceeded`. The run becomes `retryable_failed` and is reclaimed tomorrow, with no permanent failure. Emit a `budget_paused` processing event and log line.
- **Resume:** finished chunks are saved as evidence checkpoints (`plans/261017-1459-evidence-chunk-checkpoints`), so a paused book resumes from its next unfinished chunk the following day.

### 4. Web cost card and paused state
- **API:** `GET /v1/usage/today` returns spend, cap, and paused status from the daily view. Add it under `services/api/src/interfaces/http`, reading through `book-read.repository.ts` or a new usage repository.
- **Library dashboard:** a small "Today's AI spend: $0.12 of $1.00" card next to the stats.
- **Paused books:** show "Paused: daily budget reached" instead of "Retrying" when the latest event is `budget_paused`, by adding a case to `lib/book-status.ts`.

### 5. GCP budget alert
- **New `infrastructure/gcp/scripts/create-budget-alert.ps1`** (PowerShell, matching the other GCP scripts): runs `gcloud billing budgets create` for project `bookwise-509408`, with a monthly amount argument and thresholds at 0.5, 0.9, and 1.0. It is idempotent: it checks for an existing budget first.
- **Runbook:** add a section to `infrastructure/gcp/runbook.md` on required roles (Billing Account Administrator or Costs Manager) and how to verify.
- **User step:** the user runs the script themselves; it is never run automatically.

## Risks

- **Shared file:** `model_provider.py` is also being edited by the migration session. Start phase 2 after that branch merges.
- **Estimates only:** prices are estimates. Billing remains the source of truth, which is why phase 5 exists.
- **Day boundary:** the budget is per day in Asia/Saigon, while GCP bills by calendar month in UTC. These are different by design.

## Verification

- `uv run --project services/data` existing checks.
- `pnpm --dir apps/web lint` and `test`; API lint and build.
- The manual acceptance steps 1–4 above, run on the local stack.

## Validation notes (checked against code, 2026-10-17)

- **Corrected:** GCP scripts are PowerShell, so the budget script is `.ps1`, not bash.
- **Corrected:** API-readable views are granted inside migrations (`006` grants `app_rw`), not in `roles/*.sql`.
- **Added:** `data` tables enforce row-level security on `bookwise.owner_id` (migrations `003`/`004`). The ledger follows this, and the global budget total goes through a narrow `SECURITY DEFINER` function.
- **Confirmed:**
  - Retryable failures have no attempt limit, so the pause relies on reclaiming `retryable_failed` runs.
  - Evidence is held in memory until the final persist, so a paused book restarts and repeats its spend.
- **Resolved:** `processing_events.event_type` is a plain `VARCHAR(100)` (migration 001), so `budget_paused` needs only the Python `ProcessingEventType` enum change, with no migration.
- **Existing test book:** the queued 76 MB "Large Field Notes" would pause at the cap every day. Resolve it before restarting the worker (phase 3, step 5).

## Unresolved questions

1. What monthly amount should the GCP budget alert use? $10 is suggested for a learning project.
2. Should the tiny-cap test in acceptance step 3 also run once in production, or locally only?
3. What to do with the queued 76 MB test book: delete it once book management exists, or keep the worker stopped until then? (A cap of `0` disables budgeting, so it is not an option here.)
