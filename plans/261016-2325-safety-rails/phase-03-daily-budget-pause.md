---
phase: 3
title: Daily budget pause
status: pending
effort: 1d
dependsOn: [phase-02]
---

# Phase 3 — Daily budget pause

## Context
- The claim query in `infrastructure/database/command_repository.py` (`_CLAIM_...`, around lines 25–95) selects queued commands whose run is missing, `retryable_failed`, or a stale `running` lease. Retryable failures have no attempt limit, so a retryable outcome resumes naturally.
- `generate_summary.py` keeps all evidence in memory and persists it only at the end, so a mid-book pause restarts the book from scratch.
- User decisions: cap $1/day; on limit, pause and resume after midnight Asia/Saigon.

## Requirements
- Settings:
  - `BOOKWISE_DAILY_BUDGET_USD`, default `1`. A value of `0` disables the cap; document this.
  - `BOOKWISE_BUDGET_TIMEZONE`, default `Asia/Saigon`.
- **Before claiming:** if today's spend is at or over the cap, the worker claims only `ingest_book` commands; summary commands stay queued.
- **During generation:** before each provider call, if over the cap, stop with a retryable `DailyBudgetExceeded`. The run ends as `retryable_failed`, never permanent.
- **Visibility:**
  - Emit a durable `budget_paused` processing event by extending the `ProcessingEventType` enum in `domain/commands.py`. The column is a plain `VARCHAR(100)` (migration 001), so no schema change is needed.
  - Log a `budget_paused` line with spend and cap.
- After the local midnight, the next poll resumes automatically.

## Design
- **New `application/daily_budget.py`:** a `DailyBudget(spent_since, cap, tz)` class with:
  - `is_exhausted()`: computes the local day start, converts it to UTC, and calls `data.model_usage_spent_since`.
  - `require_available()`: raises `DailyBudgetExceeded`.
  - A five-second in-process cache, so per-call checks don't hit the DB on every chunk.
- **Claim filter:** add an `allow_generation: bool` parameter through `ClaimCommand.execute` and `claim_available`, then a SQL predicate `AND (:allow_generation OR command.command_type <> 'regenerate_summary')`.
- **Generation guard:** inject `DailyBudget` into `GenerateSummary` and call `require_available()` before each provider call. The exception must pass through `_record_failure` unchanged, so `CommandWorker` routes it to `fail_retryably`.

## Steps
1. Implement `DailyBudget`, the claim parameter, the generation guard, and the event type.
2. Locally set `BOOKWISE_DAILY_BUDGET_USD=0.0001`, upload a small TXT, and confirm:
   - ingestion completes
   - generation becomes `retryable_failed` with a `budget_paused` event
   - the command stays queued
   - nothing is retried until the cap is raised
3. Raise the cap; confirm the book completes on the next poll.
4. **Before restarting the worker for real:** handle the queued 76 MB test book ("Large Field Notes") that the user kept. With the $1 cap it would pause after about $1 of spend per day, every day. Ask the user whether to delete it once book management (C1) exists, or keep the worker stopped until then. Do not set the cap to `0` for this: `0` disables the cap and would let the whole book run.

## Validation
- The acceptance step 3 sequence passes.
- With the cap disabled (`0`), behavior is identical to today.

## Risks
- A paused book repeats its evidence spend the next day, at most one day's cap per day. Saving finished chunks is a separate follow-up.
- Concurrency: with `PROCESSING_BATCH_LIMIT=1` (the default) and one worker pod, overshoot is bounded by one provider call.

## Rollback
Set `BOOKWISE_DAILY_BUDGET_USD=0`.
