# Project Timeline

Last updated: October 18, 2026

## Completed

| Date | Milestone | Outcome |
| --- | --- | --- |
| August 10-11, 2026 | Platform foundation | Created the pnpm workspace, Next.js web app, NestJS API, Python service shell, Docker development stack, and central PostgreSQL migration baseline. |
| August 11, 2026 | Identity foundation | Added NestJS OIDC token verification, invite-only identity rules, user provisioning, and authenticated API contracts. |
| August 14-15, 2026 | Private-library design | Defined the private-upload, library, and processing-command workflow, including owner-scoped access and object-storage requirements. |
| September 3-4, 2026 | Auth0 SPA migration | Replaced the server-session SDK with the official Auth0 React SDK, added client-side sign-in, sign-up, sign-out, and fixed the web app to `http://localhost:3000`. Web tests, lint, and production build pass. |
| September 5-6, 2026 | SPA private library | Implemented direct bearer-authenticated uploads to private MinIO/S3, idempotent queued ingest commands, owner-scoped library and processing reads, and the signed-in upload/library UI. Local static, storage, database, and two-owner adapter verification pass. |
| September 7, 2026 | Browser acceptance | Configured the Auth0 access-token claim boundary and verified sign-in, identity provisioning, upload, queued status, library refresh, PostgreSQL persistence, and private MinIO storage in the local browser workflow. |
| September 8, 2026 | Processing command worker | Added a Python worker that records Python-owned processing runs and durable events, recovers abandoned leases, and preserves the NestJS status projection without writing the `app` schema. Claim locking was subsequently changed to nonblocking advisory locks; see the October operational milestone. |
| September 8, 2026 | Source ingestion | Added private-object retrieval, bounded PDF/EPUB/DOCX/TXT parsing, immutable source documents/spans/structure nodes, provenance and owner isolation, normalized private artifacts, and permanent failure handling for invalid or unsupported sources. |
| September 7, 2026 | Browser stabilization | Fixed the client-side processing-status polling loop. Active books now receive one immediate status read, then at most one read every five seconds until their status becomes terminal or the browser page is hidden. Web lint, production build, and the authenticated browser path pass. |
| September 15-17, 2026 | Summary publication | Finalization now queues paired `ingest_book` and `regenerate_summary` commands. Generation claims wait for normalized source readiness, accepted immutable summaries and ordered citation locations are exposed through owner-filtered projections and `GET /v1/books/:bookId/summary`, and `/books/[bookId]` provides the read-only summary experience. Migrations `006` and `007`, local verification, and the repository CI workflow pass; a real provider-backed browser run remains pending until a model provider is configured. |
| October 10-11, 2026 | GCP deployment and operational fixes | Deployed web/API/worker to GKE with Cloud SQL, private GCS, and Vertex AI configuration. Corrected TLS routing, Auth0 origin/audience alignment, and browser-upload CORS. Claims use nonblocking transaction-scoped advisory locks and leases; CI/CD reuses verification, caches images, deploys by digest, and gates application rollout on migrations. |
| October 11, 2026 | Upload and processing guidance | Deployed incomplete-upload guidance, terminal polling behavior, run-state labels, and sanitized browser upload-failure diagnostics in `e8bbcba`. An abandoned upload was distinguished from a stalled worker by read-only storage/database inspection. |
| October 14, 2026 | New-device and agent handoff | Added portable setup and agent handoff guides, linked repository instructions, and preserved a reviewed generated code map while excluding analysis caches. Existing static/build/test checks pass; new-device authentication and a real-provider browser flow still need verification on the target device. |
| October 16-17, 2026 | Web redesign | Shipped a public landing page at `/`, a `/library` dashboard with stats and a "Processing now" panel, a split upload dialog, a cited summary reader, a shared loading system, and robots/sitemap/Open Graph metadata. Deployed in `95067c6`. |
| October 17, 2026 | Worker logs and model migration | The worker writes one JSON object per line with allow-listed ids only (`BOOKWISE_LOG_LEVEL`). The summary model moved from `gemini-2.5-flash` to `gemini-3.8-flash` ahead of the older model's retirement. |
| October 17, 2026 | Usage ledger and evidence checkpoints | Migration `008` records every model call's tokens and estimated cost in `data.model_usage`, priced from `BOOKWISE_MODEL_PRICING_JSON`. Migration `009` saves each validated evidence chunk, so a failed or paused run resumes instead of restarting. |
| October 17, 2026 | Summary quality | An original evaluation book and rubric measured coverage at 5/12 key facts. Coverage prompts, paragraph-level TXT citations, low Gemini thinking, and a 16,384-token output ceiling raised it to 11.5/12 with no hallucination traps triggered. Cost per book rose about 4x. See `plans/reports/eval-261017-1047-slow-orchard/report.md`. |
| October 17, 2026 | Spending guardrails | The worker pauses summary generation once estimated daily spend reaches `BOOKWISE_DAILY_BUDGET_USD` (2 USD, Asia/Saigon day). Paused books show "Paused · daily budget" and resume after midnight; the library shows today's spend (`GET /v1/usage/today`, migration `010`). A GCP billing budget of 260,000 VND per month emails at 50/90/100%. |
| October 17, 2026 | Structured-format chunking | EPUB chapters, PDF pages, and DOCX sections are split into paragraph spans and packed into shared chunks. Long EPUB chapters no longer fail, and short PDFs/DOCX use one or two model calls instead of one per page or paragraph. A 10-chapter EPUB scored 11.5/12 end to end. Deployed in `7381c63`. |
| October 17, 2026 | Book management | Owners can rename, delete (rows through cascades plus stored files; usage history kept), retry a permanently failed summary, and clear incomplete uploads. Retry is an app-side request (migration `011`) that the worker honours by reopening the same run, ingestion first. Verified locally against Postgres, MinIO, and live Vertex; deployed in `7b747fa`. |
| October 17, 2026 | Citation passage viewer | Citation chips on a summary open the cited passage, highlighted, with up to two neighbouring passages on each side (`GET /v1/books/:bookId/passages/:spanId`, migration `012`). Owners see source text only from their own books. Deployed and checked in production in `6401a45`. |
| October 17, 2026 | Hierarchical summaries | Books with more than `BOOKWISE_SUMMARY_GROUP_RECORDS` (120) evidence records are summarized in groups, then the group summaries are summarized, so each call stays bounded. Group summaries are checkpointed for resume. A two-level run of the evaluation book scored 10.5/12. Deployed in `a270b38`. |
| October 17, 2026 | Sentence source quotes | Summary sentences carry numbered markers that expand verbatim quotes from the book (excerpts verified against the cited span, migration `013`), with a link to the passage in context. On the evaluation book: 21 of 21 sentences cited, 36 quotes, 0 not found verbatim; about 21% more cost per book. Verified locally in the browser; deployed in `9b21280`. |
| October 17, 2026 | Hybrid private search | `/search` finds facts and passages across the owner's books by keyword and by meaning (query embeddings from the API, migration `014`), merged by rank fusion, with a keyword-only fallback when the budget is spent or Vertex is unavailable. The API now calls Vertex for interactive requests (user decision) and records that spend in the shared ledger. Deployed in `32ae788`. |
| October 18, 2026 | Reading settings | The summary header has reading settings: theme (system, light, dark), text size, and line width, saved per device and applied before first paint. Verified locally; not yet deployed. |
| October 18, 2026 | Live status | Processing events notify the API through Postgres `NOTIFY` (migration `020`), and `/v1/live/books` pushes owner-scoped status changes to open pages over server-sent events. Library and book pages update within about 2 s instead of polling every 5 s (30 s fallback). Verified locally; not yet deployed. |
| October 18, 2026 | Highlights and notes | Readers highlight summary sentences from the quote card and keep notes on them (migration `019`). Highlights are listed per book, survive regeneration labelled as an earlier version, and are included in the Markdown export. Verified locally; not yet deployed. |
| October 18, 2026 | Readiness and alerts | The API's readiness probe is `/v1/ready` (Postgres and object storage), and the worker has a liveness heartbeat (restarted after 10 minutes without progress). `create-alerts.ps1` emails on site or API downtime, permanent processing failures, and worker restarts; Deployed in `9d3bc4e`; the alert script is written but not yet run. |
| October 18, 2026 | Vietnamese interface, flashcards, Markdown export | The app switches between English and Vietnamese (typed dictionaries, locale-aware dates and money; book text keeps its own language). Flashcards are made from a summary (migration `018`, FSRS scheduling via `ts-fsrs`) and reviewed on `/review` with keyboard ratings. Summaries export as Markdown with quote footnotes. By decision, there are no public share links, and scale-to-zero, audio, chapter summaries, and PWA are skipped for now. Deployed in `9d3bc4e`. |
| October 18, 2026 | Book-language output | Evidence and summaries are written in the book's language (a Vietnamese test book produced a complete Vietnamese summary), answers follow the question's language, and the reader marks Vietnamese summaries with `lang="vi"`. Verified locally against live Vertex; deployed in `9d3bc4e`. |
| October 18, 2026 | Request tracing | With `BOOKWISE_TRACE_EXPORTER=cloud-trace`, API requests, queries, and Vertex calls are traced, and the worker continues the same trace for the command it processes (`traceparent` in the command payload). Spans go over OTLP to `telemetry.googleapis.com` (the Node Cloud Trace exporter is archived after October 30). Deployed in `9d3bc4e`, with `roles/telemetry.tracesWriter` granted to the API and worker accounts; production request spans confirmed in Cloud Trace. |
| October 18, 2026 | Answer evaluation harness | `eval:ask` grades answers to a 13-question golden set for faithfulness, key facts, and traps (migration `017` records judge spend). The first run found a refused question and a stemming miss. Following-paragraph expansion, partial answers, prefix keywords, and one retry raised results to 13/13 expected and 21/23 key facts, with 100% faithfulness and no traps, for about $0.05 per run. The Ask fixes and migration `017` were deployed in `9d3bc4e`; the harness runs on demand. |
| October 18, 2026 | Command palette | ⌘K / Ctrl+K (or "Quick find") jumps to a book, a library view, search inside books (`/search?q=`), a prefilled library question (`/search?ask=`, not sent), or upload. Verified locally; deployed in `9d3bc4e`. |
| October 18, 2026 | Ask the library and claim-matched quotes | `/search` answers one question across all ready books, naming the book behind each claim (`POST /v1/ask`, cache in migration `016`). Quote cards on answers now show the passage sentence that matches the claim instead of the passage's first evidence quote. Verified locally against live Vertex; deployed in `9d3bc4e`. |
| October 17, 2026 | Ask a book | A book page answers questions from that book only, streamed with numbered markers that open verified quotes, and says so when the book doesn't cover it. Answers are cached per book and source document (migration `015`), and new answers count toward the daily budget. Verified locally in the browser against live Vertex (first text in about 7 s, cached repeats instant). Deployed in `9b047b2`; in production a question on a one-page PDF streamed its first text in about 2.5 s. |

## In Progress

Everything above is deployed to production. Still unconfirmed:

1. No real upload has gone through the production worker since the October 17
   changes. The model-backed pipeline was verified end to end locally against
   live Vertex AI, not through the production browser flow.
2. The usage ledger, daily budget pause, and cost card have not yet been
   observed with production traffic.
3. Cloud SQL has no backups: it is a free-trial instance, and automated
   backups and point-in-time recovery are off by decision.

See [agent handoff](agent-handoff.md) for verification limits and
[new-device setup](new-device-setup.md) for the migration checklist.

## Next

1. Production smoke test: upload one small TXT, EPUB, PDF, and DOCX, then
   confirm summaries, citations, ledger rows, and worker logs.
2. Use book management to remove the local 76 MB test book and the production
   incomplete upload.
3. Watch the first long book in production with sentence quotes and hierarchical summaries.
4. Run `create-alerts.ps1` once after the next deploy; rotate credentials
   (operator task).
5. Decide whether summary editing belongs in the next publication iteration.
6. Later upload capabilities: multipart/resumable uploads, OCR, malware
   scanning, and files larger than 100 MiB.

Roadmap and rationale:
[feature roadmap](../plans/reports/brainstorm-261016-2157-feature-roadmap.md) and
[safety-rails plan](../plans/261016-2325-safety-rails/plan.md).

## Reference Plans

- [NestJS and Python roadmap](superpowers/plans/2026-08-11-nestjs-python-roadmap.md)
- [SPA Auth0 migration design](superpowers/specs/2026-09-03-auth0-react-spa-migration-design.md)
- [SPA private library plan](superpowers/plans/2026-09-05-spa-private-library-plan.md)
- [Summary publication design](superpowers/specs/2026-09-14-summary-publication-design.md)
- [Summary publication plan](superpowers/plans/2026-09-15-summary-publication-plan.md)
- [Superseded server-session upload plan](superpowers/plans/2026-08-14-private-uploads-library-auth0-plan.md)
