# Automatic Summary Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically generate a source-linked summary after an uploaded book
is ingested, then let its owner read the accepted immutable summary and source
locations in a focused book-detail view.

**Architecture:** NestJS enqueues paired ingestion and generation commands in
the upload-finalization transaction. The Python worker holds generation until
one normalized source exists, then resolves that source ID into the claimed
command payload without mutating `app` tables. A migration exposes only current
accepted summaries and citation locations through `data` views read by NestJS;
the authenticated web app uses those endpoints for a polling detail route.

**Tech Stack:** Next.js 16, React 19, TypeScript, NestJS 11, PostgreSQL 17,
pgvector, Python 3.12, SQLAlchemy, Zod, Auth0 React SDK, and Lucide React.

**Spec:** `docs/superpowers/specs/2026-09-14-summary-publication-design.md`

## Global Constraints

- Keep NestJS as the only writer to `app.processing_commands`; Python writes
  only Python-owned `data` records.
- Queue `ingest_book` and `regenerate_summary` with processing version `v1`
  during successful upload finalization.
- A generation command is claimable only with exactly one normalized source,
  or after permanent ingestion failure with no normalized source.
- Expose only the current accepted immutable root summary and its ordered
  source-location metadata to the owner.
- Return `404` for another owner's book, a nonexistent book, or a book
  without an accepted summary.
- Do not expose raw source text, provider credentials, embeddings, rejected
  output, validation outcomes, or superseded summaries.
- Do not add or extend automated tests, fixtures, mocks, test dependencies,
  test infrastructure, or CI steps.
- Preserve existing user-authentication, upload, owner-scoping, and
  five-second visible-page polling patterns.
- Do not implement edits, drafts, publication controls, retries, search,
  question answering, section navigation, or model-provider configuration UI.
- Do not modify unrelated user changes already present in the worktree.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `infrastructure/database/migrations/006_create_current_summary_projections.sql` | Owner-filtered read projections for current root summaries and ordered citation locations, plus `app_rw` grants. |
| `infrastructure/database/migrations/007_create_source_document_claim_projection.sql` | Metadata-only source readiness projection for cross-owner `data_rw` command claims. |
| `services/api/src/infrastructure/database/processing-command.repository.ts` | Idempotently enqueue `ingest_book` and `regenerate_summary` commands. |
| `services/api/src/infrastructure/database/book.repository.ts` | Queue the paired commands inside the successful finalization transaction. |
| `services/data/src/bookwise_data/infrastructure/database/command_repository.py` | Gate generation claims on source availability and inject the resolved source-document ID into the in-memory payload. |
| `services/api/src/domain/books/book.ts` | Define read-model types and port method for a published summary. |
| `services/api/src/application/books/get-book-summary.use-case.ts` | Owner-scoped application use case for summary retrieval. |
| `services/api/src/infrastructure/database/book-read.repository.ts` | Read summary/citation projections and prefer summary-generation status. |
| `services/api/src/interfaces/http/summary.controller.ts` | Authenticated `GET /v1/books/:bookId/summary` endpoint. |
| `services/api/src/app.module.ts` | Register the summary controller and use case. |
| `apps/web/src/lib/library-types.ts` | Validate the new summary API response. |
| `apps/web/src/components/book/book-detail-screen.tsx` | Poll summary-aware status and render loading, processing, failure, unavailable, and accepted-summary states. |
| `apps/web/src/app/books/[bookId]/page.tsx` | Resolve the Next.js route parameter and render the detail client component. |
| `apps/web/src/components/library/library-screen.tsx` | Turn library rows into routes to the corresponding book-detail page. |
| `apps/web/src/app/globals.css` | Style links, book-detail states, summary text, and citation rows using existing visual tokens. |

## Task 1: Create Read-Only Current Summary Projections

**Files:**
- Create: `infrastructure/database/migrations/006_create_current_summary_projections.sql`
- Verify: `infrastructure/database/migrate.ps1`

**Interfaces:**
- Consumes: immutable rows in `data.generated_summaries`,
  `data.generated_summary_citations`, `data.source_spans`, and
  `data.structure_nodes`.
- Produces: `data.book_current_summaries` and
  `data.book_current_summary_citations`, both readable by `app_rw`.

- [ ] **Step 1: Add the current root-summary projection**

Create migration `006_create_current_summary_projections.sql` with this view.
The root-node lateral query must match the existing generator's
`min(sequence_number)` root selection.

```sql
CREATE VIEW data.book_current_summaries AS
SELECT
    summary.id,
    summary.owner_id,
    summary.book_id,
    summary.source_document_id,
    summary.source_node_id,
    summary.body,
    summary.generation_version,
    summary.provider,
    summary.model,
    summary.created_at
FROM data.generated_summaries AS summary
JOIN LATERAL (
    SELECT id
    FROM data.structure_nodes
    WHERE source_document_id = summary.source_document_id
    ORDER BY sequence_number
    LIMIT 1
) AS root_node
    ON root_node.id = summary.source_node_id
WHERE summary.validation_status = 'accepted'
    AND summary.superseded_by_id IS NULL;
```

- [ ] **Step 2: Add the ordered citation-location projection and grants**

Append this view and grants to the same migration. Keep source span content out
of both views.

```sql
CREATE VIEW data.book_current_summary_citations AS
SELECT
    summary.id AS generated_summary_id,
    summary.owner_id,
    summary.book_id,
    citation.source_span_id,
    citation.citation_order,
    source_span.location
FROM data.book_current_summaries AS summary
JOIN data.generated_summary_citations AS citation
    ON citation.generated_summary_id = summary.id
    AND citation.owner_id = summary.owner_id
    AND citation.book_id = summary.book_id
    AND citation.source_document_id = summary.source_document_id
JOIN data.source_spans AS source_span
    ON source_span.id = citation.source_span_id
    AND source_span.source_document_id = summary.source_document_id;

GRANT SELECT ON data.book_current_summaries TO app_rw;
GRANT SELECT ON data.book_current_summary_citations TO app_rw;
```

- [ ] **Step 3: Apply the migration to the local database**

Run:

```powershell
pnpm run migrate:local
```

Expected: migration `006_create_current_summary_projections` applies once and
the role grants complete without error.

- [ ] **Step 4: Inspect the projections without exposing source text**

Run:

```powershell
docker compose exec -T postgres psql --dbname=postgresql://bookwise:bookwise@localhost:5432/bookwise_next -c "\d+ data.book_current_summaries"
docker compose exec -T postgres psql --dbname=postgresql://bookwise:bookwise@localhost:5432/bookwise_next -c "\d+ data.book_current_summary_citations"
```

Expected: each view exists; the summary view contains metadata/body columns and
the citation view contains `location` but no `content` column.

- [ ] **Step 5: Commit the migration**

```powershell
git add infrastructure/database/migrations/006_create_current_summary_projections.sql
git commit -m "feat: expose current summary projections"
```

## Task 2: Queue and Safely Claim the Generation Command

**Files:**
- Modify: `services/api/src/infrastructure/database/processing-command.repository.ts`
- Modify: `services/api/src/infrastructure/database/book.repository.ts`
- Modify: `services/data/src/bookwise_data/infrastructure/database/command_repository.py`
- Create: `infrastructure/database/migrations/007_create_source_document_claim_projection.sql`
- Verify: `services/data/src/bookwise_data/domain/commands.py`

**Interfaces:**
- Consumes: `BookRepository.finalizeOwnedUpload`, application command identity
  uniqueness, and `ClaimedCommand.payload`.
- Produces: one idempotent `regenerate_summary` request per finalized book and
  a generation claim payload containing `source_document_id` when exactly one
  source is ready.

- [ ] **Step 1: Generalize the API command repository around one private enqueue helper**

In `processing-command.repository.ts`, add a command-type union and a private
helper that preserves the existing conflict key and returns the existing
`QueuedProcessingCommand` shape.

```ts
type EnqueueableCommandType = "ingest_book" | "regenerate_summary";

private async enqueue(
  client: PoolClient,
  input: {
    ownerId: string;
    bookId: string;
    commandType: EnqueueableCommandType;
  },
): Promise<QueuedProcessingCommand> {
  const result = await client.query<ProcessingCommandRow>(
    `INSERT INTO app.processing_commands (
       owner_id, book_id, command_type, processing_version
     )
     VALUES ($1, $2, $3, 'v1')
     ON CONFLICT (command_type, book_id, processing_version)
     DO UPDATE SET updated_at = app.processing_commands.updated_at
     RETURNING id, status`,
    [input.ownerId, input.bookId, input.commandType],
  );

  return {
    commandId: result.rows[0].id,
    commandStatus: result.rows[0].status,
  };
}
```

Make `enqueueIngest` delegate with `"ingest_book"`, and add
`enqueueRegenerateSummary` that delegates with `"regenerate_summary"`.

- [ ] **Step 2: Queue both commands in the finalization transaction**

In `BookRepository.finalizeOwnedUpload`, retain the existing upload/object
state updates. Immediately after `enqueueIngest`, enqueue generation with the
same owner and book before committing. Continue returning the ingestion command
to preserve the finalized-upload HTTP contract.

```ts
const command = await this.processingCommands.enqueueIngest(client, {
  ownerId: input.ownerId,
  bookId: input.bookId,
});
await this.processingCommands.enqueueRegenerateSummary(client, {
  ownerId: input.ownerId,
  bookId: input.bookId,
});

await client.query("COMMIT");
return command;
```

- [ ] **Step 3: Add the source-claim metadata projection**

Create `007_create_source_document_claim_projection.sql`:

```sql
CREATE VIEW data.book_source_document_claim_state AS
SELECT
    owner_id,
    book_id,
    count(*) AS source_document_count,
    (array_agg(id ORDER BY id))[1] AS source_document_id
FROM data.source_documents
GROUP BY owner_id, book_id;

GRANT SELECT ON data.book_source_document_claim_state TO data_rw;
```

The view returns no source text. It lets the cross-owner worker assess source
readiness without setting one transaction-wide RLS owner context before
claiming a batch.

- [ ] **Step 4: Gate generation rows in the Python claim query**

In `_CLAIM_CANDIDATES` in `command_repository.py`, join the source-claim
projection and add the ingestion-run lateral join:

```sql
LEFT JOIN data.book_source_document_claim_state AS source
    ON source.owner_id = command.owner_id
    AND source.book_id = command.book_id
LEFT JOIN LATERAL (
    SELECT run.status
    FROM app.processing_commands AS ingest_command
    JOIN data.processing_runs AS run
        ON run.command_id = ingest_command.id
        AND run.processing_version = ingest_command.processing_version
    WHERE ingest_command.owner_id = command.owner_id
        AND ingest_command.book_id = command.book_id
        AND ingest_command.command_type = 'ingest_book'
        AND ingest_command.processing_version = command.processing_version
    ORDER BY run.updated_at DESC
    LIMIT 1
) AS ingest_run ON TRUE
```

Change the selected payload expression so only a ready generation command gets
an in-memory resolved source identity:

```sql
CASE
    WHEN command.command_type = 'regenerate_summary'
        AND source.source_document_count = 1
    THEN command.payload || jsonb_build_object(
        'source_document_id',
        source.source_document_id::text
    )
    ELSE command.payload
END AS payload
```

Add the following predicate alongside the existing command-run eligibility:

```sql
AND (
    command.command_type <> 'regenerate_summary'
    OR source.source_document_count = 1
    OR (
        COALESCE(source.source_document_count, 0) = 0
        AND ingest_run.status = 'permanent_failed'
    )
)
```

This leaves generation queued during ingestion and retryable ingestion
failures. It allows the existing `GenerateSummary.handle` missing-source path
to produce a terminal generation failure after permanent ingestion failure.

- [ ] **Step 5: Confirm no domain-record change is necessary**

Review `ClaimedCommand` in `domain/commands.py`. Its immutable
`payload: Mapping[str, Any]` already carries the resolved
`source_document_id`; do not add a duplicate field or persist this derived
value back into `app.processing_commands`.

- [ ] **Step 6: Compile both services**

Run:

```powershell
pnpm run build:api
pnpm run compile:data
```

Expected: TypeScript and Python compile successfully.

- [ ] **Step 7: Commit command orchestration**

```powershell
git add infrastructure/database/migrations/007_create_source_document_claim_projection.sql services/api/src/infrastructure/database/processing-command.repository.ts services/api/src/infrastructure/database/book.repository.ts services/data/src/bookwise_data/infrastructure/database/command_repository.py
git commit -m "feat: queue summary generation after ingestion"
```

## Task 3: Expose the Owner-Scoped Summary API

**Files:**
- Modify: `services/api/src/domain/books/book.ts`
- Create: `services/api/src/application/books/get-book-summary.use-case.ts`
- Modify: `services/api/src/infrastructure/database/book-read.repository.ts`
- Create: `services/api/src/interfaces/http/summary.controller.ts`
- Modify: `services/api/src/app.module.ts`

**Interfaces:**
- Consumes: `data.book_current_summaries`,
  `data.book_current_summary_citations`, and authenticated `AuthPrincipal`.
- Produces: `GET /v1/books/:bookId/summary` with `{ bookId, summary }` or
  `404`; summary-aware `GET /v1/books/:bookId/processing`.

- [ ] **Step 1: Define the summary read model and port**

Add these types to `domain/books/book.ts` and add
`getPublishedSummary(ownerId, bookId)` to `BookReadRepository`.

```ts
export interface SummaryCitation {
  sourceSpanId: string;
  order: number;
  location: Record<string, unknown>;
}

export interface PublishedSummary {
  id: string;
  body: string;
  generationVersion: string;
  provider: string;
  model: string;
  createdAt: string;
  citations: SummaryCitation[];
}

export interface BookSummary {
  bookId: string;
  summary: PublishedSummary;
}
```

- [ ] **Step 2: Add the application use case**

Create `application/books/get-book-summary.use-case.ts`:

```ts
import type { BookReadRepository, BookSummary } from "../../domain/books/book";

export class GetBookSummaryUseCase {
  constructor(private readonly books: BookReadRepository) {}

  execute(ownerId: string, bookId: string): Promise<BookSummary | undefined> {
    return this.books.getPublishedSummary(ownerId, bookId);
  }
}

export const GET_BOOK_SUMMARY_USE_CASE = Symbol("GetBookSummaryUseCase");
```

- [ ] **Step 3: Read and assemble the projection rows**

In `BookReadRepository`, add typed row interfaces for current-summary and
citation rows. Query the summary view with both ownership fields:

```sql
SELECT
  id, book_id, body, generation_version, provider, model, created_at
FROM data.book_current_summaries
WHERE owner_id = $1
  AND book_id = $2
ORDER BY created_at DESC, id DESC
LIMIT 1
```

Return `undefined` if this query finds no row. Otherwise query ordered
citations:

```sql
SELECT source_span_id, citation_order, location
FROM data.book_current_summary_citations
WHERE owner_id = $1
  AND book_id = $2
  AND generated_summary_id = $3
ORDER BY citation_order
```

Map PostgreSQL names to the `BookSummary` camel-case contract. Accept only
JSON object locations; throw an ordinary repository error if the database
returns a non-object value rather than serializing unexpected content.

- [ ] **Step 4: Make processing status prefer generation when present**

In the existing processing-status lateral query, preserve owner and book
filters but order commands so the paired summary command is selected first:

```sql
ORDER BY
  CASE command.command_type
    WHEN 'regenerate_summary' THEN 0
    ELSE 1
  END,
  command.created_at DESC,
  command.id DESC
LIMIT 1
```

This keeps the existing status response shape while making it describe the
stage that controls summary availability.

- [ ] **Step 5: Add the authenticated HTTP controller**

Create `interfaces/http/summary.controller.ts`. Reuse
`AuthenticatedPrincipalGuard`, `CurrentPrincipal`, and the UUID parameter
validator pattern used by `LibraryController`.

```ts
@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1/books")
export class SummaryController {
  constructor(
    @Inject(GET_BOOK_SUMMARY_USE_CASE)
    private readonly getBookSummary: GetBookSummaryUseCase,
  ) {}

  @Get(":bookId/summary")
  async get(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
  ) {
    const summary = await this.getBookSummary.execute(
      principal.userId,
      params.bookId,
    );

    if (!summary) {
      throw new NotFoundException();
    }

    return summary;
  }
}
```

- [ ] **Step 6: Register the controller and use case**

In `app.module.ts`, add `SummaryController` to `controllers`. Add
`GET_BOOK_SUMMARY_USE_CASE` with a factory receiving `BookReadRepository` via
`BOOK_READ_REPOSITORY`, matching the existing list-library and processing
providers.

- [ ] **Step 7: Run static API verification**

Run:

```powershell
pnpm run lint:api
pnpm run build:api
```

Expected: both commands finish successfully.

- [ ] **Step 8: Commit the API read path**

```powershell
git add services/api/src/domain/books/book.ts services/api/src/application/books/get-book-summary.use-case.ts services/api/src/infrastructure/database/book-read.repository.ts services/api/src/interfaces/http/summary.controller.ts services/api/src/app.module.ts
git commit -m "feat: expose accepted book summaries"
```

## Task 4: Add the Book Detail Experience

**Files:**
- Modify: `apps/web/src/lib/library-types.ts`
- Create: `apps/web/src/components/book/book-detail-screen.tsx`
- Create: `apps/web/src/app/books/[bookId]/page.tsx`
- Modify: `apps/web/src/components/library/library-screen.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: authenticated `bookwiseApi`, the existing processing endpoint, and
  `GET /v1/books/:bookId/summary`.
- Produces: a route that presents processing progress or a current accepted
  immutable summary with ordered source locations.

- [ ] **Step 1: Add validated summary response types**

In `library-types.ts`, add `SummaryCitation`, `PublishedSummary`, and
`BookSummary` interfaces plus schemas. Use `z.record(z.string(), z.unknown())`
for location metadata and require positive citation order.

```ts
export const bookSummarySchema: z.ZodType<BookSummary> = z.object({
  bookId: z.string().uuid(),
  summary: z.object({
    id: z.string().uuid(),
    body: z.string().min(1),
    generationVersion: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    createdAt: z.string().datetime(),
    citations: z.array(
      z.object({
        sourceSpanId: z.string().uuid(),
        order: z.number().int().positive(),
        location: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
});
```

- [ ] **Step 2: Create the route wrapper**

Create `app/books/[bookId]/page.tsx` as a server route wrapper. Resolve the
Next.js 16 asynchronous parameter and hand the UUID string to a client
component without fetching a bearer-protected API route on the server.

```tsx
import { BookDetailScreen } from "../../../components/book/book-detail-screen";

export default async function BookPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  return <BookDetailScreen bookId={bookId} />;
}
```

- [ ] **Step 3: Implement the client detail state machine**

Create `components/book/book-detail-screen.tsx` with `"use client"`. Define
these exclusive states:

```ts
type DetailState =
  | { kind: "loading" }
  | { kind: "processing"; status: BookProcessingStatus }
  | { kind: "ready"; summary: BookSummary }
  | { kind: "failed"; status: BookProcessingStatus }
  | { kind: "unavailable" }
  | { kind: "error" };
```

Use `getAccessTokenSilently` and `bookwiseApi` to request
`/v1/books/${bookId}/processing`. Interpret `runStatus === "completed"` as a
summary fetch trigger; interpret `runStatus === "permanent_failed"` as a
terminal failure; all other successful statuses remain processing. When the
summary fetch rejects after completion, enter `unavailable`; when the status
fetch rejects, enter `error`.

Poll only in the processing state, immediately and every five seconds while
the document is visible. Clear the interval and visibility listener during
cleanup. Render an accessible status or alert for every non-ready state.

For the ready state, render the summary body in semantic paragraphs and an
ordered citation list. Format a citation location with an
`Object.entries(location)` helper that joins primitive values as
`"key: value"` and falls back to `"Source location available"` for an empty
object; do not stringify unknown nested data into a large block.

- [ ] **Step 4: Link library rows to their book detail pages**

In `library-screen.tsx`, import `Link` from `next/link`. Preserve the existing
row metadata/status content but wrap it in:

```tsx
<Link className="book-row book-row-link" href={`/books/${book.id}`}>
  {/* existing .book-details and .book-meta content */}
</Link>
```

Keep `<li>` as the list item and make the link the row's sole interactive
target. Do not add per-row buttons or a competing navigation control.

- [ ] **Step 5: Add scoped detail and link styles**

Append styles to `globals.css` that:

- remove the default text decoration from `.book-row-link` while preserving
  inherited text colors;
- provide a visible keyboard focus outline on `.book-row-link:focus-visible`;
- use unframed, bordered content bands for `.book-detail-state`,
  `.book-summary`, and `.citation-list`;
- keep summary text readable with a bounded line length;
- stack detail metadata and citations below 640px without overflow.

Use existing palette values such as `#146c4c`, `#c8d0ca`, `#52645a`,
`#8d2a22`, and `#d8e8f2`. Keep all new radii at 8px or less.

- [ ] **Step 6: Run web static verification**

Run:

```powershell
pnpm run lint:web
pnpm --dir apps/web build
```

Expected: lint and production build complete successfully.

- [ ] **Step 7: Commit the book-detail UI**

```powershell
git add apps/web/src/lib/library-types.ts apps/web/src/components/book/book-detail-screen.tsx apps/web/src/app/books/[bookId]/page.tsx apps/web/src/components/library/library-screen.tsx apps/web/src/app/globals.css
git commit -m "feat: show generated book summaries"
```

## Task 5: Verify the Vertical Slice and Audit Documentation

**Files:**
- Verify: `README.md`
- Verify: `docs/project-timeline.md`
- Verify: `docs/superpowers/plans/2026-09-07-bookwise-obsidian-vault-plan.md`

**Interfaces:**
- Consumes: the migrations, paired command orchestration, summary endpoint, and
  book-detail route from Tasks 1-4.
- Produces: recorded evidence that the supported local path works, plus a
  clear request to update documentation affected by the delivered behavior.

- [ ] **Step 1: Run repository static checks**

Run:

```powershell
pnpm run migrate:local
pnpm run compile:data
pnpm run lint:api
pnpm run build:api
pnpm run lint:web
pnpm --dir apps/web build
```

Expected: every command succeeds. Do not create new test files or alter test
tooling if an existing check fails; investigate and fix only implementation
issues in the changed production files.

- [ ] **Step 2: Run the local worker acceptance path**

Start the configured local services:

```powershell
docker compose up -d
pnpm run dev:api
pnpm run dev:web
uv run --project services/data python -m bookwise_data.workers.main
```

With configured Auth0 and model-provider values, sign in as an invited user,
upload one supported book, and rerun the bounded worker command as needed.
Confirm in order:

1. Finalization creates one `ingest_book` and one `regenerate_summary` command.
2. Generation is not claimed before a normalized source exists.
3. Ingestion writes the normalized source and generation completes or reports
   a visible retryable/permanent state.
4. The library row opens `/books/<bookId>`.
5. The owner sees an accepted summary and ordered location-only citations
   after completion.
6. A second user cannot read the first user's summary.

- [ ] **Step 3: Compare delivered behavior with project documentation**

Do not edit project documentation automatically. Report that these documents
need updates because they describe an older pipeline state:

- `README.md`: local workflow should explain automatic generation and the
  accepted-summary read path.
- `docs/project-timeline.md`: should record the automatic summary-publication
  milestone.
- `docs/superpowers/plans/2026-09-07-bookwise-obsidian-vault-plan.md`: must be
  corrected before execution because it marks implemented ingestion and
  generation behavior as planned.

Ask the user whether they want the documentation updated in a separate,
explicitly approved task.

- [ ] **Step 4: Commit only requested documentation updates**

Only after the user explicitly approves documentation changes, stage the
specific approved files and commit them separately:

```powershell
git add README.md docs/project-timeline.md docs/superpowers/plans/2026-09-07-bookwise-obsidian-vault-plan.md
git commit -m "docs: record summary publication workflow"
```

## Plan Acceptance Checkpoint

The implementation is ready for review only when:

- A finalized upload idempotently has both application commands.
- A generation command cannot race missing or retrying source ingestion.
- A permanently failed ingestion produces a terminal generation result instead
  of an indefinitely queued summary command.
- The API selects only the owner’s current accepted root summary and exposes
  ordered source locations without raw source text.
- Processing status reports the generation stage after the paired command
  exists.
- The book detail route communicates processing, permanent failure,
  unavailable output, and ready output distinctly.
- Existing static checks pass and a configured local owner-only browser path
  has been exercised.
