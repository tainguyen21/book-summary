# Private Uploads, Library, and Auth0 Implementation Plan

> **Superseded:** Do not execute this plan. It depends on the server-session
> `@auth0/nextjs-auth0` BFF architecture, which was replaced by the Auth0 React
> SPA integration in `2026-09-03-auth0-react-spa-migration-design.md`. Retain
> its upload and library requirements as reference material only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an Auth0-protected Bookwise library where every authenticated
user can upload a private supported book file, queue it for processing, and
view its owner-scoped processing state.

**Architecture:** Next.js uses the Auth0 Next.js SDK for its encrypted web
session and acts as a BFF: browser JavaScript calls protected Next.js route
handlers, and those handlers obtain a server-side Auth0 API token before
calling NestJS. NestJS authenticates every books request, owns `app` records,
creates short-lived MinIO/S3 PUT URLs, verifies uploaded objects, and creates
one idempotent processing command. The browser uploads bytes directly to
storage; Python processing remains out of scope.

**Tech Stack:** Next.js 16, React 19, `@auth0/nextjs-auth0` 4.26.0 or later,
NestJS 11, Fastify, TypeScript, PostgreSQL, `@aws-sdk/client-s3`,
`@aws-sdk/s3-request-presigner`, MinIO/S3-compatible storage, Docker Compose.

## Global Constraints

- NestJS is the only application API and only NestJS writes the `app` schema.
- Python remains private and this plan does not implement command claiming,
  parsing, or generation.
- Auth0 is the sole browser sign-in provider. Any verified Auth0 identity for
  the configured API audience may provision automatically.
- Do not create or extend unit, integration, or end-to-end tests unless the
  user explicitly requests them.
- Support PDF, EPUB, DOCX, and TXT only, with an authoritative 100 MiB limit.
- Browser JavaScript never receives an Auth0 access token or storage
  credentials.
- Original book objects remain private; presigned PUT URLs last 10 minutes
  and address exactly one server-generated object key.
- Unauthorized and cross-owner book access returns `404`.
- Verify with lint, build, formatting, migrations, Compose validation, and
  manual smoke checks instead of new automated tests.

---

## Target File Structure

```text
apps/web/
  src/
    app/
      api/
        books/
          route.ts
          uploads/route.ts
          [bookId]/
            processing/route.ts
            uploads/finalize/route.ts
      page.tsx
    components/
      auth/account-menu.tsx
      library/library-screen.tsx
      library/upload-dialog.tsx
    lib/
      auth0.ts
      bookwise-api.ts
      library-types.ts
    proxy.ts

services/api/
  src/
    application/books/
      create-upload.use-case.ts
      finalize-upload.use-case.ts
      get-book-status.use-case.ts
      list-library.use-case.ts
    domain/books/
      book.ts
    infrastructure/
      database/
        book-read.repository.ts
        book.repository.ts
        processing-command.repository.ts
      storage/s3-object-storage.ts
    interfaces/http/
      authenticated-principal.ts
      books.controller.ts
      library.controller.ts

infrastructure/
  database/migrations/002_create_app_data_projections.sql
  storage/minio-cors.json

docs/
  auth0-setup.md
```

## Task 1: Configure Auth0 Web Sessions

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/lib/auth0.ts`
- Create: `apps/web/src/proxy.ts`
- Modify: `.env.example`
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/components/auth/account-menu.tsx`

**Interfaces:**
- Produces: Auth0 SDK-managed `/auth/login`, `/auth/logout`, and
  `/auth/callback` routes.
- Produces: `auth0: Auth0Client` configured with the NestJS API audience.
- Produces: `AccountMenu({ email }: { email: string })` for the signed-in
  application header.

- [ ] **Step 1: Install the Auth0 server SDK**

Run:

```powershell
pnpm --dir apps/web add @auth0/nextjs-auth0@^4.26.0
```

Do not add a browser-only Auth0 SDK. The selected package stores the web
session in encrypted HTTP-only cookies and can obtain access tokens on the
Next.js server.

- [ ] **Step 2: Add server-only Auth0 configuration**

Create `apps/web/src/lib/auth0.ts`:

```ts
import { Auth0Client } from "@auth0/nextjs-auth0/server";

const audience = process.env.AUTH0_AUDIENCE;

if (!audience) {
  throw new Error("AUTH0_AUDIENCE must be configured.");
}

export const auth0 = new Auth0Client({
  authorizationParameters: { audience },
  enableAccessTokenEndpoint: false,
});
```

Create `apps/web/src/proxy.ts`:

```ts
import { auth0 } from "./lib/auth0";

export async function proxy(request: Request) {
  return auth0.middleware(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
```

Next.js 16 uses `proxy.ts`, rather than a new `middleware.ts`, for this network
boundary. The matcher must include the Auth0 paths so the SDK can manage
rolling sessions and built-in auth routes.

- [ ] **Step 3: Document local configuration**

Append these non-secret placeholders to `.env.example`:

```env
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_SECRET=
AUTH0_AUDIENCE=https://api.bookwise.local
S3_REGION=us-east-1
S3_PRESIGNED_URL_EXPIRY_SECONDS=600
```

Set `OIDC_ISSUER=https://your-tenant.us.auth0.com/` and
`OIDC_AUDIENCE=https://api.bookwise.local` in a real `.env`; their audience
must equal `AUTH0_AUDIENCE`. Keep all Auth0 settings server-only, with no
`NEXT_PUBLIC_AUTH0_*` variables.

- [ ] **Step 4: Replace the placeholder root with signed-in and signed-out
states**

Update `apps/web/src/app/page.tsx` to call `auth0.getSession()` in the server
component. Render a plain `<a href="/auth/login">Sign in</a>` for a missing
session. For a session, render the user email through `AccountMenu` and a
library shell placeholder. Use normal anchors for `/auth/login` and
`/auth/logout`; Auth0 route navigation must not be intercepted by a
client-side Next.js `Link`.

Create `AccountMenu` as a server component:

```tsx
export function AccountMenu({ email }: { email: string }) {
  return (
    <div>
      <span>{email}</span>
      <a href="/auth/logout">Sign out</a>
    </div>
  );
}
```

- [ ] **Step 5: Verify the web authentication foundation**

Run:

```powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
```

With a configured Auth0 tenant, run `pnpm run dev:web`, open
`http://localhost:3000`, sign in, and confirm the callback returns to the
root with the authenticated email and a working sign-out command.

- [ ] **Step 6: Commit the Auth0 foundation**

```powershell
git add apps/web/package.json pnpm-lock.yaml apps/web/src .env.example
git commit -m "feat: add Auth0 web sessions"
```

## Task 2: Add Reusable NestJS Authentication and Book Contracts

**Files:**
- Create: `services/api/src/interfaces/http/authenticated-principal.ts`
- Create: `services/api/src/domain/books/book.ts`
- Modify: `services/api/src/app.module.ts`

**Interfaces:**
- Produces: `AuthenticatedPrincipalGuard`, `CurrentPrincipal()`, and
  `AuthenticatedRequest` for authenticated controllers.
- Produces: `CreateUploadInput`, `PendingBookUpload`, `StoredObjectHead`, and
  `UploadFormat` domain contracts.

- [ ] **Step 1: Define the book upload domain types**

Create `services/api/src/domain/books/book.ts` with the accepted types and
authoritative validation:

```ts
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const uploadFormats = {
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
} as const;

export interface CreateUploadInput {
  ownerId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  title?: string;
}

export interface PendingBookUpload {
  bookId: string;
  objectId: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
}

export interface StoredObjectHead {
  contentType: string;
  sizeBytes: number;
  etag?: string;
}
```

Export a `validateUploadInput()` function that rejects a missing basename,
directory separators, unsupported extension/content-type pairs, a non-integer
or non-positive size, and sizes over `MAX_UPLOAD_BYTES`. Its error type
contains a public message and maps to HTTP `422`.

- [ ] **Step 2: Centralize authenticated-principal extraction**

Create `services/api/src/interfaces/http/authenticated-principal.ts` with:

```ts
export interface AuthenticatedRequest extends Request {
  principal?: AuthPrincipal;
}

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) throw new UnauthorizedException();
    return request.principal;
  },
);
```

Implement `AuthenticatedPrincipalGuard` to:

1. Extract exactly one `Bearer <token>` header.
2. Call the existing `SyncIdentityUseCase.execute(token)`.
3. Assign the resulting application principal to `request.principal`.
4. Translate `InvalidTokenError` to `401` and `IdentityRejectedError` to
   `403`.

The guard does not change `SessionController`; it is applied explicitly to the
new books and library controllers.

- [ ] **Step 3: Register the guard dependencies without a global guard**

Update `AppModule` to provide `AuthenticatedPrincipalGuard` through NestJS
dependency injection using the existing `SYNC_IDENTITY_USE_CASE` provider.
Do not register it with `APP_GUARD`, because `POST /v1/session/sync` remains a
separate explicit token-provisioning endpoint.

- [ ] **Step 4: Verify contracts compile cleanly**

Run:

```powershell
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
```

Use a valid Auth0 API token against `POST /v1/session/sync`, then an absent
token against a protected temporary local route if one is needed during manual
verification. Confirm NestJS returns `401` rather than exposing a verifier
error.

- [ ] **Step 5: Commit the authentication and book contracts**

```powershell
git add services/api/src
git commit -m "feat: add authenticated book API contracts"
```

## Task 3: Provision Private Storage and Upload Persistence

**Files:**
- Modify: `services/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `services/api/src/infrastructure/storage/s3-object-storage.ts`
- Create: `services/api/src/infrastructure/database/book.repository.ts`
- Create: `services/api/src/infrastructure/database/processing-command.repository.ts`
- Modify: `services/api/src/app.module.ts`
- Create: `infrastructure/storage/minio-cors.json`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: `ObjectStorage.createPutUrl(upload)` and
  `ObjectStorage.head(objectKey)`.
- Produces: `BookRepository.createPendingUpload(input)` and
  `BookRepository.finalizePendingUpload(input)`.
- Produces: `ProcessingCommandRepository.enqueueIngest(input)`.

- [ ] **Step 1: Install AWS SDK v3 storage dependencies**

Run:

```powershell
pnpm --dir services/api add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Use the S3-compatible client rather than a MinIO-specific SDK so the
production object-storage provider can change without changing application
code.

- [ ] **Step 2: Implement the S3-compatible storage adapter**

Create `s3-object-storage.ts` with an `S3Client` configured from
`S3_ENDPOINT_URL`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
and `S3_BUCKET`. Set `forcePathStyle: true` when `S3_ENDPOINT_URL` is set, so
the local MinIO endpoint works.

Implement:

```ts
createPutUrl(input: {
  objectKey: string;
  contentType: string;
  expiresInSeconds: number;
}): Promise<{ uploadUrl: string; expiresAt: string }>;

head(objectKey: string): Promise<StoredObjectHead | undefined>;
```

`createPutUrl` uses `PutObjectCommand` and `getSignedUrl`, setting the required
`ContentType`. `head` uses `HeadObjectCommand`, maps storage `NotFound` to
`undefined`, and returns ETag, exact content length, and content type for a
found object.

- [ ] **Step 3: Persist pending uploads and finalization state**

Create `book.repository.ts` with one repository that uses a supplied `Pool`.
`createPendingUpload()` starts a transaction, inserts `app.books` with
`pending_upload`, inserts one `app.book_objects` row with `object_type =
'original'` and `state = 'pending'`, commits, and returns the generated IDs
and server-generated key:

```text
books/{ownerId}/{bookId}/{objectId}/original
```

`finalizePendingUpload()` locks the owned book and original object with
`FOR UPDATE`, confirms their expected pending state, updates object state to
`uploaded` with ETag and available SHA-256, updates the book to `queued`, and
returns enough data to enqueue the command in the same transaction.

Create `processing-command.repository.ts` with:

```ts
enqueueIngest(
  client: PoolClient,
  input: { ownerId: string; bookId: string; processingVersion: string },
): Promise<{ commandId: string; commandStatus: "queued" }>;
```

Use `INSERT ... ON CONFLICT (command_type, book_id, processing_version) DO
UPDATE SET updated_at = app.processing_commands.updated_at RETURNING id,
status` so repeated finalization returns the original command without
incrementing attempts or creating a duplicate.

- [ ] **Step 4: Register storage and repository providers**

Add explicit symbols for `BOOK_REPOSITORY`, `PROCESSING_COMMAND_REPOSITORY`,
and `OBJECT_STORAGE`. `AppModule` reads required storage environment values
through the existing `requiredEnvironment()` helper and injects the existing
`APP_DATABASE_POOL` into both repositories. Use
`S3_PRESIGNED_URL_EXPIRY_SECONDS`, parsed as an integer, for the storage
adapter expiry.

- [ ] **Step 5: Configure a private local bucket and restrictive CORS**

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

Add this `minio-init` Compose service:

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

Do not run an anonymous policy command; objects must remain private.

- [ ] **Step 6: Verify the private storage boundary**

Run:

```powershell
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
docker compose config
docker compose up -d minio minio-init
docker compose logs minio-init
```

Confirm `minio-init` exits with status zero and `mc ls local/bookwise` lists
the bucket. Confirm an unauthenticated browser request cannot read a known
object URL.

- [ ] **Step 7: Commit storage and persistence**

```powershell
git add services/api/package.json pnpm-lock.yaml services/api/src docker-compose.yml infrastructure/storage
git commit -m "feat: add private upload storage"
```

## Task 4: Expose Upload Creation and Finalization APIs

**Files:**
- Create: `services/api/src/application/books/create-upload.use-case.ts`
- Create: `services/api/src/application/books/finalize-upload.use-case.ts`
- Create: `services/api/src/interfaces/http/books.controller.ts`
- Modify: `services/api/src/app.module.ts`

**Interfaces:**
- Produces: `POST /v1/books/uploads`.
- Produces: `POST /v1/books/:bookId/uploads/finalize`.
- Produces: `{ bookId, objectId, contentType, uploadUrl, expiresAt }` and
  `{ bookId, bookStatus, commandId, commandStatus }`.

- [ ] **Step 1: Implement create-upload orchestration**

`CreateUploadUseCase.execute(input: CreateUploadInput)` must:

1. Call `validateUploadInput(input)`.
2. Call `BookRepository.createPendingUpload(input)`.
3. Call `ObjectStorage.createPutUrl()` with the returned object key and
   content type.
4. Return the book and object IDs plus the presigned URL and expiry.

If presigning fails after the pending records commit, leave the pending book
visible only to its owner. Do not enqueue processing and do not return an
object key to the client.

- [ ] **Step 2: Implement finalize-upload orchestration**

`FinalizeUploadUseCase.execute({ ownerId, bookId })` must:

1. Load the caller-owned pending original object and return `404` when it does
   not exist.
2. Call `ObjectStorage.head(objectKey)`.
3. Return `409` when the object is missing, its content type differs, or its
   byte size differs from the create-upload metadata.
4. Return `422` when the storage-reported size exceeds `MAX_UPLOAD_BYTES`.
5. Start the database transaction that updates the object and book and calls
   `ProcessingCommandRepository.enqueueIngest()` using processing version
   `"v1"`.
6. Return the queued book and idempotent command response.

- [ ] **Step 3: Add validating HTTP DTOs and controller**

Create `BooksController` with `@UseGuards(AuthenticatedPrincipalGuard)` and
`@Controller("v1/books")`. Define:

```ts
class CreateBookUploadDto {
  @IsString() @MinLength(1) filename!: string;
  @IsString() @MinLength(1) contentType!: string;
  @IsInt() @Min(1) sizeBytes!: number;
  @IsOptional() @IsString() @MaxLength(500) title?: string;
}
```

Use `@Post("uploads")` to pass the DTO and `@CurrentPrincipal()` into the
create use case. Use `@Post(":bookId/uploads/finalize")` with an `@IsUUID()`
route DTO to invoke finalization. Translate domain validation to `422` and
storage verification conflicts to `409`. Do not accept owner IDs, object keys,
or processing versions in any client DTO.

- [ ] **Step 4: Register use cases and controller composition**

Bind `CREATE_UPLOAD_USE_CASE` and `FINALIZE_UPLOAD_USE_CASE` in `AppModule`
using the providers created in Task 3, and add `BooksController` to the module
controllers array.

- [ ] **Step 5: Verify the upload handoff manually**

Run:

```powershell
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
docker compose up -d postgres minio minio-init
pnpm run migrate:local
pnpm run dev:api
```

With a valid Auth0 API access token, create a PDF upload, PUT a local PDF to
the returned URL using the exact requested content type, finalize it, and
inspect `app.books`, `app.book_objects`, and `app.processing_commands`. Repeat
the finalize request and confirm the same command ID is returned. Try a
pre-upload finalize and an unsupported file request; confirm neither creates a
command.

- [ ] **Step 6: Commit upload APIs**

```powershell
git add services/api/src
git commit -m "feat: add private book upload API"
```

## Task 5: Add Owner-Scoped Library and Processing Projections

**Files:**
- Create: `infrastructure/database/migrations/002_create_app_data_projections.sql`
- Create: `services/api/src/infrastructure/database/book-read.repository.ts`
- Create: `services/api/src/application/books/list-library.use-case.ts`
- Create: `services/api/src/application/books/get-book-status.use-case.ts`
- Create: `services/api/src/interfaces/http/library.controller.ts`
- Modify: `services/api/src/app.module.ts`

**Interfaces:**
- Produces: `GET /v1/books`.
- Produces: `GET /v1/books/:bookId/processing`.
- Produces: `data.book_processing_status`, a read-only projection granted to
  `app_rw`.

- [ ] **Step 1: Create the processing-status database view**

Create migration `002_create_app_data_projections.sql`:

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

The view includes no raw source text. Do not modify
`001_create_initial_schema.sql`, because migrations are immutable after
application.

- [ ] **Step 2: Implement owner-filtered reads**

Create `BookReadRepository` with:

```ts
listLibrary(ownerId: string): Promise<LibraryBook[]>;
getProcessingStatus(
  ownerId: string,
  bookId: string,
): Promise<BookProcessingStatus | undefined>;
```

`listLibrary()` selects books by `books.owner_id = $1`, left joins the original
object and newest processing command, and sorts by `books.created_at DESC`.
`getProcessingStatus()` filters both the book and projection by owner ID and
book ID. It returns `undefined` for a nonexistent or other-user book.

Expose stable values:

```ts
interface LibraryBook {
  id: string;
  title: string;
  filename: string;
  bookStatus: string;
  uploadState: string;
  createdAt: string;
  commandStatus?: string;
}

interface BookProcessingStatus {
  bookId: string;
  bookStatus: string;
  commandStatus?: string;
  runStatus?: string;
  latestEventType?: string;
  latestEventAt?: string;
}
```

- [ ] **Step 3: Add query use cases and library controller**

Create thin `ListLibraryUseCase` and `GetBookStatusUseCase` classes around
`BookReadRepository`. Create `LibraryController` guarded with
`AuthenticatedPrincipalGuard`:

```text
GET /v1/books
GET /v1/books/:bookId/processing
```

The `:bookId` DTO must enforce UUID syntax. Map a missing result to `404`.
Never return a success status solely because no Python run or event exists.

- [ ] **Step 4: Register reads in NestJS composition**

Add a `BOOK_READ_REPOSITORY` provider, bind both query use cases, and register
`LibraryController` in `AppModule`.

- [ ] **Step 5: Verify isolation and migration**

Run:

```powershell
docker compose up -d postgres
pnpm run migrate:local
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
```

Provision two Auth0 identities, queue one book for each, and call both GET
routes under each identity. Confirm each returns only its own records and an
attempt to read the other user's book returns `404`.

- [ ] **Step 6: Commit read projections**

```powershell
git add infrastructure/database/migrations services/api/src
git commit -m "feat: add library status projections"
```

## Task 6: Add Next.js Server-Side BFF Routes

**Files:**
- Create: `apps/web/src/lib/bookwise-api.ts`
- Create: `apps/web/src/lib/library-types.ts`
- Create: `apps/web/src/app/api/session/sync/route.ts`
- Create: `apps/web/src/app/api/books/route.ts`
- Create: `apps/web/src/app/api/books/uploads/route.ts`
- Create: `apps/web/src/app/api/books/[bookId]/uploads/finalize/route.ts`
- Create: `apps/web/src/app/api/books/[bookId]/processing/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: protected browser-facing `/api` forwarding routes.
- Produces: `bookwiseApi(path, init)` that forwards Auth0 server access tokens
  to NestJS.
- Produces: shared browser JSON types matching the NestJS response contracts.

- [ ] **Step 1: Add the BFF API client**

Create `apps/web/src/lib/bookwise-api.ts`:

```ts
import { auth0 } from "./auth0";

const apiBaseUrl = process.env.API_BASE_URL;

if (!apiBaseUrl) {
  throw new Error("API_BASE_URL must be configured.");
}

export async function bookwiseApi(path: string, init?: RequestInit) {
  const { token } = await auth0.getAccessToken();
  if (!token) throw new Error("No Auth0 API access token is available.");

  return fetch(new URL(path, apiBaseUrl), {
    ...init,
    headers: {
      ...init?.headers,
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
}
```

Replace `NEXT_PUBLIC_API_URL` with server-only
`API_BASE_URL=http://localhost:3001` in `.env.example`. The browser will call
relative `/api` routes and must not know the NestJS base URL.

- [ ] **Step 2: Implement response forwarding**

Each route first requires `auth0.getSession()` and returns `401` when missing.
It calls `bookwiseApi()` with the corresponding NestJS path and passes through
only the NestJS status and JSON body. For `POST` routes, parse one JSON body,
forward it with `content-type: application/json`, and reject invalid JSON with
`400`.

Implement these mappings:

```text
POST /api/session/sync                         -> POST /v1/session/sync
GET  /api/books                                -> GET  /v1/books
POST /api/books/uploads                        -> POST /v1/books/uploads
POST /api/books/:bookId/uploads/finalize       -> POST /v1/books/:bookId/uploads/finalize
GET  /api/books/:bookId/processing             -> GET  /v1/books/:bookId/processing
```

When NestJS returns `401` or `403`, forward the status to the browser. Do not
redirect from a fetch route and do not expose error stacks or bearer tokens.

- [ ] **Step 3: Define the shared browser response types**

Create `library-types.ts` with the JSON contracts used by the client UI:

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
```

- [ ] **Step 4: Verify the BFF does not leak tokens**

Run:

```powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
```

With Next.js and NestJS running, sign in and call `/api/session/sync` and
`/api/books` from the browser. Confirm the browser Network panel shows calls
only to `localhost:3000/api/...`, with no bearer token in request headers and
no raw NestJS URL in the page source.

- [ ] **Step 5: Commit BFF routes**

```powershell
git add apps/web/src .env.example
git commit -m "feat: add authenticated web API routes"
```

## Task 7: Build the Upload and Library User Interface

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/components/library/library-screen.tsx`
- Create: `apps/web/src/components/library/upload-dialog.tsx`
- Modify: `apps/web/src/app/globals.css` if the file is created by the current
  Next.js setup; otherwise create it and import it from `layout.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Produces: an authenticated library shell with load, empty, error, and list
  states.
- Produces: `UploadDialog({ onComplete }: { onComplete(): Promise<void> })`.

- [ ] **Step 1: Add application-level layout styling**

Create or update `globals.css` with a responsive, work-focused layout:

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

Use a constrained main column, compact top bar, semantic tables or list rows,
and small-radius controls. Use a familiar upload icon from an installed icon
library only if one exists; otherwise use a clearly labeled “Upload book”
command. Do not add promotional hero content, decorative cards, or unrelated
landing-page sections.

- [ ] **Step 2: Implement the library screen state machine**

Create `LibraryScreen` as a client component. On mount, fetch `/api/books`,
render a loading state, then render either:

- Empty library with an upload command.
- Owner-scoped book list with title, filename, created time, and status.
- Retryable error with a reload command.

Store `LibraryBook[]` in component state. Format each API value through an
explicit label map:

```ts
const statusLabels: Record<string, string> = {
  pending_upload: "Ready to finalize",
  queued: "Queued",
  running: "Processing",
  completed: "Completed",
  retryable_failed: "Failed",
  permanent_failed: "Failed",
  needs_review: "Needs review",
};
```

Do not infer completion from a missing command or event.

- [ ] **Step 3: Implement a direct-to-storage upload dialog**

Create `UploadDialog` as a client component with one file input accepting:

```text
.pdf,.epub,.docx,.txt,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain
```

Before sending a request, reject a missing file, unsupported extension, and
files larger than `100 * 1024 * 1024` bytes. Then:

1. POST filename, `file.type`, and `file.size` to `/api/books/uploads`.
2. Upload the raw `File` to `ticket.uploadUrl` using `XMLHttpRequest` so
   `upload.onprogress` can render byte progress.
3. Set the exact `Content-Type` returned as `ticket.contentType`.
4. POST to `/api/books/${ticket.bookId}/uploads/finalize`.
5. Close the dialog and call `onComplete()` after a successful finalize.

Disable the submit command while a request is in flight. Keep the dialog open
on error, show the failure text, and allow a retry only while the ticket is
unexpired. After expiry, require a new upload attempt. Do not display
`uploadUrl` in the UI or logs.

- [ ] **Step 4: Add processing polling**

For each library item with a status in `queued` or `running`, poll
`/api/books/${book.id}/processing` every 5 seconds. Stop the interval when the
tab is hidden, the component unmounts, or terminal status is received. Merge
only the returned status fields into the matching local book; do not discard
the rest of the list.

- [ ] **Step 5: Compose the signed-in root**

Update `page.tsx` to retain the signed-out Auth0 login state from Task 1 and,
for a session, render the account header plus `LibraryScreen`. The root server
component must not fetch the NestJS library directly; browser interactions
continue to use the BFF routes.

- [ ] **Step 6: Verify the browser workflow manually**

Run:

```powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
pnpm run dev:web
```

Sign in, confirm the empty state, upload a supported local file, observe
progress, confirm the book becomes queued, reload the page, and confirm the
book remains visible. Attempt an unsupported file and an over-100-MiB file;
confirm the dialog rejects them before creating an upload. Inspect a signed
out browser state and confirm it offers only sign-in.

- [ ] **Step 7: Commit the usable library UI**

```powershell
git add apps/web/src
git commit -m "feat: add private book library UI"
```

## Task 8: Document Auth0 Setup and Run Final Verification

**Files:**
- Create: `docs/auth0-setup.md`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml` only if required to include the new
  existing lint/build checks; do not add a test step.

**Interfaces:**
- Produces: reproducible Auth0 tenant configuration instructions.
- Produces: documented local startup and manual smoke checklist.

- [ ] **Step 1: Document Auth0 dashboard configuration**

Create `docs/auth0-setup.md` with the exact local setup:

```text
Application type: Regular Web Application
Allowed Callback URL: http://localhost:3000/auth/callback
Allowed Logout URL: http://localhost:3000
Allowed Web Origin: http://localhost:3000
API identifier: https://api.bookwise.local
```

Document the environment variables from Task 1 and explicitly state that
`OIDC_ISSUER` ends with `/` and `OIDC_AUDIENCE` must match `AUTH0_AUDIENCE`.
Describe how to generate `AUTH0_SECRET` using
`openssl rand -hex 32`, without committing generated values.

- [ ] **Step 2: Update the developer README**

Add the Auth0 configuration prerequisite before the local service commands.
Update the startup sequence to include:

```powershell
docker compose up -d
pnpm run migrate:local
pnpm run dev:api
pnpm run dev:web
```

Explain that finalized uploads remain `queued` until the separate Python
processing pipeline is implemented.

- [ ] **Step 3: Run the complete repository verification**

Run:

```powershell
pnpm install --frozen-lockfile
pnpm --dir apps/web lint
pnpm --dir apps/web build
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
uv sync --project services/data --locked
uv run --project services/data ruff check services/data
uv run --project services/data python -m compileall -q services/data/src
docker compose config
docker compose up -d postgres minio minio-init
pnpm run migrate:local
```

Then run the full two-user manual smoke sequence from Tasks 4, 5, and 7. Note
any verification unavailable because real Auth0 tenant credentials are absent;
do not substitute mocked identity behavior.

- [ ] **Step 4: Commit documentation and integration changes**

```powershell
git add docs/auth0-setup.md README.md .env.example .github/workflows/ci.yml
git commit -m "docs: document Auth0 upload workflow"
```

## Plan Acceptance Checkpoint

- A visitor can sign in and out through Auth0, and one verified identity
  provisions one application user.
- Browser JavaScript uses only Next.js `/api` routes and never receives an
  Auth0 API token.
- A signed-in user can upload one supported file directly to private storage
  and finalize it into exactly one queued ingest command.
- A user can see only their own books and their own processing state.
- Missing processing events are displayed as pending/queued state, not success.
- Storage objects are not publicly readable and presigned URLs expire after
  10 minutes.
