# Bookwise feature roadmap (brainstorm)

Date: 2026-10-16 · Status: proposal, not yet planned or implemented

## Contract

- **Outcome:** a ranked backlog of small (1–3 day) features that extend Bookwise as a reading tool and harden the system around it, chosen for learning value.
- **Constraints:**
  - Single user (owner only).
  - Minimal model and cloud spend.
  - English and Vietnamese books.
  - Reuse what exists: Next.js, NestJS, the Python worker, Postgres + pgvector, GCS, Vertex AI, GKE Autopilot.
  - Preserve owner scoping and the evidence-first boundary.
- **Non-goals:**
  - Multi-tenant features (quotas per user, roles, billing).
  - A public demo.
  - Rewriting the processing pipeline.
  - Heavy new infrastructure that costs money while idle.
- **Acceptance:** each item has a slice size, a cost note, what it teaches, and a dependency order. The first slices can be handed to planning as-is.

## Decisions already made

| Topic | Decision |
| --- | --- |
| Sharing / export | Allowed (read-only share links are in scope) |
| Model budget | As low as possible; this is a learning project |
| Q&A scope | Both a single book and the whole library |
| Audience | Just the owner |
| Languages | English + Vietnamese |
| Slice size | 1–3 days per feature |
| Learning focus | AI/RAG engineering, DevOps/SRE, frontend/product UX |

## Existing capabilities to build on

Each processed book already has the following, in local data:
- **Embeddings:** `data.embedding_records`, written by `application/build_embeddings.py` (768 dimensions, pgvector).
- **Passages and chapter outline:** `data.source_spans` hold the text passages, and `data.structure_nodes` hold page, chapter and paragraph locations.
- **Evidence:** `data.generated_evidence` and `data.generated_evidence_citations` link summary points to passages.
- **Event log:** `data.processing_events`.

Retrieval features therefore need mostly read paths and UI, not new ingestion.

## Urgent: model retirement (do first)

The worker uses `gemini-2.5-flash`. Google's Vertex AI model-lifecycle page lists its retirement as **October 20, 2026**. An earlier release note said October 16, and one third-party report says new access is blocked even earlier.
- Switch the summary model to a supported Gemini Flash model. The page suggests gemini-3.x flash variants.
- Re-run one summary end to end to confirm it works.
- The embedding model (`gemini-embedding-001`) was not part of this retirement notice, but check it too.
- Slice: about half a day. Production summaries stop working after the retirement date if this isn't done.

## Feature catalog

Cost key:
- **$0** means no model calls.
- **$** means only query embeddings or tiny prompts.
- **$$** means one generation per user action.
- **$$$** means generation per book or chapter.

### Track A — AI / RAG engineering

| # | Feature | Slice | Cost | What you learn |
| --- | --- | --- | --- | --- |
| A1 | **Citation passage viewer**: click "Page 12" to see the quoted passage and the text around it | 1d | $0 | Evidence data model, read-only API design |
| A2 | **Hybrid search** across the library: pgvector similarity combined with Postgres full-text search, results show book + location | 2d | $ | Hybrid retrieval, ranking fusion (RRF); use the `simple` text config so Vietnamese works without stemming |
| A3 | **Ask a book**: retrieve the top passages, answer with citations, stream the answer over SSE (server-sent events) | 2–3d | $$ | Grounded generation, prompt design, streaming |
| A4 | **Ask the library**: the same, but retrieving across books and citing book + page | 1–2d (after A3) | $$ | Cross-document retrieval, diversity in retrieval (MMR) |
| A5 | **Answer cache + daily token budget**: cache answers by book and normalized question; refuse politely once over budget | 1d | saves $ | Cost control, idempotency |
| A6 | **Language-aware output**: detect the book's language; summarize and answer in it (EN/VI) | 1–2d | $0 extra | Multilingual prompting, language detection |
| A7 | **Chapter summaries**: one short summary per chapter from the chapter outline, generated with the Vertex batch API (about 50% cheaper) | 2–3d | $$$ (batch) | Batch inference, structured summarization |
| A8 | **Flashcards + spaced review**: generate cards from the summary; a daily review page using FSRS (an open scheduling algorithm) via the `ts-fsrs` library | 3d | $$ once per book | Learning-science UX, scheduling algorithms |
| A9 | **RAG evaluation harness**: a small golden question set per test book; score faithfulness and relevance with a cheap model, run on demand | 2d | $ per run | Evaluation methods (Ragas-style metrics), regression testing for prompts |
| A10 | **Audio summary**: Cloud Text-to-Speech of the summary (supports Vietnamese), cached as an audio file in storage | 2d | $ once | Media pipeline, storage lifecycle |

### Track B — DevOps / SRE (supporting the system)

| # | Feature | Slice | Cost | What you learn |
| --- | --- | --- | --- | --- |
| B1 | **Structured logs + worker lifecycle logs** (claim, stage, finish, failure) with a correlation ID | 1d | $0 | Logging design; closes the handoff gap of a "silent worker" |
| B2 | **Real readiness checks**: DB, storage and model reachability, used by Kubernetes probes | 1d | $0 | Health vs readiness semantics |
| B3 | **Token and cost ledger**: record tokens and cost per run in processing events; show a cost card in the app | 1–2d | $0 | LLM cost observability (a lightweight alternative to Langfuse) |
| B4 | **GCP budget alert + Vertex quota cap** | 0.5d | $0 | Cloud cost guardrails |
| B5 | **Ops page** (you are the only admin): runs, failures, queue depth, retry button | 2d | $0 | Operational UX, safe retries |
| B6 | **Alerting**: uptime check on `/`, alert when a run is stuck or fails | 1d | ~$0 | Cloud Monitoring, SLO thinking |
| B7 | **OpenTelemetry tracing** web → API → worker → Vertex, exported to Cloud Trace | 2–3d | ~$0 at this volume | Distributed tracing, context propagation |
| B8 | **Backup and restore drill** for Cloud SQL and the GCS bucket, written into the runbook | 1d | $0 | Disaster recovery practice |
| B9 | **CI security**: gitleaks (secret scanning) + Trivy (image scanning); security headers (CSP, etc.) on the web app | 1d | $0 | Supply-chain and web security |
| B10 | **Worker scale-to-zero**: KEDA on queue depth, or move the worker to Cloud Run Jobs | 3d | saves $ | Event-driven autoscaling, cost optimization |

### Track C — Frontend / product UX

| # | Feature | Slice | Cost | What you learn |
| --- | --- | --- | --- | --- |
| C1 | **Book management**: rename, delete (including stored file), retry failed, clear incomplete uploads | 2–3d | $0 | Destructive-action UX, consistency between API and storage |
| C2 | **⌘K command palette**: search books and passages, jump anywhere (pairs with A2) | 1–2d | $ | Keyboard-first UX, accessible combobox |
| C3 | **Live status over SSE** instead of 5-second polling | 2d | $0 | Realtime transport, reconnection |
| C4 | **Highlights and notes** on summary sentences, plus a notes page per book | 2–3d | $0 | Text-selection UX, anchoring data |
| C5 | **Export and share**: Markdown/Obsidian export; read-only share link that can be revoked | 2d | $0 | Signed tokens, public rendering safely |
| C6 | **Reading settings**: theme toggle, font size, line width; remembered per device | 1d | $0 | Design tokens in practice |
| C7 | **Vietnamese UI** (i18n) with an English/Vietnamese switch | 1–2d | $0 | Internationalization |
| C8 | **PWA**: installable, offline reading of already-loaded summaries | 2d | $0 | Service workers, caching strategy |
| C9 | **Notifications**: browser notification when a summary is ready | 1d | $0 | Notifications API, permission UX |
| C10 | **Multi-file upload queue** | 2d | $0 | Concurrency UX |

## Recommended order

Each step reuses the previous one, and the cost guards come before any feature that spends model tokens.

1. **Now:** model migration (see "Urgent" above).
2. **Safety rails:**
   - B1 logs
   - B3 cost ledger
   - B4 budget alert
   - A5 answer cache and budget, built before Q&A exists so the cap is in place
3. **Evidence UX:**
   - A1 passage viewer
   - C1 book management, which also lets you clean up the test books
4. **Find:**
   - A2 hybrid search
   - C2 ⌘K palette
5. **Ask:**
   - A3 ask a book, with streaming (practices C3's SSE work)
   - A4 ask the library
6. **Measure:**
   - A9 evaluation harness
   - B7 tracing
7. **Learn and retain:**
   - A6 EN/VI output
   - C7 Vietnamese UI
   - A8 flashcards with spaced review
8. **Later:**
   - C5 export and share
   - C8 PWA
   - B10 scale-to-zero
   - A7 chapter summaries
   - A10 audio

## Trade-offs

| Choice | Option | Relies on | First breaks when |
| --- | --- | --- | --- |
| Q&A retrieval | Top passages from one embedding search (recommended) | Passages are good enough to answer from | The answer spans many chapters |
| | Chapter-first, then passages | Chapter outline is reliable | EPUB/DOCX files have weak headings |
| | Send the whole book to Gemini (long context) | Cost is acceptable | Large books get expensive; conflicts with minimal budget |
| LLM observability | Own token/cost ledger + Cloud Trace (recommended) | Low volume, single user | You need prompt-version comparisons and evaluation dashboards |
| | Self-hosted Langfuse | Spare cluster capacity | Its stack (ClickHouse, Redis, etc.) costs money while idle on GKE |
| Worker cost | Keep the always-on pod | Simplicity | Idle cost dominates a single-user bill |
| | Scale-to-zero (KEDA or Cloud Run Jobs) | Cold-start delay is acceptable | Cold starts make "summary ready" feel slow |

Better approaches: none found. The recommended direction extends the roadmap already in `docs/project-timeline.md`, which lists private search and cited Q&A first.

## Sources

- Google model lifecycle: [Vertex AI model versions](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions), [release notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes), [Oct 20 vs Oct 16 write-up](https://tokencost.app/blog/gemini-2-5-shutdown-october-20-migration-cost)
- Costs: [Gemini API pricing](https://ai.google.dev/pricing?hl=hu), [Vertex AI pricing overview](https://curlscape.com/blog/google-gemini-api-pricing-guide-2026)
- NotebookLM-style apps: [Open Notebook](https://www.greptile.com/grepository/open-notebook), [open-source NotebookLM alternatives](https://www.scriptbyai.com/best-open-source-notebooklm-alternatives/)
- RAG apps: [Kotaemon](https://github.com/zenstacker/kotaemon), [PaperQA2](https://docs.edisonscientific.com/paperqa), [Khoj docs](https://docs.khoj.dev/)
- Observability and evaluation: [Langfuse RAG observability](https://www.llamaindex.ai/blog/one-click-open-source-rag-observability-with-langfuse), [Langfuse + Ragas](https://www.besthub.dev/articles/designing-production-grade-observability-and-evaluation-with-langfuse-ragas-for-llm-applications-fd80ae78c46a)
- Reading and spaced review: [Readwise feature overview](https://toolchase.com/tool/readwise-reader/), [Readwise alternatives](https://contextbolt.com/blog/readwise-alternatives/)

## Unresolved questions

1. Which replacement Gemini Flash model should production use? Confirm availability in the project's `global` location.
2. Share links: should they expire by default, and should the source text of passages be visible to viewers, or only the summary?
3. Should flashcards (A8) work offline in the PWA, or only online?
