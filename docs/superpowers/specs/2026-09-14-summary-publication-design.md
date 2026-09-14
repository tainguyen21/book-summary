# Automatic Summary Publication Design

Status: Approved
Date: September 14, 2026

## Purpose

Complete the first user-visible Bookwise outcome after upload: an uploaded
book is ingested, its evidence-linked summary is generated automatically, and
the signed-in owner can read the accepted immutable result with its source
locations.

This is a read-only delivery slice. It does not introduce manual edits,
drafts, publish/unpublish controls, retries, outline navigation, search,
question answering, or model-provider configuration UI.

## Current State

The existing system already has the core data capabilities:

- NestJS creates an `ingest_book` command when an upload is finalized.
- The Python worker ingests supported private objects into normalized source
  documents, spans, and structure nodes.
- The Python worker can process a `regenerate_summary` command and persist
  immutable accepted evidence, summaries, citations, embeddings, and
  validation outcomes.
- The web library displays private books and polls a processing-status
  projection.

The missing product path is orchestration and presentation. NestJS does not
currently queue a summary-generation command, the worker has no prerequisite
gate for that command, the API does not expose accepted summaries, and the
web application has no detail view.

## Goals

1. Queue summary generation automatically for every successfully finalized
   upload.
2. Prevent a summary command from running until its book has one normalized
   source document.
3. Preserve NestJS ownership of `app.processing_commands`; Python continues
   to write only `data` records.
4. Expose the current accepted summary and citation locations only to its
   owner.
5. Show a book-detail state for processing, terminal failure, and an accepted
   summary without falsely presenting missing output as complete.

## Non-Goals

- Editable publication revisions, drafts, approval, or publish/unpublish
  state.
- Retry controls or administrator workflows.
- Section outlines, hierarchical summary navigation, search, or question
  answering.
- New provider-selection, consent, or cost-management interfaces.
- New automated test files or test infrastructure.

## Architecture

### Paired Commands

During successful upload finalization, NestJS creates two immutable
application commands in the same database transaction:

```text
ingest_book v1
regenerate_summary v1
```

Both commands are owner- and book-scoped. The existing unique command identity
keeps repeated finalization requests idempotent.

NestJS remains the only writer to the `app` schema. The Python worker does not
enqueue, update, or otherwise mutate application commands.

### Claim Eligibility

The Python command-claim query continues to claim `ingest_book` commands
normally. A `regenerate_summary` command is claimable only when one of these
conditions is true:

1. Exactly one normalized `data.source_documents` row exists for the command's
   owner and book. The command is ready to generate.
2. The matching ingestion command has a permanent failed run and no normalized
   source exists. The command is claimed so the existing summary handler can
   record the terminal `missing_normalized_source` outcome.

While ingestion is running or retryable and no normalized source exists,
generation remains queued. This avoids racing ingestion across separate worker
processes and avoids turning temporary ingestion failures into premature
generation failures.

The generation claim includes the resolved source-document identifier in the
in-memory command payload. `GenerateSummary` therefore generates against the
specific source that satisfied eligibility rather than relying on an
ambiguous-book fallback.

### Current Summary Projection

Add a read-only `data` projection for current accepted summaries. It follows
the existing `data.book_processing_status` approach:

- The projection contains the summary identity, owner ID, book ID, body,
  provider, model, generation version, and creation timestamp.
- Citation rows expose citation order and source location metadata by joining
  the accepted summary to its summary-citation and source-span records.
- It exposes no raw book text and no provider credentials.
- The migration grants `SELECT` on this projection to `app_rw`, instead of
  granting NestJS direct access to generated tables.

The NestJS repository always filters the projection by both `owner_id` and
`book_id`. A nonexistent book, another owner's book, and a book without an
accepted summary all resolve as not found to the summary endpoint.

### Processing Status

The existing book processing-status read becomes summary-aware. When a
`regenerate_summary` command exists, the query selects that command's
projection; otherwise it continues to report ingestion status. This makes the
book-detail page reflect the stage that controls availability of the
user-visible result.

## API Contract

Add an authenticated endpoint:

```text
GET /v1/books/:bookId/summary
```

It returns `404` until an accepted current summary exists or when the caller
does not own the book. A successful response has this shape:

```json
{
  "bookId": "UUID",
  "summary": {
    "id": "UUID",
    "body": "Accepted generated summary text",
    "generationVersion": "v1",
    "provider": "openai",
    "model": "configured-model",
    "createdAt": "2026-09-14T00:00:00.000Z",
    "citations": [
      {
        "sourceSpanId": "UUID",
        "order": 1,
        "location": {
          "page": 42
        }
      }
    ]
  }
}
```

`location` uses the existing normalized source-location metadata. It is
returned as structured JSON and is not constructed by parsing display strings
in the API or browser.

The endpoint intentionally returns only the accepted current summary. It does
not expose rejected candidates, validation outcomes, embeddings, historic
superseded summaries, or raw source spans.

## Web Experience

Add a client-side route at:

```text
/books/[bookId]
```

Library rows navigate to this route.

The route loads owner-scoped processing status first:

- While work is queued, running, or retryable, it displays a processing state
  and polls at the existing five-second cadence when the document is visible.
- On a completed generation run, it requests the summary endpoint and renders
  the accepted body and ordered citation locations.
- On a permanent failure, it renders a terminal processing-failure state.
- A summary `404` after a reported completed status is displayed as a
  recoverable unavailable state rather than as an empty summary.

The detail screen uses the existing authenticated API helper and Zod schemas.
It uses the existing visual language and does not add a separate publication
dashboard or nested card layout.

## Error Handling

The existing worker rules remain authoritative:

- `PermanentProcessingError` records a permanent run failure and a durable,
  safe event.
- Other worker exceptions record retryable failures.
- Loss of a processing lease prevents stale work from being completed.
- Generated evidence, summary, citation, and embedding records retain their
  immutable and owner-scoped persistence rules.

The new generation eligibility gate has one additional terminal path: when
ingestion is permanently failed without producing a source document,
generation is deliberately claimed and fails with
`missing_normalized_source`. This prevents an orphaned queued command from
leaving the user-facing status indefinitely pending.

No sensitive source text, provider API key, or provider request payload is
returned from the API or written into new UI messages.

## Data Flow

```text
Browser finalizes upload
  -> NestJS marks the object uploaded and book queued
  -> NestJS enqueues ingest_book and regenerate_summary
  -> Python claims ingest_book
  -> Python creates normalized source records
  -> Python claims eligible regenerate_summary
  -> Python persists accepted evidence, citations, embeddings, and summary
  -> Browser detail page reads summary-aware processing status
  -> Browser fetches and renders accepted summary with source locations
```

## Implementation Areas

- `services/api/src/infrastructure/database/processing-command.repository.ts`
  and `book.repository.ts`: enqueue paired commands transactionally.
- `services/data/src/bookwise_data/infrastructure/database/command_repository.py`:
  implement generation prerequisite eligibility and resolved source identity.
- `services/data/src/bookwise_data/domain/commands.py` and generation
  application wiring: carry the resolved source-document identifier through a
  claimed generation command.
- `infrastructure/database/migrations/`: add the owner-filtered current
  summary projection and `app_rw` read grant.
- `services/api/src/domain/books/`, application use cases, database read
  repository, controller, and module: expose the summary read contract and
  summary-aware processing status.
- `apps/web/src/app/books/[bookId]/`, library components, API schemas, and
  styles: add navigation and the read-only book-detail experience.

## Verification

Do not add new automated tests under the repository guidance. Verify the
implemented slice with existing checks:

```text
pnpm run lint:web
pnpm run lint:api
pnpm run build:api
pnpm run compile:data
pnpm run migrate:local
```

Then run the local services with configured private storage, Auth0, and model
provider settings. In an authenticated browser session:

1. Upload one supported book.
2. Confirm the ingestion command runs and creates normalized source records.
3. Confirm generation remains pending until source normalization is available.
4. Confirm generation reaches completed or a visible terminal/retryable
   status.
5. Open the book detail route and confirm the accepted summary and ordered
   source locations are visible only to its owner.

## Documentation Impact

After implementation, update `README.md` and `docs/project-timeline.md` to
describe the automatic generation and read-only summary path. The existing
Obsidian-vault plan also requires revision before it is executed because it
currently treats ingestion and generation as future work.
