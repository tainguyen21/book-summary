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
ordered citation locations. Selecting a citation opens the cited passage
from `GET /v1/books/:bookId/passages/:spanId`. It returns the cited span plus
up to two neighbouring spans on each side, read through the owner-filtered
`data.book_source_passages` view (migration `012`), so owners see text only
from their own books.

New summaries are generated sentence by sentence. Each sentence records the
spans it states (`data.generated_summaries.segments`, migration `013`), and
each span carries a short quote from the book. Evidence extraction asks for a
verbatim excerpt of at most 25 words, and the worker keeps it only if it
appears word for word (ignoring whitespace and quote style) in a cited span. In
the reader, numbered markers after a sentence expand a card with those quotes
and a "View in context" link to the passage dialog. Summaries generated before
this keep the plain view.

## Private search

`/search` searches inside the signed-in owner's books. `GET /v1/search?q=`
merges three ranked lists by reciprocal rank fusion: keyword matches on
evidence and on source passages (Postgres full text, `simple` configuration,
any meaningful query word), and meaning matches on evidence embeddings
(pgvector cosine over a `gemini-embedding-001` query embedding). Results are
read through `data.book_search_evidence` and `data.book_source_passages`
(migrations `012` and `014`). Each result opens the passage in context.

The API embeds the query itself (its service account needs
`roles/aiplatform.user`) using `BOOKWISE_EMBEDDING_LOCATION`, a regional
endpoint (the global one measured about 11 s per query, with identical
vectors). Each query embedding is recorded in `data.model_usage`, with no book
or command, through `data.record_app_model_usage`, and counts toward the daily
budget. When the budget is spent, Vertex is not configured, or the call fails
within 4 s, search returns keyword results only (`mode: "keyword"` with
`keywordReason`).

## Ask a book

A ready book page has an "Ask this book" panel. `POST /v1/books/:bookId/ask`
with `{ "question": "..." }` streams server-sent events: `sources` (numbered
passages with location and verified quote), `delta` text with `[n]` markers,
then `done` (`answered`, `cached`), or `error` (`budget` or `unavailable`).

- Retrieval reuses the search queries filtered to the one book (top 8 spans,
  about 16,000 characters). The API calls `BOOKWISE_SUMMARY_MODEL` on the
  Vertex streaming endpoint (`GOOGLE_CLOUD_LOCATION`, `global` for
  `gemini-3.8-flash`) and is told to answer only from those passages, or say
  the book doesn't cover it.
- Answers are cached in `app.book_answers` (migration `015`), keyed by book,
  normalized question, prompt version, and current source document, so a
  repeated question costs nothing and still works over the budget.
- New answers record `query_embedding` and `answer` usage with the book id and
  are refused once the daily budget is spent.
- Each marker's quote card shows the sentence of the cited passage that best
  matches the claim (verbatim, shared meaningful words), sent as `markerQuotes`
  in `done`. Without a match, it falls back to the evidence quote.

`/search` also has "Ask your library": `POST /v1/ask` answers from passages
across every ready book of the owner, at most 3 of 8 sources per book, and
each source carries `bookId` and `bookTitle`. Library answers are cached in
`app.library_answers` (migration `016`), keyed by a hash of every ready book's
current source document, so a new, changed, or deleted book refreshes them.
Library usage rows have no book id.

Answer quality is measured on demand (it spends real tokens, recorded as
`evaluation` usage) with a golden question set. It needs the same Vertex
settings as the API:

```bash
pnpm --dir services/api eval:ask -- --owner <ownerId> --book <bookId> --set evaluation/the-slow-orchard.questions.json --out plans/reports/eval-ask.md
```

## Flashcards and review

A ready book page can make 8–15 flashcards from its summary
(`POST /v1/books/:bookId/flashcards`, Vertex, recorded as `flashcards` usage
under the daily budget). Each card cites the summary sentences' sources.
`/review` shows due cards one at a time: Space reveals, keys 1–4 rate them
(Again, Hard, Good, Easy). Reviews are scheduled with FSRS (`ts-fsrs`) and
stored in `app.flashcards` and `app.flashcard_reviews` (migration `018`).

## Export

"Export Markdown" on a summary downloads it in the browser, ready for notes
apps such as Obsidian. The file has front matter, the summary, and one
footnote per cited sentence with its verified quotes and locations. There are
no public share links. The file ends with the reader's highlights and notes.

## Highlights and notes

The quote card of a summary sentence can highlight it and hold a note
(`PUT /v1/books/:bookId/highlights`, migration `019`). Highlights are tied to
one summary version, and the API copies the sentence text from the stored
summary. After a book is summarized again, older highlights stay listed as
"From an earlier version of this summary".

## Interface language

The signed-in app switches between English and Vietnamese ("Tiếng Việt" /
"English" in the sidebar). The choice is stored per device and falls back to
the browser language. Interface text lives in typed dictionaries under
`apps/web/src/lib/i18n/messages/`. Book text (summaries, quotes, answers,
cards) keeps its own language and is marked with `lang`. Summaries are written
in the book's language.

## Request tracing

With `BOOKWISE_TRACE_EXPORTER=cloud-trace` (set in the GKE ConfigMap), the API
and worker send OpenTelemetry spans to Cloud Trace through its OTLP endpoint
(`telemetry.googleapis.com`), using Application Default Credentials and
`roles/telemetry.tracesWriter`. The trace covers API requests, Postgres
queries, and Vertex calls. A queued command carries the request's
`traceparent` in its payload, so the worker's `command <type>` span, with its
database and model calls, joins the same trace. Spans never include request
bodies, questions, prompts, or book text. `BOOKWISE_TRACE_SAMPLE_RATIO`
(default 1) sets sampling; health probes and idle polling are not traced.

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

### Long books

When a book yields more evidence records than `BOOKWISE_SUMMARY_GROUP_RECORDS`
(default `120`), the summary is built in levels. Consecutive groups of records
are summarized first, each citing only spans from its own group. The group
summaries are then summarized again, until one group fits a single final call.
Short books keep one summary call. Group summaries are saved as checkpoints,
so a retried or budget-paused run reuses the finished groups.

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
