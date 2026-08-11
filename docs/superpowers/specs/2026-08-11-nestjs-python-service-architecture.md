# NestJS Application and Python Processing Architecture

Status: Revised draft for review
Date: 2026-08-11

## 1. Decision

Replace the FastAPI-centric architecture with two clean-architecture services:

- A NestJS application backend owns user-facing APIs and business workflows.
- A Python processing service owns the complete book data pipeline.

The Next.js frontend calls NestJS only. Python processes data asynchronously
and persists source and generated records directly to PostgreSQL. NestJS reads
those records to serve the frontend.

## 2. Service Responsibilities

### 2.1 NestJS application backend

NestJS owns:

- OIDC authentication, automatic user provisioning, authorization, and tenant
  access checks.
- Upload commands, library actions, search and reader APIs, and frontend data
  composition.
- Business commands such as retry, cancel, approve, publish, archive, and
  manual editing.
- User-facing book metadata, publication state, and manual summary revisions.
- Emitting processing commands and consuming processing progress events.

NestJS does not parse books, make model calls, generate embeddings, or mutate
immutable generated artifacts.

### 2.2 Python processing service

Python owns:

- Crawling, imports, and seed-data ingestion when enabled.
- File parsing, normalization, structure detection, source spans, and chunks.
- Model execution, evidence extraction, validation, summarization, and
  embeddings.
- Processing runs, processing checkpoints, generated artifacts, citations, and
  data-quality outcomes.
- Emitting progress, completion, and failure events after durable writes.

Python does not manage authentication, browser-facing APIs, publication
decisions, or manual edits.

## 3. PostgreSQL Contract and Ownership

PostgreSQL remains canonical, but tables are divided by schema and write
ownership.

```text
app schema  -> NestJS write owner
data schema -> Python write owner
```

Both services may read the other schema only through documented queries,
database views, or repositories. Neither service directly updates records
owned by the other.

### 3.1 NestJS-owned `app` schema

The `app` schema contains:

- Users, roles, and tenant access metadata.
- Books, original upload metadata, and user library state.
- Processing commands requested by users or administrators.
- Publication records and active publication pointers.
- Manual summary revisions, notes, tags, and user annotations.
- Outbox events emitted from NestJS business transactions.

### 3.2 Python-owned `data` schema

The `data` schema contains:

- Imported source documents and normalized artifacts.
- Structure nodes, source spans, chunks, and coverage records.
- Processing runs, checkpoints, provider/model execution metadata, and costs.
- Evidence, citations, validation results, embeddings, and generated summaries.
- Processing events emitted after durable data-pipeline state transitions.

All data rows that can be exposed to a user carry the owning user or library
identifier. Cross-schema foreign keys are allowed where they express a stable
relationship, such as a Python-generated summary belonging to an
`app.books` record.

### 3.3 Database permissions

Use distinct PostgreSQL roles:

- `app_rw`: writes the `app` schema and reads approved `data` projections.
- `data_rw`: writes the `data` schema and reads required `app` book and
  command records.
- `migration_admin`: applies central database migrations only.

The roles must not have broad write access to the other service's schema.
Row-level security is applied to all owner-scoped tables and remains enforced
for application and processing roles.

## 4. Editable and Publishable Summaries

Generated content and user-editable content are separate records.

```text
data.generated_summaries
        -> app.summary_revisions
        -> app.summary_publications
        -> frontend effective summary
```

1. Python writes an immutable generated summary with its evidence, citations,
   provider, prompt, and processing-version metadata.
2. NestJS creates a publication record that points to a generated summary.
3. A user or administrator manual edit creates a new NestJS-owned summary
   revision; it never overwrites the Python-generated row.
4. Approval or publishing updates the NestJS-owned publication state and
   active revision pointer.
5. NestJS returns the effective active revision to the frontend.

Manual revisions record their author, timestamp, source generated summary,
and revision reason. Content changed manually is marked as user-edited rather
than evidence-verified unless it retains or receives valid citations. The UI
must not present an edited statement as Python-verified evidence.

Regeneration is different from editing: NestJS records a processing command,
then Python produces a new immutable generated version. NestJS can approve or
publish that new version without discarding earlier versions.

## 5. Data and Event Flow

### 5.1 User provisioning

```text
User signs in with OIDC
       -> Next.js sends bearer token to NestJS
       -> NestJS validates issuer, audience, signature, expiration, and email
       -> NestJS creates app.users when the identity is new
       -> NestJS returns the authenticated principal
```

Every valid identity from the configured OIDC provider may establish a
session. The first successful session creates an `app.users` record. That
record starts without libraries, books, summaries, or other user content;
users create those resources explicitly through later NestJS commands.

The OIDC subject is the stable account identity. A verified normalized email
may update the existing account only when it does not conflict with another
user. Administrator access is assigned by an application-controlled user role,
not by self-service registration or an untrusted OIDC claim.

### 5.2 Book processing

```text
Next.js -> NestJS upload command -> app.books + app.processing_commands
       -> object storage
Python claims command -> parses and generates data.* records
       -> data.processing_events
NestJS reads projections -> Next.js library, outline, summary, and search UI
```

Processing commands and events are durable database records. Redis may deliver
worker notifications, but it is not canonical state. Each command and event is
idempotent and versioned.

### 5.3 Manual edit and publication

```text
Next.js -> NestJS edit/approve/publish command
       -> app.summary_revisions and app.summary_publications
NestJS -> effective summary projection -> Next.js
```

Python is not invoked for a manual edit or publishing action. It is invoked
only when NestJS creates a new data-processing command, such as
regeneration, reindexing, or a retry.

## 6. Clean Architecture

Each service uses the same inward dependency rule:

```text
interfaces -> application -> domain
infrastructure -> application -> domain
```

### 6.1 NestJS layout

```text
services/api/
  src/
    domain/
    application/
    infrastructure/
    interfaces/
```

- `domain` contains entities, value objects, policies, and repository ports.
- `application` contains use cases and command/query handlers.
- `infrastructure` contains PostgreSQL repositories, object-storage adapters,
  outbox delivery, and external identity adapters.
- `interfaces` contains HTTP controllers, request validation, and Nest module
  composition.

### 6.2 Python layout

```text
services/data/
  src/bookwise_data/
    domain/
    application/
    infrastructure/
    workers/
```

- `domain` contains processing concepts, generated-artifact rules, and data
  invariants.
- `application` contains pipeline use cases and command handlers.
- `infrastructure` contains PostgreSQL repositories, parsers, storage,
  provider adapters, and queue adapters.
- `workers` contains process entrypoints and scheduling adapters only.

Framework controllers, ORM models, parser libraries, model SDKs, and queue
clients remain outside domain and application layers.

## 7. Repository and Migration Structure

The target repository structure is:

```text
apps/
  web/
services/
  api/                 NestJS application backend
  data/                Python processing service
infrastructure/
  database/
    migrations/        central PostgreSQL migration history
    roles/             schema and role provisioning
  docker/
docs/
```

Database migrations are language-neutral SQL files under
`infrastructure/database/migrations`. The migration runner is the only writer
of schema definitions. NestJS and Python map their owned schemas but do not
generate independent migration histories.

The current FastAPI application and Alembic foundation are provisional work
from the superseded design. The replacement implementation plan must remove or
relocate them before introducing NestJS and the Python processing service.

## 8. Operational Boundaries

- NestJS exposes the only public HTTP API consumed by the frontend.
- Any valid identity from the configured OIDC provider can establish a
  NestJS session; users do not require invitations.
- Python is private to the worker network and does not expose browser-facing
  endpoints.
- Object storage is private; NestJS creates user-authorized upload/download
  operations and Python accesses artifacts with service credentials.
- Both services use structured logs without raw book text, prompts, secrets,
  or signed URLs.
- NestJS and Python deploy and scale independently.

## 9. Verification Policy

Do not create or extend unit, integration, or end-to-end tests unless the user
explicitly requests them. Implementation verification uses build, lint,
migration, schema-drift, compile, and manual smoke checks as applicable.

## 10. Migration Principles

1. Stop extending the FastAPI application surface.
2. Preserve no production data assumptions because the current database is a
   local development foundation only.
3. Establish the NestJS API and central migration runner before adding further
   product behavior.
4. Move the existing Python data-oriented code into `services/data` only after
   its ownership is redefined against the `data` schema.
5. Add publication and manual-revision tables before implementing summaries in
   the new architecture.
