# Private Uploads, Library, and Auth0 Design

Status: Approved design
Date: 2026-08-14

## 1. Goal

Deliver the first usable Bookwise workflow:

1. A visitor signs in through Auth0.
2. The authenticated user is provisioned through NestJS.
3. The user uploads a supported private book file directly to object storage.
4. The user sees the book in a private library and can follow its processing
   status.

This is a vertical slice across the Next.js web app, NestJS API, PostgreSQL,
and MinIO/S3-compatible storage. Python processing implementation remains a
later feature; until it exists, successfully finalized books remain queued.

## 2. Decisions

- Use Auth0 Universal Login with the Auth0 Next.js SDK in the web app.
- Configure an Auth0 Regular Web Application and an Auth0 API audience for
  NestJS access tokens.
- Any identity with a valid Auth0 access token for the configured audience may
  sign in. There is no invitation, email allowlist, or domain restriction.
- Keep Auth0 access tokens server-side in Next.js. Browser requests use
  protected Next.js route handlers as a backend-for-frontend (BFF); those
  handlers call NestJS with the user access token.
- Upload book bytes directly from the browser to MinIO/S3 through a
  short-lived, single-object presigned PUT URL created by NestJS.
- The supported upload formats are PDF, EPUB, DOCX, and TXT. Each file may be
  at most 100 MiB.
- The initial web experience includes sign-in, sign-out, an empty library,
  upload, upload progress, upload errors, a book list, and polling processing
  status. It does not include a book reader, source view, summaries, editing,
  search, or administrative controls.

## 3. Architecture

```text
Browser
  -> Next.js Auth0 session and protected BFF routes
  -> NestJS public API with Auth0 bearer token
  -> PostgreSQL app schema
  -> MinIO/S3 presigned PUT URL

Python worker (later)
  <- PostgreSQL app.processing_commands
  -> PostgreSQL data.processing_events
```

Next.js does not store or interpret NestJS authorization data. It reads the
Auth0 session, obtains an API access token server-side, invokes
`POST /v1/session/sync`, and forwards that token when it calls protected NestJS
routes.

NestJS remains the only application API and validates every bearer token. It
owns `app.users`, `app.books`, `app.book_objects`, and
`app.processing_commands`. MinIO/S3 holds original files privately; neither
the web app nor NestJS serves public object URLs.

## 4. Auth0 Sign-in and Provisioning

### 4.1 Auth0 configuration

Create an Auth0 Regular Web Application for the Next.js app and an Auth0 API
whose identifier is the NestJS audience. Configure the following local URLs:

```text
Allowed Callback URL: http://localhost:3000/auth/callback
Allowed Logout URL:   http://localhost:3000
Allowed Web Origin:   http://localhost:3000
```

Production uses the corresponding HTTPS application origin. The API audience
must exactly match NestJS `OIDC_AUDIENCE`; NestJS `OIDC_ISSUER` is the Auth0
issuer URL for the tenant.

The web app receives these server-only settings:

```text
AUTH0_DOMAIN
AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET
AUTH0_SECRET
APP_BASE_URL
AUTH0_AUDIENCE
```

`AUTH0_SECRET`, client secret, and storage credentials are never exposed with
the `NEXT_PUBLIC_` prefix. The default client-side Auth0 access-token endpoint
is disabled because the BFF, rather than browser JavaScript, obtains the token.

### 4.2 Session behavior

The application root renders one of two states:

- Signed out: a sign-in command directs the user to Auth0 Universal Login.
- Signed in: a compact account control displays the authenticated email and a
  sign-out command; the user is redirected to the library.

The Next.js protected route boundary redirects an unauthenticated request to
the Auth0 login route. When the user first reaches the authenticated
application, Next.js calls NestJS `POST /v1/session/sync` with the Auth0 API
access token. NestJS validates the token and creates or synchronizes exactly
one `app.users` row through the existing identity use case.

If session synchronization returns `401` or `403`, Next.js ends the local
session and returns the user to sign-in with a non-sensitive error message.
If it returns a temporary `5xx` error, the library shows a retry state and
does not discard the Auth0 session.

## 5. Backend API

NestJS additions use a shared authenticated-principal adapter so controllers do
not parse bearer headers independently. Every books endpoint requires a valid
principal, and every database query filters by that principal's `userId`.

### 5.1 Create upload

```text
POST /v1/books/uploads
Authorization: Bearer <Auth0 API access token>
```

Request:

```json
{
  "filename": "thinking-in-systems.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 2483917,
  "title": "Thinking in Systems"
}
```

`title` is optional. NestJS uses the filename without its extension when it is
absent. The request rejects unsupported extensions or content types, invalid
filenames, non-positive sizes, and sizes above 100 MiB.

In one application-database transaction, NestJS creates an owner-scoped
`app.books` record with `pending_upload` status and one pending original
`app.book_objects` record. It then asks the object-storage adapter for a PUT
URL restricted to that record's private key and required content type.

Response:

```json
{
  "bookId": "uuid",
  "objectId": "uuid",
  "contentType": "application/pdf",
  "uploadUrl": "short-lived presigned URL",
  "expiresAt": "2026-08-14T12:00:00Z"
}
```

The presigned URL expires after 10 minutes and permits only a PUT to its one
private object key. Object keys are generated by the server and contain no
user-supplied path components.

### 5.2 Direct storage upload

The browser uploads the selected file with an HTTP PUT to `uploadUrl`, using
the required content type. It reports byte-level upload progress and disables
duplicate finalization while the PUT is active.

MinIO/S3 CORS permits PUT and HEAD only from the web application origin. It
does not permit public object reads or broad origins.

### 5.3 Finalize upload

```text
POST /v1/books/{bookId}/uploads/finalize
Authorization: Bearer <Auth0 API access token>
```

Before changing application records, NestJS confirms through storage HEAD that
the object exists and that its content type and byte size match the original
request. A missing, mismatched, or oversized object is rejected without
creating a processing command.

For an owned pending upload, finalization performs one database transaction:

1. Marks the original `app.book_objects` record as `uploaded` and persists
   storage metadata such as ETag and SHA-256 when available.
2. Marks the book `queued`.
3. Inserts the unique `ingest_book` `app.processing_commands` record for the
   configured initial processing version.

The database uniqueness constraint makes repeated finalize requests idempotent:
they return the already queued book and command rather than queueing duplicate
processing.

Response:

```json
{
  "bookId": "uuid",
  "bookStatus": "queued",
  "commandId": "uuid",
  "commandStatus": "queued"
}
```

### 5.4 Library and processing reads

```text
GET /v1/books
GET /v1/books/{bookId}/processing
Authorization: Bearer <Auth0 API access token>
```

`GET /v1/books` returns the caller's books only, newest first. Each item
contains the book ID, title, filename, book status, original upload state,
created time, and current processing status when a command exists.

`GET /v1/books/{bookId}/processing` returns only a caller-owned book. It
contains the book status, current command status, the latest data processing
event type and time when available, and a stable machine-readable status code.
It never treats a missing Python event as success.

Migration `002_create_app_data_projections.sql` creates owner-scoped,
read-only `data` projections for the latest run and event. `app_rw` receives
only SELECT access to those views.

## 6. Next.js Web Experience

### 6.1 BFF routes

Browser JavaScript calls Next.js routes under `/api`. Each route requires an
Auth0 session, obtains an Auth0 API access token with the configured audience,
forwards the request to NestJS, and returns a narrow JSON response:

```text
POST /api/session/sync
GET  /api/books
POST /api/books/uploads
POST /api/books/{bookId}/uploads/finalize
GET  /api/books/{bookId}/processing
```

These are forwarding adapters, not a second business API. They do not query
PostgreSQL or MinIO directly and do not expose bearer tokens to browser code.

### 6.2 Library page

The protected home route is the library. It contains:

- A compact top bar with the product name, signed-in email, and sign-out
  command.
- An upload command that opens an upload dialog.
- An empty state with the upload command when the user has no books.
- A list of books showing title, filename, upload/processing status, and the
  relevant creation or update time.

The list uses clear status labels:

```text
Uploading
Ready to finalize
Queued
Processing
Completed
Needs review
Failed
```

The frontend maps these labels from API values rather than inferring them from
the absence of records.

### 6.3 Upload dialog

The dialog accepts one file. It validates the extension, browser-reported MIME
type, and 100 MiB limit before creating an upload. Server validation remains
authoritative.

Its lifecycle is:

```text
Select file
  -> create upload
  -> PUT to presigned URL with progress
  -> finalize
  -> refresh library
  -> poll processing status
```

The dialog remains open on recoverable errors and states what can be retried.
A storage PUT failure can retry while its URL remains valid; after expiration,
the user starts a new upload attempt. A failed finalization never claims that
the book is queued.

### 6.4 Status polling

The library polls the processing endpoint every five seconds for queued or
processing books. Polling stops for completed, failed, and needs-review
statuses, and when the page is hidden. Users can manually refresh the library
at any time.

## 7. Errors and Security

- Unauthorized or inaccessible book IDs return `404`, preventing resource
  enumeration across owners.
- Invalid sign-in tokens return `401`; inactive or inconsistent identities
  return `403`.
- Unsupported files, invalid metadata, and files over 100 MiB return `422`.
- Object-storage verification failures return `409` for a pending upload and
  do not enqueue processing.
- Unexpected storage and database failures return `5xx` without signed URLs,
  secrets, token values, or internal storage keys in the response.
- Book data and processing projections remain owner-filtered in NestJS and
  PostgreSQL.
- NestJS never writes `data` schema tables. Python does not expose
  browser-facing endpoints.

## 8. Out of Scope

- Auth0 invitation, organization, role-management, MFA, and account-linking
  workflows.
- Public registration restrictions or email/domain allowlists.
- Upload resume across browser restarts, multipart uploads, virus scanning,
  OCR, or files larger than 100 MiB.
- Python command claiming, parsing, generation, event emission, and summary
  display.
- Book reader, summary publication, search, question answering, and
  administration.

## 9. Manual Verification

The repository policy forbids adding automated tests for this work unless
explicitly requested. Verification will use lint, build, database migration,
schema/role inspection, and manual smoke checks:

1. Sign in through Auth0 and confirm one `app.users` row is provisioned.
2. Confirm a signed-out visitor is redirected to Auth0.
3. Upload one PDF, EPUB, DOCX, and TXT file. Confirm each creates an uploaded
   object, queued book, and exactly one ingest command.
4. Attempt an unsupported file, a file larger than 100 MiB, and a finalize
   request before object upload. Confirm no command is created.
5. Sign in as two identities and confirm neither library nor processing status
   exposes the other's records.
6. Confirm direct object URLs cannot be used after expiration and that objects
   are not publicly readable.
