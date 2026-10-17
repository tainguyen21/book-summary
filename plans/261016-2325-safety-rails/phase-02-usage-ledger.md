---
phase: 2
title: Usage capture and token/cost ledger
status: pending
effort: 1.5d
dependsOn: [phase-01, migration branch claude/admiring-bhabha-884c6b merged]
---

# Phase 2 — Usage capture and ledger

## Context
- `infrastructure/providers/model_provider.py` calls Vertex `generate_content` / `embed_content` and the OpenAI-compatible HTTP API, then discards the response's usage metadata.
- `data` tables use row-level security keyed on `current_setting('bookwise.owner_id')` (migrations 003/004). Repositories call `set_owner_context` before writing.
- The API reads `data` only through views granted to `app_rw` inside migrations (see migration 006, `GRANT SELECT ON data.book_current_summaries TO app_rw`).
- The model-migration branch also edits `model_provider.py`, so start this phase after it merges.

## Requirements
- Every successful provider call records one usage row with:
  - operation: `evidence`, `summary`, or `embedding`
  - provider and model
  - input tokens and output tokens (0 for embeddings)
  - estimated cost in USD
- Rows are written even when the run later fails, so wasted spend stays visible.
- Prices come from `BOOKWISE_MODEL_PRICING_JSON`: a mapping of model to `{"input_per_mtok": number, "output_per_mtok": number}`. A missing model costs 0 and logs a `pricing_missing` warning once per model.
- Global daily spend is readable by the worker without bypassing row-level security for row data.

## Design
- **Provider hook:** add an optional `usage_sink: Callable[[ModelUsage], None] | None` attribute to both providers, settable after construction so `provider_from_environment()` keeps its signature. Read the counts:
  - Vertex generate: `response.usage_metadata.prompt_token_count` and `candidates_token_count`.
  - Vertex embed: `response.metadata.billable_character_count` if present, otherwise the token statistics. Confirm the field name against the installed `google-genai` version.
  - OpenAI-compatible: `data["usage"]["prompt_tokens"]` and `completion_tokens`.
- **Domain:** a frozen `ModelUsage` dataclass in a new `domain/usage.py`, alongside `estimate_cost(usage, pricing)`.
- **Persistence:** a new `infrastructure/database/usage_repository.py` with `record(owner_id, book_id, command_id, usage)`. Each insert runs in its own short transaction that sets the owner context.
- **Wiring:** `application/generate_summary.py` sets `provider.usage_sink` right after `self._provider_factory()`, bound to the current command's ids.

## Migration `infrastructure/database/migrations/008_create_model_usage.sql`
- **Table `data.model_usage`:**
  - `id uuid pk default gen_random_uuid()`
  - `owner_id uuid not null`, `book_id uuid not null`, `command_id uuid not null`
  - `operation text check (operation in ('evidence','summary','embedding'))`
  - `provider text`, `model text`
  - `input_tokens int >= 0`, `output_tokens int >= 0`
  - `estimated_cost_usd numeric(12,6) >= 0`
  - `created_at timestamptz default clock_timestamp()`
- **Index:** `(created_at)` and `(owner_id, created_at)`.
- **Row-level security:** enable it, with an owner policy matching the 003/004 style.
- **Global total:** `data.model_usage_spent_since(since timestamptz) returns numeric`, declared `SECURITY DEFINER` with `SET search_path = data, pg_temp`. It returns only the sum. Grant `EXECUTE` to `data_rw`.
- **API view:** `data.book_model_usage_daily` (owner_id, day in UTC, tokens, cost) with `GRANT SELECT ... TO app_rw`. Filtering by owner happens in the API query, like the summary views.
- **Grants:** `data_rw` gets `INSERT, SELECT` on the table (no `UPDATE`/`DELETE`), following the immutability style in `roles/data_rw.sql`.

## Steps
1. Back up the local DB: `docker exec testing-postgres-1 pg_dump -U bookwise -d bookwise_next -Fc > <scratch>/pre-008.dump`.
2. Write migration 008; apply it with `pnpm run migrate:local`. This needs `pwsh`; otherwise apply the file with `psql` in the container, using the same order as `migrate.ps1`.
3. Implement the domain, provider hook, repository, and wiring.
4. Add `BOOKWISE_MODEL_PRICING_JSON` to `.env.example`, the GCP runtime ConfigMap, and README's Vertex section. Prices are placeholders the user confirms from the official pricing page.
5. Run the worker on one small TXT book and inspect `data.model_usage`.

## Validation
- `select operation, count(*), sum(input_tokens), sum(estimated_cost_usd) from data.model_usage group by 1;` shows evidence, summary, and embedding rows for the test book.
- `select data.model_usage_spent_since(now() - interval '1 day');` matches the row sum.
- `app_rw` can select the view but not the table.
- The existing Python checks pass.

## Risks
- The usage-metadata field names differ between SDK versions. Read them defensively; missing counts become 0 with a single warning.
- Production rollout applies 008 through the existing migration Job before the worker starts, per `cc02451`'s migration gate.

## Rollback
The worker tolerates a missing sink. Leave the table in place; dropping it requires a new down migration plus a backup.
