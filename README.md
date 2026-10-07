# Bookwise

Evidence-first, private book summarization with a NestJS application backend
and a private Python processing service.

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

## Summary publication

Finalizing an upload idempotently queues paired `ingest_book` and
`regenerate_summary` commands. The Python worker claims ingestion immediately,
while summary generation waits until the book has a normalized source document.

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
