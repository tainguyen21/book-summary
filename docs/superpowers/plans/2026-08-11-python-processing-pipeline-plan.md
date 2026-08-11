# Python Processing Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python-owned command worker that transforms uploaded books
into immutable, source-linked data records and durable progress events.

**Architecture:** Python application use cases atomically claim
`app.processing_commands`, write only `data` tables, then append
`data.processing_events`. Parsers and model providers are infrastructure
adapters behind domain ports.

**Tech Stack:** Python, SQLAlchemy, Celery, PostgreSQL, S3-compatible storage,
PyMuPDF, EbookLib, python-docx, Pydantic, provider SDKs.

## Global Constraints

- Follow the roadmap global constraints.
- Do not add automated tests.
- Python reads `app` books and commands but does not update them.
- Generated data is immutable after its processing version is complete.

---

### Task 1: Claim commands and emit processing events

**Files:**
- Create: `services/data/src/bookwise_data/domain/commands.py`
- Create: `services/data/src/bookwise_data/application/claim_command.py`
- Create: `services/data/src/bookwise_data/application/emit_event.py`
- Create: `services/data/src/bookwise_data/infrastructure/database/command-repository.py`
- Create: `services/data/src/bookwise_data/infrastructure/database/event-repository.py`
- Create: `services/data/src/bookwise_data/workers/command-worker.py`

**Interfaces:**
- Produces: `CommandWorker.run_once(limit: int) -> int`.
- Produces: `data.processing_events` for claimed, failed, and completed work.

- [ ] **Step 1: Define command state transitions**

Allow `queued -> running -> completed`, `queued -> retryable_failed`, and
`running -> retryable_failed`. Require `FOR UPDATE SKIP LOCKED` when claiming.

- [ ] **Step 2: Implement idempotent claim repository**

Claim only commands whose processing version has no completed matching data run.
Persist a data processing-run row before external work begins.

- [ ] **Step 3: Emit durable events**

Append `command_claimed`, `stage_started`, `stage_completed`, and
`command_failed` event records in the same transaction as each state change.

- [ ] **Step 4: Verify manually**

Insert two queued commands, run two worker processes, and inspect that each
command has one claim and ordered events.

- [ ] **Step 5: Commit**

```bash
git add services/data infrastructure/database/migrations
git commit -m "feat: add Python processing command worker"
```

### Task 2: Parse and normalize supported book formats

**Files:**
- Create: `services/data/src/bookwise_data/domain/source.py`
- Create: `services/data/src/bookwise_data/application/ingest_book.py`
- Create: `services/data/src/bookwise_data/infrastructure/parsers/pdf.py`
- Create: `services/data/src/bookwise_data/infrastructure/parsers/epub.py`
- Create: `services/data/src/bookwise_data/infrastructure/parsers/docx.py`
- Create: `services/data/src/bookwise_data/infrastructure/parsers/text.py`
- Create: `services/data/src/bookwise_data/infrastructure/storage/object-storage.py`
- Modify: `infrastructure/database/migrations/003_create_data_foundation.sql`

**Interfaces:**
- Produces: `data.source_documents`, `data.source_spans`, and
  `data.structure_nodes`.

- [ ] **Step 1: Define normalized source records**

Include source location, content hash, owner ID, book ID, parser version, and
stable sequence numbers.

- [ ] **Step 2: Implement parser adapters**

Accept selectable-text PDF, EPUB, DOCX, and TXT only. Reject unsupported and
empty documents with a permanent processing event.

- [ ] **Step 3: Persist immutable source records**

Write source spans and structure nodes in one transaction. Store normalized
artifacts in private object storage after the transaction commits.

- [ ] **Step 4: Verify manually**

Process one fixture for each supported type and inspect location metadata,
structure-node order, and source-span hashes in PostgreSQL.

- [ ] **Step 5: Commit**

```bash
git add services/data infrastructure/database/migrations
git commit -m "feat: add Python book ingestion"
```

### Task 3: Generate evidence, summaries, and embeddings

**Files:**
- Create: `services/data/src/bookwise_data/domain/generation.py`
- Create: `services/data/src/bookwise_data/application/generate_summary.py`
- Create: `services/data/src/bookwise_data/application/build_embeddings.py`
- Create: `services/data/src/bookwise_data/infrastructure/providers/model-provider.py`
- Create: `services/data/src/bookwise_data/infrastructure/database/generated-summary-repository.py`
- Modify: `infrastructure/database/migrations/003_create_data_foundation.sql`

**Interfaces:**
- Produces: immutable `data.generated_summaries`.
- Produces: source-linked evidence, citation data, validation status, and
  embeddings.

- [ ] **Step 1: Define immutable generation records**

Include `generation_version`, provider/model identifiers, input/output hashes,
source citation data, validation status, and a supersession link.

- [ ] **Step 2: Implement bounded processing**

Chunk only within source-section boundaries. Generate evidence before a summary
and preserve source citation identifiers through every reduction.

- [ ] **Step 3: Persist accepted generated artifacts**

Write only validated generated summaries. Record rejected or ambiguous output
as validation outcomes and events without publishing it as generated text.

- [ ] **Step 4: Verify manually**

Run a small book command with configured provider credentials and inspect one
immutable generated summary, its citations, event history, and embedding record.

- [ ] **Step 5: Commit**

```bash
git add services/data infrastructure/database/migrations
git commit -m "feat: generate Python book summaries"
```

## Plan Acceptance Checkpoint

- Python claims each processing command once per processing version.
- All source and generated data belongs to the command owner and book.
- A completed generated summary has immutable provenance and citations.
- Python emits sufficient events for NestJS to show progress and failures.
