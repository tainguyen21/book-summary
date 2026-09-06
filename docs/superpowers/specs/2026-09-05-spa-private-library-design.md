# SPA Private Library Design

## Purpose

Deliver Bookwise's first usable private-library workflow for the Auth0 React
single-page application:

1. A signed-in user creates a private upload ticket.
2. The browser uploads the selected book directly to private MinIO/S3 storage.
3. NestJS verifies and finalizes the uploaded object into one queued ingest
   command.
4. The user sees only their own books and their queued processing state.

Python processing is out of scope. A finalized book remains visibly `Queued`
until a later worker implementation claims and updates its command.

## Scope

The slice includes:

- NestJS upload-creation and upload-finalization endpoints.
- Private MinIO/S3 bucket provisioning and browser upload CORS.
- Owner-scoped library and processing-status endpoints.
- A database projection for the latest processing run and event.
- An authenticated browser API client that forwards Auth0 bearer tokens.
- A signed-in library screen, upload dialog, direct upload progress, refresh,
  and queued-status polling.

It does not include parsing, summarization, source reading, publication,
search, question answering, multipart uploads, upload resume, OCR, virus
scanning, or files larger than 100 MiB.

## Security And Ownership

The browser receives Auth0 API tokens through the existing Auth0 React SDK and
sends them directly to NestJS through the existing authenticated API helper.
NestJS verifies every token and is the only public application API and the
only writer to `app` schema tables.

Every book, object, command, library query, and processing-status query is
filtered by the authenticated principal's `userId`. A missing or
cross-owner book returns `404`.

Book objects remain private. NestJS generates each storage key and creates
10-minute presigned PUT URLs restricted to one key and exact content type.
The API never returns object keys. The web UI never renders or logs presigned
URLs or bearer tokens.

The community MinIO server supports CORS through the global
`MINIO_API_CORS_ALLOW_ORIGIN` setting rather than per-bucket CORS rules. The
local deployment permits only `http://localhost:3000`; browser upload
preflights are limited to `PUT`/`HEAD` and the `content-type` request header.
It does not permit public reads or wildcard origins. MinIO emits its
credentials response header globally, but Bookwise direct uploads use the
browser default `withCredentials = false` and MinIO has no browser session
cookie.

## Upload Flow

The browser accepts PDF, EPUB, DOCX, and TXT files up to 100 MiB. It performs
basic extension, browser MIME-type, and size checks for immediate feedback;
NestJS performs authoritative validation.

1. The browser sends filename, MIME type, byte size, and optional title to
   `POST /v1/books/uploads`.
2. NestJS validates the metadata, creates an owner-scoped `pending_upload`
   book and pending original object in one transaction, then returns a
   presigned upload ticket.
3. The browser PUTs the raw file to the ticket URL with the exact ticket
   content type and reports byte-level progress.
4. The browser calls
   `POST /v1/books/{bookId}/uploads/finalize`.
5. NestJS HEAD-checks the object for presence, exact content type, and exact
   byte size. It atomically marks the object `uploaded`, marks the book
   `queued`, and inserts an idempotent `ingest_book` command with processing
   version `v1`.
6. The browser refreshes the owner-scoped library and displays the book as
   `Queued`.

Repeated finalization returns the same command rather than creating a
duplicate. A failed object check leaves the book pending and creates no
command.

## Backend API

```text
POST /v1/books/uploads
POST /v1/books/:bookId/uploads/finalize
GET  /v1/books
GET  /v1/books/:bookId/processing
```

All endpoints use `AuthenticatedPrincipalGuard`.

`POST /v1/books/uploads` returns:

```json
{
  "bookId": "uuid",
  "objectId": "uuid",
  "contentType": "application/pdf",
  "uploadUrl": "short-lived presigned URL",
  "expiresAt": "2026-09-05T12:00:00Z"
}
```

`POST /v1/books/:bookId/uploads/finalize` returns:

```json
{
  "bookId": "uuid",
  "bookStatus": "queued",
  "commandId": "uuid",
  "commandStatus": "queued"
}
```

`GET /v1/books` returns books newest first with title, filename, book status,
original upload state, creation time, and current command status when present.

`GET /v1/books/:bookId/processing` returns the owner-scoped book status,
command status, latest Python run status, and latest event metadata when
available. Missing runs and events do not imply completion.

## Web Experience

The signed-in home page becomes the library screen. It supports loading,
error, empty, and list states, with an upload command and manual refresh.

The upload dialog permits one selected supported file. It progresses through
upload-ticket creation, direct object upload, and finalization. It disables
duplicate submission while active. Recoverable failures remain visible:

- A create-upload failure allows retrying from the selected file.
- A storage PUT failure can retry while the ticket is unexpired.
- An expired ticket requires a new upload request.
- A finalization failure does not claim the book was queued.

For queued or processing books, the screen polls processing status every five
seconds. It stops polling when the page is hidden, on component unmount, or
when the status becomes terminal. Until Python exists, finalized books remain
`Queued`.

## Data And Infrastructure

The existing immutable `001_create_initial_schema.sql` remains unchanged.
Migration `002_create_app_data_projections.sql` adds an owner-scoped
`data.book_processing_status` view for NestJS reads and grants `SELECT` on it
to `app_rw`.

The API uses an S3-compatible adapter configured through:

```text
S3_ENDPOINT_URL
S3_REGION
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_BUCKET
S3_PRESIGNED_URL_EXPIRY_SECONDS
```

Docker Compose configures restrictive global MinIO CORS and adds a one-shot
MinIO initialization service that creates the private `bookwise` bucket.

## Error Handling

- Invalid filenames, metadata, types, or sizes return `422`.
- Missing or mismatched pending storage objects return `409`.
- Missing or cross-owner books return `404`.
- Invalid tokens return `401`; rejected identities return `403`.
- Storage/database failures return `5xx` without URLs, tokens, object keys,
  or internal details.

## Verification

No automated tests are added or modified under the project guidance.

Verification includes web/API lint and production builds, API formatting,
database migration and Compose validation, and manual checks:

1. Use two Auth0 identities and confirm owner-scoped library and status reads.
2. Upload each supported type and confirm one queued command per finalized
   book.
3. Confirm unsupported, oversized, pre-upload-finalize, and cross-owner
   requests do not create commands or disclose records.
4. Confirm MinIO objects are not public and browser uploads are limited by
   the configured origin, methods, and headers.
