# Search and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose private search, cited question answering, operational
controls, and production deployment through NestJS while Python owns indexing
and data processing.

**Architecture:** Python writes search documents and embeddings in `data`.
NestJS queries owner-filtered approved projections, issues retry and reindex
commands, and exposes administrator operations without writing generated data.

**Tech Stack:** NestJS, PostgreSQL full-text search, pgvector, Python workers,
Redis, Docker Compose, OpenTelemetry.

## Global Constraints

- Follow the roadmap global constraints.
- Do not add automated tests.
- Search APIs must query owner-filtered data projections.

---

### Task 1: Add Python search indexing records and worker

**Files:**
- Create: `infrastructure/database/migrations/006_create_data_search.sql`
- Create: `services/data/src/bookwise_data/application/index_book.py`
- Create: `services/data/src/bookwise_data/infrastructure/database/search-repository.py`
- Create: `services/data/src/bookwise_data/infrastructure/providers/embedding-provider.py`

**Interfaces:**
- Produces: `data.search_documents` and `data.embeddings`.
- Consumes: completed generated summaries and validated evidence.

- [ ] **Step 1: Create search tables**

Use PostgreSQL full-text vectors and pgvector embeddings. Store owner ID, book
ID, source type, source ID, input hash, provider/model, and index version.

- [ ] **Step 2: Build idempotent indexing**

Index only approved generated data. Reuse matching input hashes and write a
`data.processing_events` record when indexing completes or requires a model
route.

- [ ] **Step 3: Verify manually**

Run an index command and inspect lexical and vector rows for one completed
book.

- [ ] **Step 4: Commit**

```bash
git add infrastructure/database/migrations services/data
git commit -m "feat: add Python search indexing"
```

### Task 2: Add NestJS private search and cited question APIs

**Files:**
- Create: `services/api/src/application/search/search-books.use-case.ts`
- Create: `services/api/src/application/search/answer-question.use-case.ts`
- Create: `services/api/src/infrastructure/database/search-read.repository.ts`
- Create: `services/api/src/interfaces/http/search.controller.ts`
- Create: `services/api/src/interfaces/http/questions.controller.ts`
- Create: `infrastructure/database/migrations/007_create_app_search_projections.sql`

**Interfaces:**
- Produces: `GET /v1/search`.
- Produces: `POST /v1/questions`.

- [ ] **Step 1: Define read projections**

Grant `app_rw` select access only to published summaries, accepted evidence,
and source-location metadata. Exclude unapproved generated records.

- [ ] **Step 2: Implement hybrid retrieval**

Apply owner, book, and section filters in SQL before lexical/vector ranking.
Return source IDs and location metadata with every result.

- [ ] **Step 3: Implement cited answer command**

NestJS creates an `answer_question` processing command. Python creates a
source-linked answer record; NestJS returns that record without generating
content itself.

- [ ] **Step 4: Verify manually**

Search two users' books with each identity and verify no result or citation
crosses owners.

- [ ] **Step 5: Commit**

```bash
git add services/api infrastructure/database/migrations
git commit -m "feat: expose NestJS private search"
```

### Task 3: Add administration, observability, and deployment

**Files:**
- Create: `services/api/src/application/admin/retry-processing.use-case.ts`
- Create: `services/api/src/interfaces/http/admin.controller.ts`
- Create: `services/data/src/bookwise_data/infrastructure/observability/logging.py`
- Create: `infrastructure/docker/api.Dockerfile`
- Create: `infrastructure/docker/data.Dockerfile`
- Create: `docker-compose.production.yml`
- Create: `docs/deployment/nestjs-python.md`

**Interfaces:**
- Produces: administrator retry, provider-disable, and reindex commands.
- Produces: separate NestJS and Python production containers.

- [ ] **Step 1: Add administrator command APIs**

Write retry and reindex requests as `app.processing_commands`. Record audit
events in `app.audit_events` without raw book text or prompts.

- [ ] **Step 2: Add correlated telemetry**

Carry request ID, owner ID hash, book ID, command ID, and processing-run ID in
logs. Redact source text, prompts, secrets, and signed URLs.

- [ ] **Step 3: Add production containers**

Run NestJS, Python workers, PostgreSQL, Redis, and private object storage as
separate services. Do not publish database, Redis, or object-storage ports in
the production Compose file.

- [ ] **Step 4: Verify manually**

Build both containers, run the production Compose configuration check, execute
one retry command, and inspect correlated NestJS and Python event logs.

- [ ] **Step 5: Commit**

```bash
git add services/api services/data infrastructure docker-compose.production.yml docs/deployment
git commit -m "build: add NestJS Python operations"
```

## Plan Acceptance Checkpoint

- Python owns all indexing and generated answer work.
- NestJS returns only owner-filtered, published, cited data.
- Administrative actions create durable commands rather than writing `data`
  generated artifacts.
- NestJS and Python deploy independently with redacted operational telemetry.
