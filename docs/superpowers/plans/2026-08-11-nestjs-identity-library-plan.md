# NestJS Identity and Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver public OIDC identity provisioning, private-library,
upload-command, and processing-command APIs.

**Architecture:** NestJS use cases operate on domain ports. PostgreSQL
repositories write `app` records, object storage remains private, and command
records are the durable handoff to Python.

**Tech Stack:** NestJS, Fastify, TypeScript, PostgreSQL, OIDC, S3-compatible
storage, Redis notifications.

## Global Constraints

- Follow the roadmap global constraints.
- Do not add automated tests.
- NestJS does not write `data` schema tables.

---

### Task 1: Add identity and authorization use cases

**Files:**
- Create: `services/api/src/domain/identity/auth-principal.ts`
- Create: `services/api/src/application/identity/sync-identity.use-case.ts`
- Create: `services/api/src/infrastructure/identity/oidc-token-verifier.ts`
- Create: `services/api/src/infrastructure/database/app-user.repository.ts`
- Create: `services/api/src/interfaces/http/session.controller.ts`

**Interfaces:**
- Produces: `POST /v1/session/sync`.
- Produces: `AuthPrincipal { userId, email, isAdmin }`.

- [ ] **Step 1: Define identity ports and use case**

Define `TokenVerifier.verify(token)` and `UserRepository.syncIdentity`.
Every identity with a valid configured OIDC token may establish a session.

- [ ] **Step 2: Implement OIDC adapter**

Validate issuer, audience, signature, expiration, and normalized email through
the configured OIDC discovery and JWKS endpoints.

- [ ] **Step 3: Implement `app` repository**

Lock the matching `app.users` record by OIDC subject or normalized email.
Create the user when absent, update an existing matching user with the verified
subject and email, and return its application-controlled administrator state in
one transaction. Reject inconsistent subject-to-email matches or inactive
users. Never create a library, book, summary, or other user content while
provisioning the identity.

- [ ] **Step 4: Verify manually**

Run NestJS locally with configured OIDC settings. Send a valid bearer token for
a new identity and confirm that `app.users` receives one row with no related
library or book rows. Send the same token again and confirm it returns the same
principal. Send an invalid token and confirm the request is rejected.

- [ ] **Step 5: Commit**

```bash
git add services/api
git commit -m "feat: add NestJS public identity provisioning"
```

### Task 2: Add private upload commands and durable handoff

**Files:**
- Create: `services/api/src/domain/books/book.ts`
- Create: `services/api/src/application/books/create-upload.use-case.ts`
- Create: `services/api/src/application/books/finalize-upload.use-case.ts`
- Create: `services/api/src/infrastructure/storage/s3-object-storage.ts`
- Create: `services/api/src/infrastructure/database/book.repository.ts`
- Create: `services/api/src/infrastructure/database/processing-command.repository.ts`
- Create: `services/api/src/interfaces/http/books.controller.ts`

**Interfaces:**
- Produces: `POST /v1/books/uploads`.
- Produces: `POST /v1/books/{bookId}/uploads/finalize`.
- Produces: an `app.processing_commands` row with `command_type='ingest_book'`.

- [ ] **Step 1: Define book and command ports**

Define `ObjectStorage.createUploadUrl`, `ObjectStorage.head`, and
`ProcessingCommandRepository.enqueue`.

- [ ] **Step 2: Implement upload creation**

Verify the caller owns the new book, restrict formats to PDF, EPUB, DOCX, and
TXT, create an `app.book_objects` pending row, and return a short-lived upload
URL.

- [ ] **Step 3: Implement upload finalization**

Verify object size and content type with object storage. Transition the object
to uploaded, transition the book to queued, and insert one idempotent
`ingest_book` command in the same transaction.

- [ ] **Step 4: Verify manually**

Upload a supported local file through the NestJS API and inspect the matching
`app.books`, `app.book_objects`, and `app.processing_commands` records.

- [ ] **Step 5: Commit**

```bash
git add services/api infrastructure/database/migrations
git commit -m "feat: add NestJS private book uploads"
```

### Task 3: Add library and command-status read projections

**Files:**
- Create: `services/api/src/application/books/list-library.use-case.ts`
- Create: `services/api/src/application/books/get-book-status.use-case.ts`
- Create: `services/api/src/infrastructure/database/book-read.repository.ts`
- Create: `services/api/src/interfaces/http/library.controller.ts`
- Create: `infrastructure/database/migrations/002_create_app_data_projections.sql`

**Interfaces:**
- Produces: `GET /v1/books`.
- Produces: `GET /v1/books/{bookId}/processing`.

- [ ] **Step 1: Create read-only `data` projections**

Create views exposing per-book processing run and latest event data to
`app_rw`. The views contain no raw source content.

- [ ] **Step 2: Implement owner-filtered library reads**

Return only books owned by the authenticated principal, their upload state,
and their latest processing status.

- [ ] **Step 3: Implement processing reads**

Return command state and latest Python event code. Do not infer completion
from missing records.

- [ ] **Step 4: Verify manually**

Create books for two users and confirm each bearer token receives only its own
library and processing records.

- [ ] **Step 5: Commit**

```bash
git add services/api infrastructure/database/migrations
git commit -m "feat: expose NestJS library projections"
```

## Plan Acceptance Checkpoint

- NestJS is the only public API.
- A valid OIDC identity can establish a session and is provisioned exactly once.
- New users begin without library or book records.
- Upload finalization writes one private object record and one idempotent
  processing command.
- NestJS reads Python processing state without writing `data` records.
