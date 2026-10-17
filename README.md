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
BOOKWISE_SUMMARY_MODEL=gemini-2.5-flash
BOOKWISE_EMBEDDING_MODEL=gemini-embedding-001
BOOKWISE_EMBEDDING_DIMENSIONS=768
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=true
```

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
`model_provider`, and `generation_model`; shutdown records the `signal`.

| Event | Severity | Meaning |
| --- | --- | --- |
| `worker_started` | INFO | Worker composed and entering the poll loop |
| `worker_stopping` | INFO | SIGTERM/SIGINT received; loop exiting |
| `command_claimed` | INFO | A command was claimed for handling |
| `command_completed` | INFO | Handler succeeded, with `duration_ms` |
| `command_failed` | WARNING (retryable) / ERROR (permanent) | Handler failed; `outcome`, `error_class`, `error_code` |
| `lease_lost` | WARNING | Heartbeat failed before handling; command skipped |
| `batch_idle` | DEBUG | No commands to claim in this poll |

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
