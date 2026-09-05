# SPA Private Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver direct private-book uploads and an owner-scoped queued library
for the Auth0 React SPA.

**Architecture:** Browser code obtains Auth0 API tokens through the existing
client helper and calls guarded NestJS endpoints directly. NestJS owns books,
objects, commands, and S3 presigning; the browser PUTs bytes directly to
private MinIO/S3. The web library reads only caller-owned data and treats
finalized books as queued until Python processing exists.

**Tech Stack:** Next.js 16, React 19, TypeScript, Auth0 React SDK, NestJS 11,
Fastify, PostgreSQL, MinIO/S3, AWS SDK v3, Zod.

**Spec:** `docs/superpowers/specs/2026-09-05-spa-private-library-design.md`

## Global Constraints

- Do not modify `001_create_initial_schema.sql`.
- Support only PDF, EPUB, DOCX, and TXT, with an authoritative 100 MiB limit.
- Browser code sends Auth0 tokens only in direct bearer requests to
  `NEXT_PUBLIC_API_URL`; never log, render, persist, or proxy them.
- NestJS is the only writer to `app` schema tables and never writes `data`
  schema tables.
- Every book, object, command, and read query is filtered by owner ID;
  missing and cross-owner books return `404`.
- Objects stay private; PUT URLs last 600 seconds, contain server-generated
  keys, and require the exact ticket content type.
- MinIO allows only `http://localhost:3000`, `PUT`/`HEAD`, and
  `content-type`; it permits no public reads, credentials, wildcards, or
  broad request headers.
- Finalized books remain `queued`; do not implement Python claiming,
  processing, or simulated completion.
- Do not create or modify automated tests, fixtures, mocks, or test
  infrastructure.
- Preserve unrelated worktree changes.

---

## File Structure

```text
infrastructure/
  database/migrations/002_create_app_data_projections.sql
  storage/minio-cors.json

services/api/src/
  application/books/
    create-upload.use-case.ts
    finalize-upload.use-case.ts
    get-book-status.use-case.ts
    list-library.use-case.ts
  domain/books/book.ts
  infrastructure/database/
    book-read.repository.ts
    book.repository.ts
    processing-command.repository.ts
  infrastructure/storage/s3-object-storage.ts
  interfaces/http/
    books.controller.ts
    library.controller.ts
  app.module.ts
  main.ts

apps/web/src/
  app/
    globals.css
    layout.tsx
    page.tsx
  components/library/
    library-screen.tsx
    upload-dialog.tsx
  lib/
    bookwise-api.ts
    library-types.ts
```

### Task 1: Provision Private Local Object Storage

**Files:**
- Modify: `services/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docker-compose.yml`
- Create: `infrastructure/storage/minio-cors.json`
- Modify: `services/api/src/main.ts`

**Interfaces:**
- Produces: AWS SDK v3 imports for the API, a private `bookwise` MinIO bucket,
  browser PUT/HEAD CORS, and direct API CORS for authenticated `GET` requests.

- [ ] **Step 1: Add S3-compatible API dependencies**

Run:

```powershell
pnpm --filter @bookwise/api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Expected: `services/api/package.json` lists both packages and
`pnpm-lock.yaml` reflects the resolved graph.

- [ ] **Step 2: Define the bucket CORS policy**

Create `infrastructure/storage/minio-cors.json`:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3000
  }
]
```

- [ ] **Step 3: Initialize the private bucket in Compose**

Add this service to `docker-compose.yml` beside `minio`:

```yaml
  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
      S3_BUCKET: bookwise
    volumes:
      - ./infrastructure/storage/minio-cors.json:/config/minio-cors.json:ro
    entrypoint:
      - /bin/sh
      - -c
      - >-
        mc alias set local http://minio:9000 "$$MINIO_ROOT_USER" "$$MINIO_ROOT_PASSWORD"
        && mc mb --ignore-existing "local/$$S3_BUCKET"
        && mc cors set "local/$$S3_BUCKET" /config/minio-cors.json
```

Do not add an anonymous bucket policy.

- [ ] **Step 4: Permit authenticated library GET requests**

In `services/api/src/main.ts`, replace the existing `methods` value with:

```ts
methods: ["GET", "POST", "OPTIONS"],
```

Keep the existing fixed origin, allowed headers, and `credentials: false`.

- [ ] **Step 5: Verify storage configuration**

Run:

```powershell
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
docker compose config
docker compose up -d minio minio-init
docker compose logs minio-init
```

Expected: API checks pass, Compose validates, and `minio-init` exits
successfully after creating/configuring the private bucket.

- [ ] **Step 6: Commit storage setup**

```powershell
git add services/api/package.json pnpm-lock.yaml docker-compose.yml infrastructure/storage services/api/src/main.ts
git commit -m "feat: provision private upload storage"
```

### Task 2: Add Authenticated Upload Creation And Finalization APIs

**Files:**
- Modify: `services/api/src/domain/books/book.ts`
- Create: `services/api/src/infrastructure/storage/s3-object-storage.ts`
- Create: `services/api/src/infrastructure/database/book.repository.ts`
- Create: `services/api/src/infrastructure/database/processing-command.repository.ts`
- Create: `services/api/src/application/books/create-upload.use-case.ts`
- Create: `services/api/src/application/books/finalize-upload.use-case.ts`
- Create: `services/api/src/interfaces/http/books.controller.ts`
- Modify: `services/api/src/app.module.ts`

**Interfaces:**
- Produces: guarded `POST /v1/books/uploads` and
  `POST /v1/books/:bookId/uploads/finalize`.
- Produces: `ObjectStorage`, `BookRepository`, and
  `ProcessingCommandRepository` providers plus typed upload tickets and
  idempotent queued-command responses.

- [ ] **Step 1: Extend the book-domain contracts**

In `services/api/src/domain/books/book.ts`, retain the existing
`validateUploadInput()` behavior and add:

```ts
export interface UploadTicket {
  bookId: string;
  objectId: string;
  contentType: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface ObjectStorage {
  createPutUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ uploadUrl: string; expiresAt: string }>;
  head(objectKey: string): Promise<StoredObjectHead | undefined>;
}

export const OBJECT_STORAGE = Symbol("ObjectStorage");
export const BOOK_REPOSITORY = Symbol("BookRepository");
export const PROCESSING_COMMAND_REPOSITORY = Symbol(
  "ProcessingCommandRepository",
);
```

Add `UploadConflictError` with public message and `statusCode = 409` for
missing, mismatched, or oversized storage objects.

- [ ] **Step 2: Implement the S3-compatible adapter**

Create `services/api/src/infrastructure/storage/s3-object-storage.ts` with
an `S3ObjectStorage` class that constructs `S3Client` from
`S3_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
and `S3_BUCKET`. Set `forcePathStyle: true` when an endpoint is configured.

`createPutUrl()` must use `PutObjectCommand` and `getSignedUrl()`:

```ts
const command = new PutObjectCommand({
  Bucket: this.bucket,
  Key: input.objectKey,
  ContentType: input.contentType,
});

const uploadUrl = await getSignedUrl(this.client, command, {
  expiresIn: input.expiresInSeconds,
});
```

`head()` must use `HeadObjectCommand`, map storage not-found responses to
`undefined`, and otherwise return exact content type, exact content length,
and ETag.

- [ ] **Step 3: Persist pending uploads and queued commands**

Create `BookRepository` with:

```ts
createPendingUpload(input: CreateUploadInput): Promise<PendingBookUpload>;
findOwnedPendingUpload(input: {
  ownerId: string;
  bookId: string;
}): Promise<PendingBookUpload | undefined>;
finalizeOwnedUpload(input: {
  ownerId: string;
  bookId: string;
  head: StoredObjectHead;
}): Promise<{ bookId: string; commandId: string; commandStatus: "queued" }>;
```

`createPendingUpload()` must insert `app.books` with `pending_upload` and one
`app.book_objects` row with `object_type = 'original'`, `state = 'pending'`,
and the generated key:

```text
books/{ownerId}/{bookId}/{objectId}/original
```

`finalizeOwnedUpload()` must transactionally lock the owner-scoped pending
book/object, ensure the storage head exactly matches persisted content type
and size, update object state to `uploaded` with ETag, update book status to
`queued`, and insert the command through `ProcessingCommandRepository`.
Return `undefined` from the owned lookup for nonexistent and cross-owner
books; the controller maps both to `404`.

`ProcessingCommandRepository.enqueueIngest()` must use:

```sql
INSERT INTO app.processing_commands (
  owner_id, book_id, command_type, processing_version
)
VALUES ($1, $2, 'ingest_book', 'v1')
ON CONFLICT (command_type, book_id, processing_version)
DO UPDATE SET updated_at = app.processing_commands.updated_at
RETURNING id, status;
```

- [ ] **Step 4: Implement upload use cases and HTTP controller**

`CreateUploadUseCase.execute(input)` must validate metadata, persist the
pending records, presign the exact stored object key for
`S3_PRESIGNED_URL_EXPIRY_SECONDS`, and return `UploadTicket` without the
object key.

`FinalizeUploadUseCase.execute({ ownerId, bookId })` must load the owned
pending object, HEAD the object, reject absent/mismatched/oversized objects
with `UploadConflictError`, then finalize atomically and return:

```ts
{
  bookId,
  bookStatus: "queued" as const,
  commandId,
  commandStatus: "queued" as const,
}
```

Create `BooksController` guarded with `AuthenticatedPrincipalGuard`. Use
class-validator DTOs for filename/content type/positive integer size/optional
500-character title and UUID route parameters. Map
`InvalidUploadInputError` to `UnprocessableEntityException` and
`UploadConflictError` to `ConflictException`.

- [ ] **Step 5: Register API providers**

In `AppModule`, register `S3ObjectStorage`, both repositories, both use cases,
and `BooksController`. Parse `S3_PRESIGNED_URL_EXPIRY_SECONDS` with
`Number.parseInt`; reject missing or non-positive values during boot.

- [ ] **Step 6: Verify and commit upload APIs**

Run:

```powershell
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
docker compose up -d postgres minio minio-init
pnpm run migrate:local
```

Then, with a valid Auth0 API token, create a supported upload, PUT the file
using the returned exact content type, finalize it twice, and inspect
`app.books`, `app.book_objects`, and `app.processing_commands`. Expected: one
queued book, one uploaded original object, and one command.

```powershell
git add services/api/src
git commit -m "feat: add private book upload API"
```

### Task 3: Add Owner-Scoped Library And Processing Reads

**Files:**
- Create: `infrastructure/database/migrations/002_create_app_data_projections.sql`
- Create: `services/api/src/infrastructure/database/book-read.repository.ts`
- Create: `services/api/src/application/books/list-library.use-case.ts`
- Create: `services/api/src/application/books/get-book-status.use-case.ts`
- Create: `services/api/src/interfaces/http/library.controller.ts`
- Modify: `services/api/src/app.module.ts`

**Interfaces:**
- Produces: `GET /v1/books`, `GET /v1/books/:bookId/processing`, and a
  data-schema projection exposing no raw source data.

- [ ] **Step 1: Add the immutable read-projection migration**

Create `002_create_app_data_projections.sql`:

```sql
CREATE VIEW data.book_processing_status AS
SELECT
    command.book_id,
    command.owner_id,
    command.id AS command_id,
    command.status AS command_status,
    run.status AS run_status,
    latest_event.event_type AS latest_event_type,
    latest_event.created_at AS latest_event_at
FROM app.processing_commands AS command
LEFT JOIN LATERAL (
    SELECT status
    FROM data.processing_runs
    WHERE command_id = command.id
    ORDER BY created_at DESC
    LIMIT 1
) AS run ON TRUE
LEFT JOIN LATERAL (
    SELECT event_type, created_at
    FROM data.processing_events
    WHERE command_id = command.id
    ORDER BY created_at DESC
    LIMIT 1
) AS latest_event ON TRUE;

GRANT SELECT ON data.book_processing_status TO app_rw;
```

- [ ] **Step 2: Implement owner-filtered read repository**

Create `BookReadRepository` with:

```ts
listLibrary(ownerId: string): Promise<LibraryBook[]>;
getProcessingStatus(
  ownerId: string,
  bookId: string,
): Promise<BookProcessingStatus | undefined>;
```

`listLibrary()` selects only `app.books.owner_id = $1`, left joins its
original object and latest command, sorts by `books.created_at DESC`, and
returns title, filename, book status, upload state, created time, and optional
command status.

`getProcessingStatus()` filters both the book and
`data.book_processing_status` by owner and book IDs. A book with no Python run
or event still returns its queued command state; only absent/cross-owner books
return `undefined`.

- [ ] **Step 3: Expose guarded query endpoints**

Create thin `ListLibraryUseCase` and `GetBookStatusUseCase`. Add
`LibraryController` with `AuthenticatedPrincipalGuard` and:

```text
GET /v1/books
GET /v1/books/:bookId/processing
```

Validate `bookId` as a UUID and map an undefined status result to `404`.

- [ ] **Step 4: Register and verify reads**

Register the repository, use cases, and controller in `AppModule`. Run:

```powershell
pnpm run migrate:local
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
```

Under two different Auth0 identities, confirm each `GET` route returns only
its own rows and cross-owner IDs return `404`.

- [ ] **Step 5: Commit library reads**

```powershell
git add infrastructure/database/migrations services/api/src
git commit -m "feat: add private library status reads"
```

### Task 4: Generalize The Authenticated Browser API Client

**Files:**
- Modify: `apps/web/src/lib/bookwise-api.ts`
- Create: `apps/web/src/lib/library-types.ts`

**Interfaces:**
- Produces: `bookwiseApi()` for bearer-authenticated JSON requests and
  browser contracts shared by the library screen and upload dialog.

- [ ] **Step 1: Define browser response contracts**

Create `apps/web/src/lib/library-types.ts`:

```ts
export interface LibraryBook {
  id: string;
  title: string;
  filename: string;
  bookStatus: string;
  uploadState: string;
  createdAt: string;
  commandStatus?: string;
}

export interface UploadTicket {
  bookId: string;
  objectId: string;
  contentType: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface FinalizedUpload {
  bookId: string;
  bookStatus: "queued";
  commandId: string;
  commandStatus: "queued";
}

export interface BookProcessingStatus {
  bookId: string;
  bookStatus: string;
  commandStatus?: string;
  runStatus?: string;
  latestEventType?: string;
  latestEventAt?: string;
}
```

- [ ] **Step 2: Generalize the authenticated fetch helper**

In `bookwise-api.ts`, retain `BookwiseConnectionError` and the
`syncBookwiseIdentity()` API, but add:

```ts
export async function bookwiseApi<T>(
  getAccessTokenSilently: GetAccessTokenSilently,
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T>
```

It must acquire a token, lazily load `publicConfig`, resolve `path` against
`NEXT_PUBLIC_API_URL`, set the bearer authorization header while preserving
call-specific headers, use `cache: "no-store"`, reject non-OK responses as
safe `BookwiseConnectionError`, and validate successful JSON with `schema`.
It must not log tokens, response bodies, or presigned URLs.

Refactor `syncBookwiseIdentity()` to call this helper with `POST
/v1/session/sync` and the existing principal schema.

- [ ] **Step 3: Verify and commit browser contracts**

Run:

```powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
```

Expected: both checks pass with no test changes.

```powershell
git add apps/web/src/lib
git commit -m "feat(web): add authenticated library API client"
```

### Task 5: Build The Signed-In Library And Direct Upload UI

**Files:**
- Create: `apps/web/src/components/library/library-screen.tsx`
- Create: `apps/web/src/components/library/upload-dialog.tsx`
- Create: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: Auth0 `getAccessTokenSilently`, `bookwiseApi()`, and all library
  contracts.
- Produces: a responsive private library with loading/error/empty/list states,
  direct upload progress, manual refresh, and queued-status polling.

- [ ] **Step 1: Add focused application styling**

Create `apps/web/src/app/globals.css` with a neutral, work-focused layout:

```css
:root {
  color: #1b1b1b;
  background: #f7f8f5;
  font-family: Arial, sans-serif;
}

body {
  margin: 0;
}

button,
input {
  font: inherit;
}
```

Add compact layout, toolbar, list-row, dialog, progress, and error styles.
Use constrained full-width sections, small-radius controls, and responsive
spacing; do not introduce promotional hero sections or decorative cards.
Import the stylesheet from `layout.tsx`.

- [ ] **Step 2: Implement the library state machine**

Create `LibraryScreen` as a client component. It uses
`useAuth0().getAccessTokenSilently` and a Zod array schema for `LibraryBook[]`
to call:

```text
GET /v1/books
```

Render loading, retryable error, empty, and book-list states. The list must
show title, filename, created time, and labels from:

```ts
const statusLabels: Record<string, string> = {
  pending_upload: "Ready to upload",
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  running: "Processing",
  retryable_failed: "Failed",
  permanent_failed: "Failed",
  needs_review: "Needs review",
};
```

For each queued or processing book, poll
`GET /v1/books/:bookId/processing` every five seconds. Stop when
`document.hidden` is true, the component unmounts, or a terminal state is
returned. Merge only returned status fields into the matching book.

- [ ] **Step 3: Implement the upload dialog**

Create `UploadDialog({ onComplete }: { onComplete(): Promise<void> })`.
Accept:

```text
.pdf,.epub,.docx,.txt,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain
```

Reject missing files, unsupported extension/MIME pairs, and files larger than
`100 * 1024 * 1024` before calling the API. Its submit path is:

1. Call `POST /v1/books/uploads` with filename, MIME type, size, and optional
   title.
2. PUT the selected `File` to `ticket.uploadUrl` using `XMLHttpRequest`, set
   the exact `ticket.contentType`, and update progress with
   `xhr.upload.onprogress`.
3. Call `POST /v1/books/${ticket.bookId}/uploads/finalize`.
4. Close the dialog and await `onComplete()` only after a queued response.

Disable duplicate submission. Retain errors in the dialog. Permit retrying a
storage PUT only while `new Date(ticket.expiresAt) > new Date()`; otherwise
clear the ticket and require a new create-upload request. Never display a
ticket URL.

- [ ] **Step 4: Compose the authenticated page**

In `page.tsx`, retain the existing Auth0 loading/signed-out UI, account menu,
and `SessionSyncStatus`. Replace the signed-in placeholder paragraph with:

```tsx
<LibraryScreen />
```

The page must not fetch books itself and must not add Next.js BFF route
handlers.

- [ ] **Step 5: Verify and commit the web workflow**

Run:

```powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
```

With local API/MinIO/Auth0 services running, sign in, confirm the empty
library, upload a supported local file, observe progress, and confirm the
book is displayed as `Queued` after finalization. Confirm unsupported and
over-100-MiB files are rejected before upload-ticket creation.

```powershell
git add apps/web/src
git commit -m "feat(web): add private book library"
```

### Task 6: Run Full Slice Verification

**Files:**
- Verify only; no test files are created or modified.

**Interfaces:**
- Consumes: private bucket configuration, migrations, guarded APIs, direct
  browser upload, and owner-scoped reads.
- Produces: evidence that the complete SPA private-library slice works
  without token, URL, object-key, or cross-owner disclosure.

- [ ] **Step 1: Run complete static and infrastructure verification**

Run:

```powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
docker compose config
docker compose up -d postgres minio minio-init
pnpm run migrate:local
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 2: Run the two-user manual smoke sequence**

Start the local API and web services:

```powershell
pnpm run dev:api
pnpm run dev:web
```

With two configured Auth0 identities:

1. Sign in as user A, upload one supported file, finalize it twice, and
   confirm one queued command.
2. Sign in as user B and confirm user A's library item is absent.
3. Attempt user A's processing URL as user B and confirm `404`.
4. Attempt an unsupported file, an oversized file, and finalization before
   PUT; confirm no command is created.
5. Attempt an unauthenticated direct object read and confirm it is denied.

- [ ] **Step 3: Inspect the final change set**

Run:

```powershell
git status --short
git diff --check
```

Expected: no whitespace errors and no staged/modified unrelated files.
