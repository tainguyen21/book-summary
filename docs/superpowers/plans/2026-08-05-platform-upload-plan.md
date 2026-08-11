# Platform and Upload Implementation Plan

> **Superseded:** Use the August 11, 2026 NestJS and Python plan suite.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the hosted application foundation so invited users can authenticate, upload private book files, view their library, and enqueue durable processing jobs.

**Architecture:** A pnpm monorepo contains a Next.js web app and one Python backend package. FastAPI handles authentication, metadata, and signed uploads; PostgreSQL is canonical state; Redis/Celery delivers jobs; MinIO supplies S3-compatible storage for local development.

**Tech Stack:** Next.js, TypeScript, React, pnpm, Python, FastAPI, Pydantic, SQLAlchemy, Alembic, PostgreSQL, pgvector, Celery, Redis, boto3, pytest, Vitest, Playwright, Docker Compose

## Global Constraints

- Support invite-only access for 1-20 initial users.
- Store canonical users, books, objects, and jobs in PostgreSQL.
- Treat Redis queue delivery as at-least-once and noncanonical.
- Keep uploaded objects private and use short-lived signed URLs.
- Never run parsing or model work inside a web request.
- Carry an owner ID on every domain record.
- Use UUID primary keys and UTC timestamps.
- Make every API mutation idempotent.
- Do not add ingestion, summarization, search, OCR, billing, or public signup in this plan.

---

### Task 1: Bootstrap the monorepo and local services

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml`
- Create: `.editorconfig`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/eslint.config.mjs`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/page.test.tsx`
- Create: `services/backend/pyproject.toml`
- Create: `services/backend/uv.lock`
- Create: `services/backend/src/bookwise/__init__.py`
- Create: `services/backend/tests/test_package_import.py`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`

**Interfaces:**
- Produces: `pnpm test`, `pnpm lint`, and `uv run pytest` project entrypoints.
- Produces: local PostgreSQL, Redis, and MinIO endpoints from Docker Compose.

- [ ] **Step 1: Write the backend and web smoke tests**

```python
# services/backend/tests/test_package_import.py
def test_package_imports() -> None:
    import bookwise

    assert bookwise.__name__ == "bookwise"
```

```tsx
// apps/web/src/app/page.test.tsx
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

it("renders the library heading", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { name: "Your library" })).toBeVisible();
});
```

- [ ] **Step 2: Run the tests and verify the missing scaffolding fails**

Run:

```bash
pnpm --dir apps/web test
uv run --project services/backend pytest services/backend/tests/test_package_import.py -v
```

Expected: both commands fail because package manifests and application modules
do not exist yet.

- [ ] **Step 3: Create the workspace manifests and minimal applications**

Use this root script shape:

```json
{
  "private": true,
  "scripts": {
    "test": "pnpm --dir apps/web test",
    "lint": "pnpm --dir apps/web lint",
    "dev:web": "pnpm --dir apps/web dev"
  }
}
```

Install the web dependencies through pnpm so exact versions are captured in
`pnpm-lock.yaml`:

```bash
pnpm --dir apps/web add next react react-dom zod
pnpm --dir apps/web add -D @testing-library/jest-dom @testing-library/react @testing-library/user-event @types/node @types/react @types/react-dom eslint eslint-config-next jsdom typescript vitest
```

Use this Python package layout:

```toml
[project]
name = "bookwise-backend"
requires-python = ">=3.12"
dependencies = [
  "alembic",
  "boto3",
  "celery[redis]",
  "fastapi",
  "httpx",
  "pgvector",
  "pydantic-settings",
  "psycopg[binary]",
  "sqlalchemy",
  "uvicorn"
]

[dependency-groups]
dev = ["pytest", "pytest-asyncio", "pytest-cov", "ruff"]

[tool.pytest.ini_options]
pythonpath = ["src"]
asyncio_mode = "auto"
```

Configure Docker Compose services named `postgres`, `redis`, and `minio`.
Enable the pgvector extension through the PostgreSQL initialization directory.

- [ ] **Step 4: Install dependencies and run the smoke tests**

Run:

```bash
pnpm install
uv sync --project services/backend
docker compose config
pnpm --dir apps/web test
uv run --project services/backend pytest services/backend/tests/test_package_import.py -v
```

Expected: Docker Compose validates and both smoke tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .editorconfig .env.example docker-compose.yml apps services .github README.md
git commit -m "chore: bootstrap web and backend workspace"
```

### Task 2: Add typed configuration and health checks

**Files:**
- Create: `services/backend/src/bookwise/config.py`
- Create: `services/backend/src/bookwise/api/app.py`
- Create: `services/backend/src/bookwise/api/routes/health.py`
- Create: `services/backend/tests/api/test_health.py`
- Create: `apps/web/src/lib/config.ts`
- Create: `apps/web/src/lib/config.test.ts`

**Interfaces:**
- Produces: `Settings` loaded by `get_settings()`.
- Produces: `create_app(settings: Settings | None = None) -> FastAPI`.
- Produces: `GET /health/live` and `GET /health/ready`.

- [ ] **Step 1: Write failing backend health tests**

```python
from bookwise.api.app import create_app
from bookwise.config import Settings
from fastapi.testclient import TestClient

def test_liveness_is_process_only() -> None:
    settings = Settings(
        database_url="postgresql+psycopg://test:test@localhost/test",
        redis_url="redis://localhost:6379/15",
        s3_endpoint_url="http://localhost:9000",
        s3_bucket="test-books",
        s3_access_key_id="test",
        s3_secret_access_key="test",
        oidc_issuer="https://issuer.test",
        oidc_audience="bookwise-test",
    )
    response = TestClient(create_app(settings)).get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run the backend test and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/api/test_health.py -v
```

Expected: FAIL because `bookwise.api.app` does not exist.

- [ ] **Step 3: Implement settings and the app factory**

```python
# services/backend/src/bookwise/config.py
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: str = "development"
    database_url: str
    redis_url: str
    s3_endpoint_url: str
    s3_bucket: str
    s3_access_key_id: str
    s3_secret_access_key: str
    oidc_issuer: str
    oidc_audience: str

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`GET /health/ready` must execute `SELECT 1`, ping Redis, and verify the bucket
exists. Return HTTP 503 with component statuses when any dependency is down.

- [ ] **Step 4: Add and test browser environment validation**

```ts
// apps/web/src/lib/config.ts
import { z } from "zod";

export const publicConfig = z
  .object({ NEXT_PUBLIC_API_URL: z.string().url() })
  .parse({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL });
```

Run:

```bash
pnpm --dir apps/web test
uv run --project services/backend pytest services/backend/tests/api/test_health.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/config.py services/backend/src/bookwise/api apps/web/src/lib services/backend/tests/api
git commit -m "feat: add typed configuration and health checks"
```

### Task 3: Create canonical database models and migrations

**Files:**
- Create: `services/backend/alembic.ini`
- Create: `services/backend/alembic/env.py`
- Create: `services/backend/alembic/versions/0001_platform_tables.py`
- Create: `services/backend/src/bookwise/db/base.py`
- Create: `services/backend/src/bookwise/db/session.py`
- Create: `services/backend/src/bookwise/db/models/user.py`
- Create: `services/backend/src/bookwise/db/models/book.py`
- Create: `services/backend/src/bookwise/db/models/job.py`
- Create: `services/backend/tests/db/test_platform_models.py`

**Interfaces:**
- Produces: `session_scope(principal_id: UUID | None)`.
- Produces: `User`, `Invitation`, `Book`, `BookObject`, and `ProcessingJob`.
- Produces: `JobStatus` with the six approved values.

- [ ] **Step 1: Write failing model tests**

```python
from bookwise.db.models.job import JobStatus

def test_job_status_values_are_stable() -> None:
    assert {item.value for item in JobStatus} == {
        "queued",
        "running",
        "completed",
        "retryable_failed",
        "permanent_failed",
        "needs_review",
    }
```

Add an integration test that inserts one user, invitation, book, object, and
queued job, then reloads their relationships.

- [ ] **Step 2: Run the model tests and verify failure**

Run:

```bash
docker compose up -d postgres
uv run --project services/backend pytest services/backend/tests/db/test_platform_models.py -v
```

Expected: FAIL because the models and migration do not exist.

- [ ] **Step 3: Implement models and migration**

Use SQLAlchemy 2 typed mappings:

```python
class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    __table_args__ = (
        UniqueConstraint(
            "job_type",
            "target_id",
            "processing_version",
            name="uq_processing_job_identity",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    job_type: Mapped[str]
    target_id: Mapped[UUID] = mapped_column(Uuid)
    processing_version: Mapped[str]
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus))
    attempt_count: Mapped[int] = mapped_column(default=0)
```

Enable `vector` and `pgcrypto` extensions in the migration. Store timestamps as
timezone-aware values and add owner indexes to every domain table.

- [ ] **Step 4: Apply the migration and run tests**

Run:

```bash
uv run --project services/backend alembic upgrade head
uv run --project services/backend pytest services/backend/tests/db/test_platform_models.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/alembic* services/backend/src/bookwise/db services/backend/tests/db
git commit -m "feat: add canonical platform schema"
```

### Task 4: Implement OIDC authentication and invitation enforcement

**Files:**
- Create: `services/backend/src/bookwise/auth/contracts.py`
- Create: `services/backend/src/bookwise/auth/jwks.py`
- Create: `services/backend/src/bookwise/auth/dependencies.py`
- Create: `services/backend/src/bookwise/auth/service.py`
- Create: `services/backend/src/bookwise/api/routes/session.py`
- Create: `services/backend/tests/auth/test_invitation_auth.py`
- Modify: `services/backend/pyproject.toml`

**Interfaces:**
- Consumes: `session_scope`.
- Produces: `TokenVerifier.verify(token: str) -> OidcClaims`.
- Produces: `get_current_principal() -> AuthPrincipal`.
- Produces: `POST /v1/session/sync`.

- [ ] **Step 1: Write failing invitation tests**

```python
async def test_uninvited_identity_is_rejected(auth_client, token_factory) -> None:
    token = token_factory(email="unknown@example.com", subject="oidc-1")
    response = await auth_client.post(
        "/v1/session/sync",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Invitation required"
```

Add tests for invited first login, repeat login idempotency, disabled user, and
invalid audience.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/auth/test_invitation_auth.py -v
```

Expected: FAIL because authentication modules do not exist.

- [ ] **Step 3: Implement token verification and user synchronization**

```python
@dataclass(frozen=True)
class OidcClaims:
    subject: str
    email: str
    issuer: str
    audience: str

class TokenVerifier(Protocol):
    async def verify(self, token: str) -> OidcClaims: ...
```

`AuthService.sync_identity` must:

1. Verify issuer and audience.
2. Normalize the email to lowercase.
3. Lock the invitation row.
4. Reject missing, expired, or consumed-by-another-subject invitations.
5. Create or update the user.
6. Mark the invitation accepted in the same transaction.

Add `PyJWT[crypto]` to backend dependencies. Cache the OIDC JWKS according to
HTTP cache headers and refresh once when a token references an unknown key ID.

- [ ] **Step 4: Run the authentication tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/auth/test_invitation_auth.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/auth services/backend/src/bookwise/api/routes/session.py services/backend/tests/auth services/backend/pyproject.toml
git commit -m "feat: enforce invite-only OIDC authentication"
```

### Task 5: Enforce PostgreSQL row-level security

**Files:**
- Create: `services/backend/alembic/versions/0002_row_level_security.py`
- Modify: `services/backend/src/bookwise/db/session.py`
- Create: `services/backend/tests/security/test_row_level_security.py`

**Interfaces:**
- Consumes: `AuthPrincipal.user_id`.
- Produces: transaction-local PostgreSQL setting `app.user_id`.
- Produces: RLS policies for `books`, `book_objects`, and `processing_jobs`.

- [ ] **Step 1: Write a failing cross-user database test**

```python
async def test_user_cannot_select_another_users_book(db, user_a, user_b, book_b):
    async with db.session_scope(principal_id=user_a.id) as session:
        result = await session.get(Book, book_b.id)
    assert result is None
```

- [ ] **Step 2: Run the security test and verify it exposes the book**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/security/test_row_level_security.py -v
```

Expected: FAIL because the query returns `book_b`.

- [ ] **Step 3: Add transaction context and RLS policies**

At the start of every authenticated transaction, execute:

```python
await session.execute(
    text("select set_config('app.user_id', :user_id, true)"),
    {"user_id": str(principal_id)},
)
```

Create policies using:

```sql
USING (owner_id = current_setting('app.user_id', true)::uuid)
WITH CHECK (owner_id = current_setting('app.user_id', true)::uuid)
```

Create a separate database role for migrations and administrative jobs. The API
role must not have `BYPASSRLS`.

- [ ] **Step 4: Apply migration and run security tests**

Run:

```bash
uv run --project services/backend alembic upgrade head
uv run --project services/backend pytest services/backend/tests/security/test_row_level_security.py -v
```

Expected: PASS for read and write isolation tests.

- [ ] **Step 5: Commit**

```bash
git add services/backend/alembic/versions/0002_row_level_security.py services/backend/src/bookwise/db/session.py services/backend/tests/security
git commit -m "feat: enforce per-user row level security"
```

### Task 6: Implement private signed book uploads

**Files:**
- Create: `services/backend/src/bookwise/storage/contracts.py`
- Create: `services/backend/src/bookwise/storage/s3.py`
- Create: `services/backend/src/bookwise/domain/uploads.py`
- Create: `services/backend/src/bookwise/api/routes/books.py`
- Create: `services/backend/tests/domain/test_upload_service.py`
- Create: `services/backend/tests/api/test_book_uploads.py`

**Interfaces:**
- Consumes: `ObjectStorage`.
- Produces: `ObjectStorage.upload_file(key, path, content_type)` for worker
  artifacts used by later plans.
- Produces: `UploadService.create(owner_id, filename, content_type, size_bytes)`.
- Produces: `POST /v1/books/uploads`.
- Produces: `POST /v1/books/{book_id}/uploads/finalize`.

- [ ] **Step 1: Write failing upload-service tests**

```python
async def test_create_upload_namespaces_object_by_owner(
    upload_service, owner, fake_storage
):
    result = await upload_service.create(
        owner_id=owner.id,
        filename="systems.pdf",
        content_type="application/pdf",
        size_bytes=1024,
    )
    assert result.object_key.startswith(f"users/{owner.id}/books/{result.book_id}/")
    assert fake_storage.requested_content_type == "application/pdf"
```

Add tests rejecting unsupported MIME types, empty files, and files over the
configured upload limit.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/domain/test_upload_service.py services/backend/tests/api/test_book_uploads.py -v
```

Expected: FAIL because upload services and routes do not exist.

- [ ] **Step 3: Implement the storage adapter and upload service**

```python
@dataclass(frozen=True)
class StoredObject:
    key: str
    size_bytes: int
    content_type: str
    etag: str

@dataclass(frozen=True)
class PendingUpload:
    book_id: UUID
    object_key: str
    upload_url: str
    expires_at: datetime
```

The finalize operation must call `head`, compare size and content type, update
the `BookObject` state, and create one canonical `ingest_book` job in the same
PostgreSQL transaction.

Implement `upload_file` with the S3 multipart uploader and return a
`StoredObject` populated from a post-upload `head_object` call. Add a test that
uploads a temporary normalized artifact and verifies its size, MIME type, and
owner-scoped key.

- [ ] **Step 4: Run upload tests against fake storage and MinIO**

Run:

```bash
docker compose up -d postgres minio
uv run --project services/backend pytest services/backend/tests/domain/test_upload_service.py services/backend/tests/api/test_book_uploads.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/storage services/backend/src/bookwise/domain/uploads.py services/backend/src/bookwise/api/routes/books.py services/backend/tests
git commit -m "feat: add private signed book uploads"
```

### Task 7: Add durable job delivery and reconciliation

**Files:**
- Create: `services/backend/src/bookwise/worker/celery_app.py`
- Create: `services/backend/src/bookwise/worker/dispatcher.py`
- Create: `services/backend/src/bookwise/worker/tasks.py`
- Create: `services/backend/src/bookwise/worker/reconciler.py`
- Create: `services/backend/tests/worker/test_job_delivery.py`

**Interfaces:**
- Consumes: canonical `ProcessingJob`.
- Produces: `JobDispatcher.enqueue(job_id: UUID) -> None`.
- Produces: Celery task `bookwise.worker.tasks.execute_job`.
- Produces: `reconcile_queued_jobs(limit: int) -> int`.

- [ ] **Step 1: Write failing at-least-once delivery tests**

```python
async def test_duplicate_delivery_runs_one_canonical_attempt(job_runner, queued_job):
    await job_runner.execute(queued_job.id)
    await job_runner.execute(queued_job.id)
    attempts = await job_runner.list_attempts(queued_job.id)
    assert len([a for a in attempts if a.status == "completed"]) == 1
```

Add a test where the Redis delivery is absent but the PostgreSQL job remains
queued; the reconciler must enqueue it.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/worker/test_job_delivery.py -v
```

Expected: FAIL because dispatcher and reconciler do not exist.

- [ ] **Step 3: Implement transactional claiming and reconciliation**

Claim jobs with:

```sql
select id
from processing_jobs
where id = :job_id and status in ('queued', 'retryable_failed')
for update skip locked
```

Set `running` and increment `attempt_count` before executing the handler.
Acknowledge the Celery delivery only after the PostgreSQL state transition is
committed. The reconciler scans eligible canonical jobs and republishes their
IDs.

- [ ] **Step 4: Run worker tests with Redis**

Run:

```bash
docker compose up -d postgres redis
uv run --project services/backend pytest services/backend/tests/worker/test_job_delivery.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/worker services/backend/tests/worker
git commit -m "feat: add durable background job delivery"
```

### Task 8: Build the authenticated library and upload interface

**Files:**
- Create: `apps/web/src/lib/api/client.ts`
- Create: `apps/web/src/auth.ts`
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/src/lib/auth/session.ts`
- Create: `apps/web/src/app/library/page.tsx`
- Create: `apps/web/src/components/library/book-list.tsx`
- Create: `apps/web/src/components/library/upload-button.tsx`
- Create: `apps/web/src/components/library/upload-progress.tsx`
- Create: `apps/web/tests/library-page.test.tsx`
- Create: `apps/web/tests/upload-flow.test.tsx`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: configured OIDC discovery URL, client ID, and client secret.
- Consumes: `POST /v1/session/sync`.
- Consumes: `POST /v1/books/uploads` and finalize endpoint.
- Produces: browser upload flow with progress and retry.

- [ ] **Step 1: Write failing component tests**

```tsx
it("uploads directly and finalizes the book", async () => {
  const api = createFakeApi();
  render(<UploadButton api={api} />);

  await userEvent.upload(
    screen.getByLabelText("Choose book"),
    new File(["book"], "book.pdf", { type: "application/pdf" }),
  );

  expect(api.createUpload).toHaveBeenCalledWith({
    filename: "book.pdf",
    contentType: "application/pdf",
    sizeBytes: 4,
  });
  expect(api.finalizeUpload).toHaveBeenCalledTimes(1);
});
```

Add tests for unsupported types, upload failure, finalize retry, empty library,
and queued processing status.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --dir apps/web test
```

Expected: FAIL because the library components do not exist.

- [ ] **Step 3: Implement the library and upload flow**

Configure Auth.js with the OIDC provider. Persist the provider access token in
the encrypted server session and attach it as a bearer token only from the
server-side API client. The browser must never receive the OIDC client secret.

Install the authentication package:

```bash
pnpm --dir apps/web add next-auth
```

The browser must:

1. Request upload metadata from the API.
2. `PUT` the file to the signed URL while reporting progress.
3. Call finalize only after object upload succeeds.
4. Add the queued book to the library without a full page reload.
5. Poll or subscribe to processing status.

Use native inputs for file selection and an icon button for retry. Do not
expose storage credentials or object keys in visible UI text.

- [ ] **Step 4: Run web tests**

Run:

```bash
pnpm --dir apps/web test
pnpm --dir apps/web lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add private library upload experience"
```

### Task 9: Verify the platform milestone end to end

**Files:**
- Create: `apps/web/tests/e2e/platform-upload.spec.ts`
- Create: `apps/web/tests/e2e/helpers/auth.ts`
- Create: `apps/web/tests/e2e/helpers/uploads.ts`
- Create: `infrastructure/scripts/create-test-invitation.py`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: all platform and upload interfaces.
- Produces: one reproducible end-to-end milestone check.

- [ ] **Step 1: Write the failing Playwright scenario**

```ts
test("invited user uploads a private book and receives a queued job", async ({
  page,
}) => {
  await signInAsInvitedUser(page, "reader@example.com");
  await page.goto("/library");
  await page.getByLabel("Choose book").setInputFiles("tests/fixtures/book.txt");
  await expect(page.getByText("Queued")).toBeVisible();
  await expect(page.getByText("book.txt")).toBeVisible();
});
```

- [ ] **Step 2: Run the scenario and verify failure**

Run:

```bash
docker compose up -d
pnpm --dir apps/web exec playwright test tests/e2e/platform-upload.spec.ts
```

Expected: FAIL until the test invitation helper, test identity, and complete
service startup are wired together.

- [ ] **Step 3: Add deterministic test identity and CI orchestration**

Test authentication may use a locally signed JWT only when
`ENVIRONMENT=test`. Production startup must fail if test authentication is
enabled.

Create shared Playwright helpers with these exact signatures:

```ts
export async function signInAsInvitedUser(
  page: Page,
  email: string,
): Promise<void>;

export async function uploadFixture(
  page: Page,
  fixturePath: string,
): Promise<void>;
```

Update CI to:

1. Start PostgreSQL, Redis, and MinIO.
2. Run Alembic migrations.
3. Start API, worker, and web services.
4. Create one invitation.
5. Run backend tests, web tests, and Playwright.

- [ ] **Step 4: Run the complete milestone verification**

Run:

```bash
docker compose up -d
uv run --project services/backend alembic upgrade head
uv run --project services/backend pytest -v
pnpm --dir apps/web test
pnpm --dir apps/web exec playwright test tests/e2e/platform-upload.spec.ts
```

Expected: all commands pass. PostgreSQL contains one owner-scoped book,
one verified object record, and one queued `ingest_book` job.

- [ ] **Step 5: Commit**

```bash
git add .github README.md infrastructure apps/web/tests/e2e
git commit -m "test: verify invited upload milestone"
```

## Plan Acceptance Checkpoint

Before starting the ingestion plan, verify:

```bash
docker compose up -d
uv run --project services/backend alembic upgrade head
uv run --project services/backend pytest -v
pnpm --dir apps/web test
pnpm --dir apps/web lint
pnpm --dir apps/web exec playwright test tests/e2e/platform-upload.spec.ts
```

The checkpoint passes only when:

- An uninvited identity receives HTTP 403.
- An invited identity is synchronized exactly once.
- Cross-user database reads and writes are denied.
- A supported book uploads directly to private object storage.
- Finalization creates exactly one canonical queued job.
- Duplicate queue delivery creates no duplicate completed attempt.
- The library UI displays the new private book and its queued status.
