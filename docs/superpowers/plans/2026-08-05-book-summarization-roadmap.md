# Book Summarization System Implementation Roadmap

> **Superseded:** Use `2026-08-11-nestjs-python-roadmap.md`. This roadmap
> describes the replaced FastAPI-centric architecture.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved invite-only, evidence-first book summarization web application through five independently reviewable implementation plans.

**Architecture:** A Next.js web client talks to a FastAPI service. PostgreSQL with pgvector is canonical storage, S3-compatible object storage holds book files, Redis delivers background jobs, and the same Python package runs API and Celery worker entrypoints. Processing traverses every detected section, records source-linked evidence, verifies claims, and recursively synthesizes summaries.

**Tech Stack:** TypeScript, Next.js, pnpm, Python, FastAPI, SQLAlchemy, Alembic, Pydantic, Celery, Redis, PostgreSQL, pgvector, S3-compatible storage, pytest, Vitest, Playwright, Docker Compose

## Global Constraints

- The product is a hosted invite-only website for an initial 1-20 users.
- Every user's books, summaries, search records, and object-storage keys are private.
- PostgreSQL is authoritative for users, books, jobs, evidence, summaries, citations, and coverage.
- Redis provides at-least-once delivery but never becomes canonical job storage.
- Whole-book work always runs in background workers, never inside a web request.
- PDF, EPUB, DOCX, and TXT are the only ingestion formats in the first release.
- OCR, fiction-specific analysis, public registration, billing, and collaboration are out of scope.
- Every published factual claim must reference valid source spans.
- Every detected leaf section must have an explicit final coverage status.
- Cloud and private model endpoints must use the same provider interface.
- Generated records are versioned and immutable after publication.
- All implementation tasks use test-driven development and end in a focused commit.

---

## Plan Suite

Execute the plans in this order:

1. [Platform and Upload](./2026-08-05-platform-upload-plan.md)
2. [Ingestion and Structure](./2026-08-05-ingestion-structure-plan.md)
3. [Evidence and Summarization](./2026-08-05-evidence-summarization-plan.md)
4. [Search and Question Answering](./2026-08-05-search-qa-plan.md)
5. [Production Hardening](./2026-08-05-production-hardening-plan.md)

Each plan must pass its acceptance checkpoint before work starts on the next
plan.

## Locked Repository Structure

```text
.
|-- apps/
|   `-- web/
|       |-- src/app/
|       |-- src/components/
|       |-- src/lib/
|       `-- tests/
|-- services/
|   `-- backend/
|       |-- alembic/
|       |-- src/bookwise/
|       |   |-- api/
|       |   |-- auth/
|       |   |-- db/
|       |   |-- domain/
|       |   |-- ingestion/
|       |   |-- models/
|       |   |-- providers/
|       |   |-- search/
|       |   |-- storage/
|       |   |-- summarization/
|       |   `-- worker/
|       `-- tests/
|-- infrastructure/
|   |-- docker/
|   `-- scripts/
|-- docs/
|   `-- superpowers/
|-- docker-compose.yml
|-- package.json
|-- pnpm-workspace.yaml
`-- README.md
```

The backend is one Python package with separate API and worker processes. This
keeps domain types, database models, pipeline services, and validation logic in
one codebase while allowing independent deployment and scaling.

## Shared Cross-Plan Interfaces

The following names are fixed across the plan suite:

```python
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

@dataclass(frozen=True)
class AuthPrincipal:
    user_id: UUID
    email: str
    is_admin: bool

@dataclass(frozen=True)
class JobEnvelope:
    job_id: UUID
    job_type: str
    target_id: UUID
    processing_version: str

class ObjectStorage(Protocol):
    async def create_upload_url(self, *, key: str, content_type: str) -> str: ...
    async def create_download_url(self, *, key: str) -> str: ...
    async def head(self, *, key: str) -> "StoredObject": ...
    async def open(self, *, key: str) -> "AsyncBinaryIO": ...
    async def upload_file(
        self,
        *,
        key: str,
        path: "Path",
        content_type: str,
    ) -> "StoredObject": ...

class ModelProvider(Protocol):
    async def generate_structured(
        self,
        *,
        task: str,
        messages: list["ModelMessage"],
        schema: type["ModelOutput"],
    ) -> "ModelResult": ...

    async def embed(self, *, texts: list[str]) -> list[list[float]]: ...

class ModelRoutingService(Protocol):
    async def resolve(
        self,
        *,
        owner_id: UUID,
        task: str,
        run_override_id: UUID | None = None,
    ) -> "ResolvedModelRoute": ...
```

The canonical job states are:

```text
queued
running
completed
retryable_failed
permanent_failed
needs_review
```

The canonical coverage states are:

```text
pending
processing
complete
retryable_failed
permanent_failed
needs_review
```

## Milestone Checkpoints

### Milestone 1: Hosted application foundation

Users can authenticate, upload a supported file directly to private object
storage, see it in their library, and observe a canonical queued job.

### Milestone 2: Deterministic ingestion

All four supported formats produce normalized source spans, a reviewable
structure tree, section-bounded chunks, and explicit ingestion coverage.

### Milestone 3: Evidence-first summaries

Workers extract evidence, reject unsupported claims, complete the coverage
ledger, and publish section through whole-book summaries with citations.

### Milestone 4: Searchable knowledge base

Users can search exact and semantic content, ask cited questions, and open the
original source location.

### Milestone 5: Production readiness

Security, reliability, evaluation, load, backup, restore, observability, and
deployment checks satisfy the approved release criteria.
