# NestJS and Python Implementation Roadmap

> **For agentic workers:** Implement plans in order with
> `superpowers:executing-plans`. Do not start a later plan until the preceding
> acceptance checkpoint is satisfied.

**Goal:** Replace the FastAPI-centric foundation with a NestJS application
backend and Python processing service that use PostgreSQL schemas as their
clean, direct integration boundary.

**Architecture:** Next.js calls NestJS for every user-facing API and business
command. Python consumes durable processing commands, writes generated
book-data records, and emits durable processing events. PostgreSQL schemas and
roles enforce service write ownership.

**Tech Stack:** Next.js, NestJS, Fastify, TypeScript, PostgreSQL, Redis,
S3-compatible storage, Python, SQLAlchemy, Celery, Docker Compose, SQL
migrations.

## Global Constraints

- NestJS is the only public backend API.
- Python owns parsing, model execution, generation, indexing, crawling, and
  seed-data processing.
- NestJS owns authentication, authorization, business commands, manual edits,
  approvals, publications, and frontend projections.
- `app` schema tables are written only by NestJS; `data` schema tables are
  written only by Python.
- Generated summaries are immutable Python records.
- Manual edits and publication pointers are NestJS records; they never
  overwrite generated summaries.
- PostgreSQL is canonical. Redis may notify workers but is never canonical.
- Database migrations are language-neutral SQL files in
  `infrastructure/database/migrations`.
- Do not create or extend unit, integration, or end-to-end tests unless the
  user explicitly requests them.
- Verify implementation with dependency locks, lint, build, compile,
  migrations, schema-drift checks, and manual smoke checks.

## Plan Suite

1. [Replatform Foundation](./2026-08-11-replatform-foundation-plan.md)
2. [NestJS Identity and Library](./2026-08-11-nestjs-identity-library-plan.md)
3. [Python Processing Pipeline](./2026-08-11-python-processing-pipeline-plan.md)
4. [Editable Publication](./2026-08-11-editable-publication-plan.md)
5. [Search and Operations](./2026-08-11-search-operations-plan.md)

## Shared Database Contract

```text
app.processing_commands:
  id, owner_id, book_id, command_type, payload, processing_version,
  status, attempt_count, created_at, claimed_at, completed_at

data.processing_events:
  id, owner_id, book_id, command_id, event_type, payload,
  processing_version, created_at

data.generated_summaries:
  id, owner_id, book_id, source_node_id, generation_version, body,
  citation_data, validation_status, created_at

app.summary_revisions:
  id, owner_id, generated_summary_id, author_id, body, revision_reason,
  citation_status, created_at

app.summary_publications:
  id, owner_id, book_id, active_revision_id, state, approved_by,
  approved_at, published_at
```

NestJS creates and transitions `app.processing_commands`. Python atomically
claims eligible commands, writes `data` artifacts, and appends
`data.processing_events`. NestJS reads event records and data projections; it
does not change Python-owned rows.

## Acceptance Sequence

1. The NestJS API and Python service build independently against the same
   central SQL migration history.
2. An authenticated user can create a private book upload command through
   NestJS.
3. Python can claim the command and persist a complete generated-summary
   version with provenance.
4. NestJS can create manual summary revisions and publish one effective
   revision without changing the generated record.
5. NestJS can serve owner-filtered library, summary, search, and source-reader
   data from `app` and approved `data` projections.
