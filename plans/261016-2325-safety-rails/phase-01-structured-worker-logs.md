---
phase: 1
title: Structured worker logs
status: completed
effort: 0.5d
dependsOn: []
---

# Phase 1 — Structured worker logs

## Context
The Python worker (`services/data/src/bookwise_data/workers/`) writes no logs at all. The agent handoff notes that empty worker logs prove nothing, so operators have to inspect the database to know what happened. GKE ships container stdout to Cloud Logging, which parses one JSON object per line and maps a `severity` field.

## Requirements
- One JSON object per line on stdout. Fields:
  - `severity` (`DEBUG`, `INFO`, `WARNING`, or `ERROR`)
  - `message`
  - `event`
  - `timestamp` (UTC, ISO 8601)
  - context: `command_id`, `book_id`, `run_id`, `command_type`, `processing_version` when known
- Use the standard-library `logging` module only; no new dependency.
- Log level from `BOOKWISE_LOG_LEVEL`, default `INFO`.
- **Never log:** access tokens, signed URLs, object keys, filenames, titles, book text, provider prompts or outputs, or raw exception messages. Log the error class and the existing error code only. This matches the existing upload-diagnostics rule in `docs/agent-handoff.md`.

## Events

| Event | Where | Level |
| --- | --- | --- |
| `worker_started` (batch limit, poll interval, provider name, generation model) | `bootstrap.run_worker` | INFO |
| `worker_stopping` (signal received) | signal handler / loop exit | INFO |
| `command_claimed` | `CommandWorker.run_once` per claimed command | INFO |
| `lease_lost` | heartbeat returns False before handling | WARNING |
| `command_completed` (duration_ms) | after `complete` | INFO |
| `command_failed` (retryable or permanent, error_class, error_code, duration_ms) | the two except branches | WARNING / ERROR |
| `batch_idle` | `processed == 0` | DEBUG |

## Files
- **Create** `services/data/src/bookwise_data/workers/logging_setup.py`: a `JsonFormatter` and `configure_logging()`, plus a helper that accepts extra context through `logger.info(..., extra={"context": {...}})`.
- **Modify** `workers/bootstrap.py`: call `configure_logging()` first; log start and stop.
- **Modify** `workers/command_worker.py`: per-command events with `time.monotonic()` durations. Reuse `_error_code` from `application/claim_command.py` by making it importable (it's currently a module-private helper; expose it as `error_code`).

## Steps
1. Write `logging_setup.py` (about 50 lines): the formatter serializes `record.context` and drops anything not on an allowed list of context keys.
2. Wire it into `bootstrap.py` and `command_worker.py`.
3. Run the worker locally against the running Docker stack; process one book; check the JSON lines with `| jq .`.

## Validation
- The `uv run --project services/data` existing lint/test command (see `docs/new-device-setup.md`) passes.
- Local run shows `worker_started`, `command_claimed`, and `command_completed` for one book, with matching `command_id`.
- `grep -i` over the captured log for the test filename and its first summary sentence returns nothing.

## Risks
- Logging inside the claim transaction must not block it. Log only after transactions commit.

## Rollback
Remove the `configure_logging()` call. Nothing else depends on the logs.
