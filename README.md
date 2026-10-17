# Bookwise

Evidence-first, private book summarization with a NestJS application backend
and a private Python processing service.

## New Device And Agent Handoff

Follow [new-device setup](docs/new-device-setup.md) for prerequisites,
configuration, access, and verification. AI agents should begin with
[`AGENTS.md`](AGENTS.md) and the [agent handoff](docs/agent-handoff.md).
These guides distinguish local setup from connecting to the existing
production infrastructure; secrets and local databases do not migrate
through Git.

## Project timeline

See the [project timeline](docs/project-timeline.md) for completed work, the
current private-library delivery slice, and upcoming milestones.

## Local development

Copy `.env.example` to `.env`, then run:

```bash
pnpm install
uv sync --project services/data
docker compose up -d
pnpm run migrate:local
```

Run the development services with:

```bash
pnpm run dev:web
pnpm run dev:api
uv run --project services/data python -m bookwise_data.workers.main
```

NestJS listens on port `3001`; the Next.js app reads its public API URL from
`NEXT_PUBLIC_API_URL`.

On Windows, after installing dependencies and creating `.env`, start all
services with:

```powershell
pnpm run start:local
```

This starts Docker Compose, waits for PostgreSQL, applies migrations, and
opens separate PowerShell terminals for the API, web app, and worker. The
worker terminal imports the root `.env` into its process environment.

## Summary publication

Finalizing an upload idempotently queues paired `ingest_book` and
`regenerate_summary` commands. The Python worker claims ingestion immediately,
while summary generation waits until the book has a normalized source document.

Claims use nonblocking transaction-scoped advisory locks keyed by command ID,
then create or reopen eligible `data.processing_runs`. App commands remain
read-only to the worker; run leases and heartbeats retain ownership after
the claim transaction ends.

Accepted immutable summaries are exposed through the owner-scoped
`GET /v1/books/:bookId/summary` endpoint. The web route at
`/books/[bookId]` shows processing states, the current accepted summary, and
ordered citation locations without exposing source text.

## Book management

Owners manage books from the library row menu and the book page. All routes
are owner-scoped, and another owner's book returns 404.

| Route | Effect |
| --- | --- |
| `PATCH /v1/books/:bookId` | Renames the book (`{ title }`, trimmed, 1–500 characters) |
| `DELETE /v1/books/:bookId` | Deletes the book and every app/data row through cascades, then its `books/` and `normalized/` storage prefixes. Returns 409 while a run is summarizing. `data.model_usage` rows are kept, so spend history and today's budget stay accurate |
| `POST /v1/books/:bookId/retry` | Records an `app.processing_retry_requests` row for each permanently failed command. Returns 409 unless one has failed |
| `DELETE /v1/books/incomplete` | Deletes the owner's `pending_upload` books and returns `{ deleted }` |

Retry never creates a second source document. The worker reopens the same
`permanent_failed` run when a retry request is newer than the run's last
update, and that reopening consumes the request. A summary retry waits while
the book's ingestion still has a pending retry. A reopened summary resumes
from its saved evidence chunks.

The local PostgreSQL configuration uses the fresh `bookwise_next` database.
`pnpm run migrate:local` applies all pending, lexically ordered migrations,
starting with the immutable `001_create_initial_schema` baseline. Summary
publication uses migration `006_create_current_summary_projections` for
owner-filtered accepted-summary reads and
`007_create_source_document_claim_projection` for source-readiness-aware
generation claims.

## Vertex AI provider

Bookwise can generate summaries with Gemini through Vertex AI and Google
Application Default Credentials. Enable the API and authenticate locally:

```powershell
gcloud config set project YOUR_PROJECT_ID
gcloud services enable aiplatform.googleapis.com
gcloud auth application-default login
```

Configure the root `.env`:

```dotenv
BOOKWISE_MODEL_PROVIDER=vertex
BOOKWISE_SUMMARY_MODEL=gemini-3.8-flash
BOOKWISE_EMBEDDING_MODEL=gemini-embedding-001
BOOKWISE_EMBEDDING_DIMENSIONS=768
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=true
BOOKWISE_MODEL_PRICING_JSON={"gemini-3.8-flash":{"input_per_mtok":1.50,"output_per_mtok":7.50},"gemini-embedding-001":{"input_per_mtok":0.15,"output_per_mtok":0}}
```

Every successful model call is recorded in `data.model_usage` (migration
`008_create_model_usage`) with its operation (`evidence`, `summary`, or
`embedding`), input and output tokens, and an estimated USD cost. Gemini
thinking tokens count as output. Prices come from
`BOOKWISE_MODEL_PRICING_JSON`, in USD per million tokens per model; a model
without a price is recorded at cost 0 with one `pricing_missing` warning. The
values above are list rates to confirm against the Vertex AI pricing page;
billing remains the source of truth.

### Daily budget

The worker stops spending once today's estimated model cost reaches
`BOOKWISE_DAILY_BUDGET_USD` (default `2`; `0` disables the cap). "Today" starts
at midnight in `BOOKWISE_BUDGET_TIMEZONE` (default `Asia/Saigon`) and counts
spend across all users from `data.model_usage`. While the budget is spent,
the worker still ingests uploads but leaves summary commands queued. A run
that reaches the cap mid-book stops before its next model call, becomes
`retryable_failed` with a `budget_paused` processing event, and resumes after
midnight from its saved evidence chunks. A full-length book can therefore take
more than one day. Billing remains the source of truth for actual spend.

The Python worker reads the process environment rather than loading `.env`
itself. Import `.env` into the current PowerShell process before starting the
worker:

```powershell
Get-Content .env |
  Where-Object { $_ -match '^\s*[^#][^=]*=' } |
  ForEach-Object {
    $name, $value = $_ -split '=', 2
    [Environment]::SetEnvironmentVariable(
      $name.Trim(),
      $value.Trim(),
      'Process'
    )
  }

uv run --project services/data python -m bookwise_data.workers.main
```

## Worker logs

The Python worker writes one JSON object per line to stdout, which Cloud
Logging on GKE parses natively. Every line has `timestamp`, `severity`,
`logger` (`bookwise.worker`), `event`, and `message`, plus only allow-listed
context: `command_id`, `book_id`, `run_id`, `command_type`,
`processing_version`, `outcome`, `error_class`, `error_code`, and
`duration_ms`. Startup also records `batch_limit`, `poll_interval_seconds`,
`model_provider`, and `generation_model`; shutdown records the `signal`;
resumed generation records `chunks_reused` and `chunk_count`; a claim reopened
by an owner's retry records `retry`; budget events
record `spent_usd` and `cap_usd`, and startup also records the cap and
`budget_timezone`.

| Event | Severity | Meaning |
| --- | --- | --- |
| `worker_started` | INFO | Worker composed and entering the poll loop |
| `worker_stopping` | INFO | SIGTERM/SIGINT received; loop exiting |
| `command_claimed` | INFO | A command was claimed for handling |
| `command_completed` | INFO | Handler succeeded, with `duration_ms` |
| `command_failed` | WARNING (retryable) / ERROR (permanent) | Handler failed; `outcome`, `error_class`, `error_code` |
| `lease_lost` | WARNING | Heartbeat failed before handling; command skipped |
| `batch_idle` | DEBUG | No commands to claim in this poll |
| `pricing_missing` | WARNING | A model has no configured price; usage recorded at cost 0 (once per model) |
| `usage_metadata_missing` | WARNING | A provider response had no token counts; recorded as 0 (once per model) |
| `usage_record_failed` | ERROR | A usage row could not be written; generation continues |
| `evidence_resumed` | INFO | A retried summary run reused saved evidence for finished chunks |
| `evidence_checkpoint_failed` | WARNING | An evidence checkpoint could not be loaded or saved; generation continues without it |
| `budget_paused` | WARNING | A summary run hit the daily cap and was paused; includes `spent_usd` and `cap_usd` |
| `budget_hold_started` / `budget_hold_ended` | WARNING / INFO | Summary claiming stopped or resumed because of the daily cap |

Set the level with `BOOKWISE_LOG_LEVEL` (default `INFO`; unknown values fall
back to `INFO`). Use `DEBUG` to see idle polls. Book titles, filenames, book
text, owner IDs, and raw exception messages are never logged.

## GKE deployment

The production target uses one GKE Autopilot cluster with one Pod each for the
web app, API, and Python worker. Durable state stays in Cloud SQL PostgreSQL
and Cloud Storage; Vertex AI supplies summaries and embeddings. The public
web and `/v1` API routes share `https://tai-dev-web.cloud`.

Deployment configuration lives under
`infrastructure/gcp/README.md`. The first-time setup is:

```powershell
gcloud auth login
gcloud config set project bookwise-509408
pwsh infrastructure/gcp/scripts/bootstrap-gcp.ps1
pwsh infrastructure/gcp/scripts/configure-services.ps1
```

Create the Cloud SQL database and Secret Manager values described in
`infrastructure/gcp/secrets/README.md`, then configure these GitHub repository
variables:

```text
GCP_PROJECT_ID
GCP_REGION
GKE_CLUSTER_NAME
GKE_NAMESPACE
ARTIFACT_REGISTRY_REPOSITORY
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOYER_SERVICE_ACCOUNT
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_AUTH0_DOMAIN
NEXT_PUBLIC_AUTH0_CLIENT_ID
NEXT_PUBLIC_AUTH0_AUDIENCE
NEXT_PUBLIC_AUTH0_REDIRECT_URI
```

The deployment binds the GKE Ingress to the global static address resource
`bookwise-ip`, provisions a Google-managed certificate for
`tai-dev-web.cloud`, and redirects HTTP to HTTPS. Point the domain's root `A`
record at `35.201.95.210` before the first rollout.

Pushing to `master` or manually dispatching
`.github/workflows/deploy-gcp.yml` builds immutable images, runs verification,
synchronizes runtime secrets, applies the migration Job, and waits for the
web, API, and worker rollouts.

Follow deployment logs with:

```powershell
kubectl get pods -n bookwise
kubectl logs -n bookwise deployment/bookwise-api -f
kubectl logs -n bookwise deployment/bookwise-web -f
kubectl logs -n bookwise deployment/bookwise-worker -f
kubectl get ingress -n bookwise
```
