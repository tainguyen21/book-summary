# Production Hardening Implementation Plan

> **Superseded:** Use the August 11, 2026 NestJS and Python plan suite.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satisfy the approved security, reliability, evaluation, load, backup, restore, observability, and deployment release criteria.

**Architecture:** Application and worker processes emit correlated structured telemetry without raw book text. PostgreSQL remains the recovery authority for job state, automated evaluation measures support precision and key-point recall, security tests exercise every tenant boundary, and containerized services pass a reproducible release gate before deployment.

**Tech Stack:** Python, FastAPI, Celery, PostgreSQL, Redis, S3-compatible storage, OpenTelemetry, Prometheus client, structlog, pytest, Locust, Playwright, Docker, GitHub Actions

## Global Constraints

- Preserve the approved 1-20 user initial deployment target.
- Maintain per-user RLS and API authorization on every new domain table.
- Keep raw book text, model prompts, secrets, and signed URLs out of logs.
- Make queued PostgreSQL jobs recoverable after Redis loss.
- Use bounded retries with exponential backoff and jitter.
- Meet 100% structural status and citation-integrity release gates.
- Meet at least 98% supported-claim precision and 90% key-point recall.
- Pass cross-user isolation and retry-idempotency tests with zero violations.
- Verify backup restoration before production launch.
- Keep deployment provider-neutral and container-based.
- Do not add public signup, billing, OCR, fiction features, or shared libraries.

---

### Task 1: Add correlated, redacted observability

**Files:**
- Create: `services/backend/src/bookwise/observability/logging.py`
- Create: `services/backend/src/bookwise/observability/redaction.py`
- Create: `services/backend/src/bookwise/observability/metrics.py`
- Create: `services/backend/src/bookwise/observability/tracing.py`
- Modify: `services/backend/src/bookwise/api/app.py`
- Modify: `services/backend/src/bookwise/worker/celery_app.py`
- Create: `services/backend/tests/observability/test_redaction.py`
- Create: `services/backend/tests/observability/test_correlation.py`
- Modify: `services/backend/pyproject.toml`

**Interfaces:**
- Produces: `configure_observability(service_name, environment)`.
- Produces: `redact_event(event: dict) -> dict`.
- Produces: request, book, job, model-run, and trace correlation IDs.

- [ ] **Step 1: Write failing redaction tests**

```python
def test_redactor_removes_sensitive_content() -> None:
    event = {
        "book_text": "copyrighted paragraph",
        "prompt": "private prompt",
        "authorization": "Bearer secret",
        "signed_url": "https://storage/object?signature=secret",
        "book_id": "book-1",
    }
    redacted = redact_event(event)
    assert redacted["book_id"] == "book-1"
    assert redacted["book_text"] == "[REDACTED]"
    assert redacted["authorization"] == "[REDACTED]"
    assert "signature" not in redacted["signed_url"]
```

Add tests that API request IDs propagate into enqueued job headers and worker
logs.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/observability -v
```

Expected: FAIL because observability modules do not exist.

- [ ] **Step 3: Implement telemetry**

Emit JSON logs with:

```text
timestamp
level
service
environment
request_id
trace_id
owner_id
book_id
job_id
model_run_id
event
duration_ms
```

Hash owner IDs before exporting to third-party telemetry. Export counters and
histograms for queue time, processing duration, retries, provider latency,
token usage, estimated cost, validation outcomes, and coverage gaps.

Add `structlog`, `opentelemetry-api`, `opentelemetry-sdk`,
`opentelemetry-instrumentation-fastapi`,
`opentelemetry-instrumentation-celery`, and `prometheus-client` to backend
dependencies.

- [ ] **Step 4: Run tests**

Run:

```bash
uv sync --project services/backend
uv run --project services/backend pytest services/backend/tests/observability -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/observability services/backend/src/bookwise/api/app.py services/backend/src/bookwise/worker/celery_app.py services/backend/tests/observability services/backend/pyproject.toml
git commit -m "feat: add redacted application observability"
```

### Task 2: Complete RLS coverage and security regression tests

**Files:**
- Create: `services/backend/alembic/versions/0006_complete_rls.py`
- Create: `services/backend/tests/security/test_all_domain_rls.py`
- Create: `services/backend/tests/security/test_signed_urls.py`
- Create: `services/backend/tests/security/test_prompt_injection.py`
- Create: `services/backend/tests/security/test_secret_exposure.py`

**Interfaces:**
- Consumes: every domain table created by all prior plans.
- Produces: RLS policies for structure, source, coverage, evidence, summary,
  model-run, validation, search, and embedding tables.

- [ ] **Step 1: Write a parameterized failing RLS suite**

```python
@pytest.mark.parametrize(
    "model_name",
    [
        "StructureNode",
        "SourceSpan",
        "Chunk",
        "CoverageEntry",
        "EvidenceItem",
        "Summary",
        "ModelRun",
        "ValidationResult",
        "SearchDocument",
        "EmbeddingRecord",
    ],
)
async def test_domain_table_hides_other_owner_rows(model_name, rls_fixture):
    visible = await rls_fixture.query_as_user_a(model_name)
    assert rls_fixture.user_b_row_id(model_name) not in visible
```

Add tests that signed URLs expire, permit only one object operation, and cannot
be exchanged across users. Add a fixture book containing prompt injection and
assert it cannot change the extraction schema or expose secrets.

- [ ] **Step 2: Run security tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/security -v
```

Expected: FAIL for domain tables without RLS.

- [ ] **Step 3: Add complete policies and secure defaults**

Enable and force RLS on every owner-scoped table. Administrative maintenance
uses a distinct role and explicit audited code paths.

Production startup must reject:

- Wildcard CORS origins.
- Test authentication.
- HTTP object-storage endpoints.
- Missing OIDC audience.
- Default or empty secrets.
- Signed URL lifetimes over 15 minutes.

- [ ] **Step 4: Apply migration and run security tests**

Run:

```bash
uv run --project services/backend alembic upgrade head
uv run --project services/backend pytest services/backend/tests/security -v
```

Expected: PASS with zero successful cross-user access.

- [ ] **Step 5: Commit**

```bash
git add services/backend/alembic/versions/0006_complete_rls.py services/backend/tests/security services/backend/src/bookwise/config.py
git commit -m "security: enforce all tenant boundaries"
```

### Task 3: Add administrative controls and audit events

**Files:**
- Create: `services/backend/src/bookwise/db/models/audit.py`
- Create: `services/backend/src/bookwise/db/models/provider_control.py`
- Create: `services/backend/alembic/versions/0007_admin_audit.py`
- Create: `services/backend/src/bookwise/domain/admin.py`
- Create: `services/backend/src/bookwise/api/routes/admin.py`
- Create: `services/backend/tests/api/test_admin.py`
- Create: `apps/web/src/app/admin/page.tsx`
- Create: `apps/web/src/components/admin/user-table.tsx`
- Create: `apps/web/src/components/admin/job-table.tsx`
- Create: `apps/web/src/components/admin/provider-controls.tsx`
- Create: `apps/web/tests/admin.test.tsx`

**Interfaces:**
- Produces: immutable `AuditEvent`.
- Produces: global `ProviderControl(provider_name, enabled, reason)`.
- Produces: invite, deactivate, retry, provider-disable, and reindex operations.
- Produces: administrator-only `/v1/admin/*` endpoints.

- [ ] **Step 1: Write failing authorization and audit tests**

```python
async def test_non_admin_cannot_retry_another_users_job(api_client, other_job):
    response = await api_client.post(f"/v1/admin/jobs/{other_job.id}/retry")
    assert response.status_code == 403

async def test_admin_action_creates_audit_event(admin_client, failed_job):
    await admin_client.post(f"/v1/admin/jobs/{failed_job.id}/retry")
    event = await latest_audit_event()
    assert event.action == "job.retry"
    assert event.target_id == failed_job.id
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/api/test_admin.py -v
pnpm --dir apps/web test -- admin
```

Expected: FAIL because admin services and UI do not exist.

- [ ] **Step 3: Implement focused admin actions**

Admin actions are:

- Create or revoke invitation.
- Deactivate user.
- Retry job, chunk, section, index, or book.
- Disable or enable a model provider route.
- Rebuild book indexes.
- View usage, cost, failures, and coverage gaps.

`ModelRoutingService` checks `ProviderControl` after resolving an owner route.
Disabling a provider blocks new calls immediately, marks affected queued work
`needs_review` with issue code `provider_disabled`, and does not rewrite the
owner's saved route.

Audit events contain actor, action, target type, target ID, timestamp, and
sanitized metadata. They never contain raw source text or prompt content.

- [ ] **Step 4: Run admin tests**

Run:

```bash
uv run --project services/backend alembic upgrade head
uv run --project services/backend pytest services/backend/tests/api/test_admin.py -v
pnpm --dir apps/web test -- admin
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/alembic/versions/0007_admin_audit.py services/backend/src/bookwise/db/models/audit.py services/backend/src/bookwise/db/models/provider_control.py services/backend/src/bookwise/domain/admin.py services/backend/src/bookwise/api/routes/admin.py services/backend/tests/api/test_admin.py apps/web
git commit -m "feat: add audited administration controls"
```

### Task 4: Harden retries, reconciliation, and worker shutdown

**Files:**
- Create: `services/backend/src/bookwise/worker/backoff.py`
- Modify: `services/backend/src/bookwise/worker/reconciler.py`
- Modify: `services/backend/src/bookwise/worker/tasks.py`
- Create: `services/backend/tests/reliability/test_backoff.py`
- Create: `services/backend/tests/reliability/test_redis_loss.py`
- Create: `services/backend/tests/reliability/test_worker_shutdown.py`
- Create: `services/backend/tests/reliability/test_duplicate_delivery.py`

**Interfaces:**
- Produces: `retry_delay(attempt, base_seconds, cap_seconds, jitter_seed)`.
- Produces: stale-running-job recovery.
- Produces: graceful worker checkpoint and delivery rejection.

- [ ] **Step 1: Write failing reliability tests**

```python
def test_backoff_is_bounded_and_deterministic() -> None:
    delays = [
        retry_delay(i, base_seconds=5, cap_seconds=300, jitter_seed=10)
        for i in range(1, 10)
    ]
    assert all(0 < delay <= 300 for delay in delays)
    assert delays == [
        retry_delay(i, base_seconds=5, cap_seconds=300, jitter_seed=10)
        for i in range(1, 10)
    ]

async def test_redis_loss_does_not_lose_postgres_job(reconciler, queued_job):
    await delete_all_redis_messages()
    count = await reconciler.run_once()
    assert count == 1
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/reliability -v
```

Expected: FAIL because hardened retry behavior does not exist.

- [ ] **Step 3: Implement explicit failure classes and recovery**

Use full-jitter exponential backoff:

```python
maximum = min(cap_seconds, base_seconds * (2 ** (attempt - 1)))
return random.Random(jitter_seed + attempt).uniform(0, maximum)
```

On graceful shutdown, workers finish or checkpoint the current atomic unit,
commit state, and reject the delivery for redelivery when incomplete.

The reconciler:

- Re-enqueues eligible queued and retryable jobs.
- Moves stale `running` jobs to `retryable_failed`.
- Never retries `permanent_failed` or `needs_review`.
- Emits a metric for every recovery.

- [ ] **Step 4: Run reliability tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/reliability -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/worker services/backend/tests/reliability
git commit -m "reliability: harden retries and job recovery"
```

### Task 5: Build the golden evaluation harness

**Files:**
- Create: `services/backend/src/bookwise/evaluation/schema.py`
- Create: `services/backend/src/bookwise/evaluation/claim_precision.py`
- Create: `services/backend/src/bookwise/evaluation/keypoint_recall.py`
- Create: `services/backend/src/bookwise/evaluation/citation_integrity.py`
- Create: `services/backend/src/bookwise/evaluation/runner.py`
- Create: `services/backend/tests/evaluation/test_metrics.py`
- Create: `services/backend/tests/evaluation/test_runner.py`
- Create: `services/backend/tests/fixtures/evaluation/corpus_manifest.json`

**Interfaces:**
- Produces: `EvaluationCase`, `AnnotatedKeyPoint`, and `EvaluationReport`.
- Produces: `evaluate_corpus(manifest_path) -> EvaluationReport`.

- [ ] **Step 1: Write failing metric tests**

```python
def test_supported_claim_precision() -> None:
    score = supported_claim_precision(
        [True, True, False, True],
    )
    assert score == pytest.approx(0.75)

def test_keypoint_recall() -> None:
    score = keypoint_recall(
        matched_keypoint_ids={"k1", "k3"},
        expected_keypoint_ids={"k1", "k2", "k3", "k4"},
    )
    assert score == pytest.approx(0.5)
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/evaluation -v
```

Expected: FAIL because evaluation modules do not exist.

- [ ] **Step 3: Implement reproducible evaluation**

The manifest records fixture path, expected outline, key points, required
citations, and known conflicts. The report contains:

```python
class EvaluationReport(BaseModel):
    structural_status_rate: float
    citation_validity_rate: float
    supported_claim_precision: float
    keypoint_recall: float
    duplicate_generated_records: int
    case_results: list[EvaluationCaseResult]
```

Key-point matching uses a configured evaluator model with source and candidate
IDs hidden, plus a deterministic lexical fallback. Human reviewers approve the
corpus annotations before they enter the release gate.

- [ ] **Step 4: Run evaluation tests and a deterministic fixture report**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/evaluation -v
uv run --project services/backend python -m bookwise.evaluation.runner services/backend/tests/fixtures/evaluation/corpus_manifest.json
```

Expected: tests pass and the fixture report is written to
`artifacts/evaluation/report.json`.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/evaluation services/backend/tests/evaluation services/backend/tests/fixtures/evaluation/corpus_manifest.json
git commit -m "test: add golden corpus evaluation harness"
```

### Task 6: Add initial-scale load tests

**Files:**
- Create: `infrastructure/load/locustfile.py`
- Create: `infrastructure/load/fixtures.py`
- Create: `infrastructure/load/README.md`
- Create: `services/backend/tests/performance/test_query_counts.py`
- Modify: `services/backend/pyproject.toml`

**Interfaces:**
- Produces: `LibraryUser`, `ReaderUser`, and `UploaderUser` load scenarios.
- Produces: repeatable 20-user, four-active-job benchmark.

- [ ] **Step 1: Write failing query-count tests**

```python
async def test_library_page_uses_bounded_queries(query_counter, api_client):
    await api_client.get("/v1/books")
    assert query_counter.count <= 5

async def test_outline_read_uses_bounded_queries(query_counter, api_client, book):
    await api_client.get(f"/v1/books/{book.id}/outline")
    assert query_counter.count <= 6
```

- [ ] **Step 2: Run query tests and baseline Locust**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/performance -v
uv run --project services/backend locust -f infrastructure/load/locustfile.py --headless -u 20 -r 4 -t 2m
```

Expected: query tests or latency thresholds fail before optimization.

- [ ] **Step 3: Implement load profiles and remove measured bottlenecks**

The load mix is:

- 10 users browsing libraries and summaries.
- 6 users searching and asking questions.
- 4 users uploading while four processing jobs remain active.

Set failure thresholds:

```text
HTTP failure rate < 1%
p95 library and summary reads < 1000 ms
p95 search < 1500 ms
p95 upload-init and finalize < 1000 ms
worker heartbeats remain healthy
```

Optimize only bottlenecks demonstrated by the profile. Add eager loading,
indexes, or pagination with regression tests.

Add `locust` to the backend development dependency group.

- [ ] **Step 4: Run the load checkpoint**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/performance -v
uv run --project services/backend locust -f infrastructure/load/locustfile.py --headless -u 20 -r 4 -t 5m --csv artifacts/load/initial
```

Expected: thresholds pass.

- [ ] **Step 5: Commit**

```bash
git add infrastructure/load services/backend/tests/performance services/backend/pyproject.toml
git commit -m "test: validate initial deployment load"
```

### Task 7: Containerize services and automate release verification

**Files:**
- Create: `infrastructure/docker/web.Dockerfile`
- Create: `infrastructure/docker/backend.Dockerfile`
- Create: `infrastructure/docker/nginx.conf`
- Create: `docker-compose.production.yml`
- Create: `infrastructure/scripts/wait-for-services.py`
- Create: `.github/workflows/release.yml`
- Create: `docs/deployment/configuration.md`
- Create: `docs/deployment/deploy.md`

**Interfaces:**
- Produces: immutable web and backend images.
- Produces: API and worker commands from one backend image.
- Produces: provider-neutral deployment configuration.

- [ ] **Step 1: Write failing container smoke checks**

```bash
docker build -f infrastructure/docker/backend.Dockerfile -t bookwise-backend:test .
docker build -f infrastructure/docker/web.Dockerfile -t bookwise-web:test .
docker compose -f docker-compose.production.yml config
```

Expected: FAIL because production Dockerfiles and Compose file do not exist.

- [ ] **Step 2: Implement multi-stage images**

The backend image exposes:

```text
bookwise-api: uvicorn bookwise.api.app:create_app --factory
bookwise-worker: celery -A bookwise.worker.celery_app worker
bookwise-reconciler: python -m bookwise.worker.reconciler
bookwise-migrate: alembic upgrade head
```

Run containers as non-root users, copy lockfiles before source, and include only
runtime dependencies in final stages. The production Compose file must not
publish PostgreSQL, Redis, or object-storage ports publicly.

- [ ] **Step 3: Add release workflow**

The release workflow:

1. Runs backend, web, Playwright, security, reliability, and evaluation tests.
2. Builds both images.
3. Scans images with Trivy and fails on unfixed critical vulnerabilities.
4. Applies migrations to an ephemeral database.
5. Starts API, worker, and reconciler.
6. Runs health and smoke checks.
7. Publishes images only when all checks pass.

- [ ] **Step 4: Run container verification**

Run:

```bash
docker build -f infrastructure/docker/backend.Dockerfile -t bookwise-backend:test .
docker build -f infrastructure/docker/web.Dockerfile -t bookwise-web:test .
docker compose -f docker-compose.production.yml config
docker compose -f docker-compose.production.yml up -d
uv run --project services/backend python infrastructure/scripts/wait-for-services.py
```

Expected: both images build and services become healthy.

- [ ] **Step 5: Commit**

```bash
git add infrastructure/docker infrastructure/scripts docker-compose.production.yml .github/workflows/release.yml docs/deployment
git commit -m "build: add production container release flow"
```

### Task 8: Implement backup, restore, and disaster-recovery checks

**Files:**
- Create: `infrastructure/scripts/backup_database.sh`
- Create: `infrastructure/scripts/restore_database.sh`
- Create: `infrastructure/scripts/verify_object_inventory.py`
- Create: `infrastructure/scripts/restore_smoke_test.py`
- Create: `docs/runbooks/backup-restore.md`
- Create: `docs/runbooks/provider-outage.md`
- Create: `services/backend/tests/operations/test_restore_integrity.py`

**Interfaces:**
- Produces: encrypted PostgreSQL logical backup.
- Produces: object inventory with key, version, hash, and size.
- Produces: automated restore integrity report.

- [ ] **Step 1: Write failing restore-integrity test**

```python
async def test_restored_citations_resolve(restored_database):
    summaries = await restored_database.published_summaries()
    for summary in summaries:
        for citation in summary.citations:
            span = await restored_database.get_source_span(citation.source_span_id)
            assert hashlib.sha256(span.text.encode()).hexdigest() == span.sha256
```

- [ ] **Step 2: Run the restore test and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/operations/test_restore_integrity.py -v
```

Expected: FAIL because restore fixtures and scripts do not exist.

- [ ] **Step 3: Implement backup and restore workflow**

Backup workflow:

```text
record deployment version
-> pg_dump in custom format
-> encrypt backup
-> write object inventory
-> upload backup and inventory
-> record checksum and retention metadata
```

Restore workflow:

```text
create empty database
-> restore dump
-> apply no new migrations
-> verify object inventory
-> run citation and ownership integrity
-> start read-only API smoke test
```

Managed point-in-time recovery supplements but does not replace the tested
logical restore.

- [ ] **Step 4: Run a disposable restore**

Run:

```bash
bash infrastructure/scripts/backup_database.sh
bash infrastructure/scripts/restore_database.sh bookwise_restore_test
uv run --project services/backend python infrastructure/scripts/restore_smoke_test.py --database bookwise_restore_test
uv run --project services/backend pytest services/backend/tests/operations/test_restore_integrity.py -v
```

Expected: backup, restore, and integrity checks pass.

- [ ] **Step 5: Commit**

```bash
git add infrastructure/scripts docs/runbooks services/backend/tests/operations
git commit -m "ops: add tested backup and restore workflow"
```

### Task 9: Create the automated release gate

**Files:**
- Create: `infrastructure/scripts/release_gate.py`
- Create: `infrastructure/release/thresholds.json`
- Create: `services/backend/tests/release/test_release_gate.py`
- Create: `docs/release-checklist.md`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Produces: one nonzero-exit release decision command.
- Consumes: test, evaluation, load, security, and restore reports.

- [ ] **Step 1: Write failing gate tests**

```python
def test_gate_rejects_low_claim_precision(report_factory):
    report = report_factory(supported_claim_precision=0.979)
    result = evaluate_release(report)
    assert result.passed is False
    assert "supported_claim_precision" in result.failures

def test_gate_accepts_all_thresholds(report_factory):
    report = report_factory(
        structural_status_rate=1.0,
        citation_validity_rate=1.0,
        supported_claim_precision=0.98,
        keypoint_recall=0.90,
        duplicate_generated_records=0,
        cross_user_access_violations=0,
    )
    assert evaluate_release(report).passed is True
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/release/test_release_gate.py -v
```

Expected: FAIL because the release gate does not exist.

- [ ] **Step 3: Implement exact release thresholds**

Use:

```json
{
  "structural_status_rate": 1.0,
  "citation_validity_rate": 1.0,
  "supported_claim_precision": 0.98,
  "keypoint_recall": 0.9,
  "duplicate_generated_records": 0,
  "cross_user_access_violations": 0,
  "http_failure_rate_max": 0.01,
  "library_read_p95_ms_max": 1000,
  "search_p95_ms_max": 1500
}
```

The gate prints a JSON decision, lists every failed threshold, and exits 1 on
failure. It must not permit manual overrides in the normal production workflow.

- [ ] **Step 4: Run the full release gate**

Run:

```bash
uv run --project services/backend pytest -v
pnpm --dir apps/web test
pnpm --dir apps/web exec playwright test
uv run --project services/backend python -m bookwise.evaluation.runner services/backend/tests/fixtures/evaluation/corpus_manifest.json
uv run --project services/backend python infrastructure/scripts/release_gate.py
```

Expected: exit 0 with `"passed": true`.

- [ ] **Step 5: Commit**

```bash
git add infrastructure/release infrastructure/scripts/release_gate.py services/backend/tests/release docs/release-checklist.md .github/workflows/release.yml
git commit -m "build: enforce production release criteria"
```

## Plan Acceptance Checkpoint

The production plan passes only when:

- Logs and traces contain no raw book text, prompts, secrets, or signed tokens.
- Every owner-scoped table has tested RLS.
- Disabling a provider blocks new model calls immediately and records an audit event.
- Prompt injection cannot alter schemas or expose secrets.
- Redis loss and worker termination do not lose canonical jobs.
- Duplicate delivery creates no duplicate generated records.
- Golden evaluation meets 100% structural status, 100% citation validity,
  at least 98% supported-claim precision, and at least 90% key-point recall.
- The 20-user, four-active-job load profile passes its latency and error limits.
- Production images run as non-root and expose only web/API traffic.
- A fresh backup restores into an empty database and resolves every citation.
- The automated release gate exits nonzero when any approved threshold fails.
