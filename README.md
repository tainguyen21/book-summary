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
