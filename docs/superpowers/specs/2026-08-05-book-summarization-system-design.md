# Evidence-First Book Summarization System

Status: Approved design
Date: 2026-08-05

## 1. Summary

Build an invite-only web application that processes large nonfiction and
technical books without requiring the complete book to fit in one model
context window.

The system produces:

- A navigable summary for every detected section.
- Chapter, part, and whole-book syntheses.
- A searchable knowledge base of concepts, claims, definitions, examples,
  and source citations.
- Evidence-grounded question answering across a user's private library.

The central design is an evidence-first hierarchy. The system processes every
leaf section, creates source-linked evidence records, verifies them, and only
then synthesizes higher-level summaries. Retrieval is used for search and
question answering, but never to decide which sections are summarized.

## 2. Product Scope

### 2.1 Users and deployment

- The product is a hosted website usable from desktop, tablet, and mobile.
- Access is invite-only.
- The initial deployment targets 1-20 users.
- Each user has a private library.
- The architecture permits additional web and worker instances later.

### 2.2 Supported content

The first version supports digital, selectable-text:

- PDF
- EPUB
- DOCX
- TXT

The first version focuses on nonfiction and technical books.

### 2.3 Non-goals

The first version does not include:

- OCR for scanned documents or page images.
- Fiction-specific character, plot, and timeline analysis.
- Public registration, billing, organizations, or subscription plans.
- Collaborative editing or shared annotations.
- A claim that model hallucination can be reduced to absolute zero.

## 3. Goals and Success Definition

The system must:

1. Process books larger than any selected model's context window.
2. Give every detected leaf section an explicit processing status.
3. Preserve source references from extracted evidence through whole-book
   synthesis.
4. Prevent unsupported generated statements from silently entering published
   summaries.
5. Resume processing without repeating completed work after worker, network,
   or provider failures.
6. Keep each user's books and derived data isolated.
7. Support both cloud model APIs and private model servers through one
   provider interface.

The system is complete for a book only when all required coverage and
verification gates have passed.

## 4. Architecture

### 4.1 Components

The reference implementation uses:

- Next.js with TypeScript for the responsive web interface.
- FastAPI with Python for the application API and pipeline orchestration.
- Python background workers for parsing, summarization, verification, and
  embedding generation.
- PostgreSQL as the canonical database.
- pgvector inside PostgreSQL for semantic search.
- PostgreSQL full-text search for lexical search.
- Redis as the durable job queue and short-lived coordination layer.
- S3-compatible private object storage for original books and large artifacts.
- An OpenID Connect-compatible identity provider for authentication.
- A model-provider adapter supporting cloud APIs and private model endpoints.

The implementation must not depend on one cloud vendor. PostgreSQL, Redis, and
object storage endpoints are configured through environment variables.

### 4.2 Request boundaries

Web requests perform short operations:

- Authenticate the user.
- Create an upload.
- List books and processing progress.
- Read summaries and citations.
- Search or submit a question.
- Enqueue processing or retry jobs.

Whole-book processing never runs inside a web request. Background workers
perform all long-running parsing and model calls.

### 4.3 Storage responsibilities

PostgreSQL is the source of truth for:

- Users, invitations, and ownership.
- Book metadata and processing state.
- Structure nodes and normalized source spans.
- Chunks, evidence items, summaries, and citations.
- Coverage entries and validation outcomes.
- Jobs, attempts, model runs, and cost metadata.
- Full-text and vector search records.

Object storage holds:

- Original uploaded files.
- Normalized parser artifacts.
- Optional page-rendering artifacts.
- Large temporary request or export files.

Object storage is private. Uploads and downloads use short-lived signed URLs.
Database records store object keys, hashes, sizes, MIME types, and provenance.

Redis holds no canonical book content or job state. It provides at-least-once
job delivery, worker leases, retry timers, and ephemeral progress events.
PostgreSQL remains authoritative for job state. A reconciliation task
periodically re-enqueues PostgreSQL jobs that are eligible to run but have no
active queue delivery.

## 5. Book Processing Pipeline

### 5.1 Upload

1. The API creates a pending book record owned by the authenticated user.
2. The API returns a signed object-storage upload URL.
3. The browser uploads directly to object storage.
4. The API verifies the uploaded object, computes or confirms its content hash,
   and enqueues an ingestion job.
5. A duplicate content hash within the same user library can reuse an existing
   normalized artifact after explicit user confirmation.

### 5.2 Parsing and normalization

The parser:

- Extracts normalized text without rewriting its meaning.
- Preserves page numbers, EPUB locations, paragraph order, and character
  offsets when the source format permits.
- Detects parts, chapters, sections, headings, tables, footnotes, and code
  blocks.
- Produces a tree of structure nodes.
- Assigns every normalized source span to one leaf structure node.

Embedded document outlines and tables of contents are preferred. Heading and
layout heuristics are fallback mechanisms.

If structure confidence is below the configured threshold, the book enters
`needs_structure_review`. The user can review and correct the outline before
summarization begins. The system does not pretend that an uncertain outline is
complete.

### 5.3 Section-bounded chunking

Chunks never cross leaf-section boundaries.

Chunk size is selected in model tokens, not pages or characters. The chunker
reserves capacity for system instructions, structured output, and validation
feedback. Paragraphs, lists, tables, and code blocks remain intact whenever
possible.

Each chunk stores:

- Its owning structure node.
- Source-span IDs.
- Token count.
- Content hash.
- Sequence number within the section.
- Chunking strategy version.

### 5.4 Evidence extraction

Each chunk is converted into structured evidence records. Supported evidence
types include:

- Main claim
- Supporting argument
- Definition
- Concept
- Procedure or method
- Example
- Data point
- Limitation
- Counterargument
- Conclusion

Each evidence item contains:

- A normalized statement.
- Evidence type.
- One or more source-span IDs.
- Optional verbatim excerpt kept within configured copyright limits.
- Extraction confidence.
- Provider, model, prompt version, and input hash.
- Validation status.

The extraction prompt treats all book text as untrusted data. Instructions
inside the book cannot alter system behavior, request secrets, or change the
output schema.

### 5.5 Section assembly

Short sections are summarized directly from their evidence records.

Long sections use recursive reduction:

1. Group adjacent evidence records.
2. Create intermediate evidence summaries.
3. Preserve the union of child citation IDs.
4. Verify each intermediate summary.
5. Repeat until the complete section fits the synthesis budget.

The section summary includes:

- Main purpose.
- Key ideas and arguments.
- Definitions and important concepts.
- Procedures or methods.
- Representative examples.
- Limitations, caveats, and counterarguments.
- Source citations.

### 5.6 Verification

Every generated factual claim passes these checks:

1. The referenced source span exists.
2. The source span belongs to the current book and user.
3. The stored source hash matches the normalized text.
4. A support verifier classifies the claim as supported, ambiguous,
   conflicting, or unsupported.
5. The claim does not introduce named entities, quantities, or conclusions
   absent from its cited evidence.

Supported claims are published with citations. Ambiguous or conflicting claims
are published only with a visible warning. Unsupported claims are removed and
recorded as validation failures.

### 5.7 Coverage ledger

The coverage ledger records every expected structure node and chunk as:

- `pending`
- `processing`
- `complete`
- `retryable_failed`
- `permanent_failed`
- `needs_review`

A section is complete only when:

- Every expected chunk has a final status.
- All successful chunks have evidence extraction results.
- No required chunk is permanently failed.
- Citation and support validation pass.

A chapter, part, or book cannot be complete while a required descendant is
incomplete. The interface displays missing or failed sections instead of
silently omitting them.

### 5.8 Hierarchical synthesis

Higher levels are synthesized only from verified child summaries:

```text
chunks -> sections -> chapters -> parts -> whole book
```

Each synthesis level:

- Receives bounded input.
- Retains child summary IDs.
- Retains source citation IDs.
- Records its model and prompt versions.
- Runs the same support and citation validation.

No model call receives the complete raw book.

### 5.9 Indexing

After verification:

- Source text, evidence, and summaries enter PostgreSQL full-text indexes.
- Embeddings are stored in pgvector with canonical record IDs.
- Search indexes can be rebuilt from canonical PostgreSQL records.

Index failure does not invalidate completed summaries. The book enters
`search_index_incomplete` and an indexing retry is scheduled.

## 6. Search and Question Answering

Search uses a hybrid retrieval flow:

1. Apply user, book, and optional section filters.
2. Retrieve lexical candidates with PostgreSQL full-text search.
3. Retrieve semantic candidates with pgvector.
4. Merge and rerank candidates.
5. Load canonical evidence and source spans by ID.
6. Compose an answer using only the resolved evidence.
7. Validate answer citations before returning the response.

Question answering is retrieval-based because the user asks for relevant
evidence. Exhaustive summarization remains tree traversal-based and never uses
retrieval to choose content.

The answer interface displays:

- The answer.
- Supporting source snippets.
- Book, chapter, section, and page or location.
- A link that opens the source location in the reader.
- A warning when evidence is incomplete or conflicting.

## 7. Core Data Model

The initial schema includes:

- `users`
- `invitations`
- `books`
- `book_objects`
- `structure_nodes`
- `source_spans`
- `chunks`
- `evidence_items`
- `evidence_sources`
- `summaries`
- `summary_children`
- `summary_citations`
- `coverage_entries`
- `processing_jobs`
- `job_attempts`
- `model_runs`
- `validation_results`
- `embedding_records`

All domain tables carry an owner or library identifier. IDs are UUIDs. Records
that represent generated output are versioned and immutable after publication;
a new processing run creates a new version.

Unique constraints enforce idempotency for:

- Book content hash and owner.
- Chunk content hash and chunking version.
- Model task, input hash, model, and prompt version.
- Summary level, source version, model, and prompt version.
- Job type, target ID, and processing version.

## 8. Authentication and Data Isolation

Authentication uses an OpenID Connect-compatible provider. Only invited email
addresses can create an application account.

Authorization is enforced in two layers:

1. The API checks ownership for every operation.
2. PostgreSQL row-level security policies restrict domain rows to the current
   application user or authorized administrative role.

Object-storage keys are namespaced by user and book. Signed URLs are
short-lived and scoped to one object and operation.

Workers receive a job ID and resolve only the records required for that job.
Provider API keys and storage credentials never reach the browser.

## 9. Model Provider Abstraction

The provider interface supports:

- Structured text generation.
- Embedding generation.
- Token counting.
- Capability discovery.
- Timeouts and cancellation.
- Usage and cost reporting.

The initial implementation supports:

- At least one cloud model provider.
- An OpenAI-compatible private endpoint or local model server reachable from
  the worker network.

In a hosted deployment, "local model" means a private server-side model
endpoint, not a model running on each user's browser or device.

Provider selection can be configured per library or processing run. Sending
book text to a cloud provider requires an explicit provider choice. The system
records which provider processed each generated artifact.

## 10. Job Execution and Error Handling

Jobs transition through:

```text
queued -> running -> completed
                  -> retryable_failed -> queued
                  -> permanent_failed
                  -> needs_review
```

Transient failures include:

- Provider timeout.
- Rate limiting.
- Temporary object-storage failure.
- Worker termination.
- Temporary database or network failure.

Transient failures use bounded exponential backoff with jitter.

Permanent or review-required failures include:

- Unsupported or corrupt file.
- Empty extracted text.
- Unresolvable document structure.
- Repeated structured-output validation failure.
- Missing source spans.
- Failed citation integrity.

Workers checkpoint progress after each chunk and section. Retrying a job
reuses completed outputs with matching hashes and processing versions.

Administrators and book owners can retry one chunk, section, index, or complete
book without deleting successful records.

Workers acknowledge queue deliveries only after the corresponding PostgreSQL
state transition is committed. Duplicate deliveries are expected and are made
safe by the unique idempotency constraints in the data model.

## 11. User Experience

The primary screens are:

- Invitation and sign-in.
- Private library with upload and processing progress.
- Book outline with per-section status.
- Section reader with summary, key concepts, and citations.
- Whole-book synthesis.
- Search and "ask this book" interface.
- Processing issues and retry controls.

The book outline is the main navigation surface. Users can see which sections
are complete, processing, failed, or awaiting review.

The interface must remain useful while a book is partially processed. Completed
sections can be read without waiting for the whole book.

## 12. Observability and Administration

The system records:

- Stage and progress by book, section, and chunk.
- Queue time, processing time, and retry count.
- Provider latency, token usage, and estimated cost.
- Prompt, model, parser, and chunker versions.
- Validation failures and unsupported claims.
- Coverage gaps.
- Search-index status.

Logs contain record IDs and hashes rather than raw book text whenever possible.
Sensitive text is excluded from error reporting and analytics.

Administrative actions include:

- Invite or deactivate a user.
- Inspect failed jobs.
- Retry a processing stage.
- Disable a model provider.
- Rebuild full-text or vector indexes.
- View usage and cost by user and book.

## 13. Testing Strategy

### 13.1 Parser fixtures

Maintain fixtures for:

- PDF, EPUB, DOCX, and TXT.
- Deep outlines.
- Missing or broken tables of contents.
- Very long sections.
- Tables, footnotes, code blocks, and lists.
- Repeated headers and page numbers.

### 13.2 Golden evaluation corpus

Create a representative nonfiction corpus with human annotations for:

- Expected section structure.
- Section key points.
- Important definitions and claims.
- Required citations.
- Known cross-section relationships.

The corpus includes short, medium, and very long books.

### 13.3 Reliability tests

Test:

- Provider timeouts and rate limits.
- Worker termination during each pipeline stage.
- Redis interruption.
- Object-storage interruption.
- Retry idempotency.
- Resume from partially processed books.
- Model or prompt version upgrades.
- Index rebuilds.

### 13.4 Security tests

Test:

- Cross-user API access denial.
- PostgreSQL row-level policy enforcement.
- Signed URL expiration and object scoping.
- Invitation enforcement.
- Prompt injection embedded in book content.
- Secret exclusion from browser responses and logs.

### 13.5 Load tests

The initial release is tested with:

- 20 invited users.
- Multiple simultaneous uploads.
- At least four concurrent active processing jobs.
- Concurrent reading and search while workers write results.

## 14. Release Criteria

The first release requires:

- 100% of detected leaf sections have an explicit final status.
- 100% of published factual claims have valid source-span references.
- Zero invalid or cross-user citations in automated integrity tests.
- At least 98% supported-claim precision on the human-reviewed evaluation set.
- At least 90% annotated key-point recall on the evaluation corpus.
- Zero duplicate evidence or summaries after retry tests.
- Successful resume after worker termination at every processing stage.
- Zero successful cross-user access attempts in the security test suite.
- Responsive library, outline, and summary views at the initial 20-user load.

These thresholds measure structural completeness and evidence support. They do
not claim that generated summaries are lossless replacements for the books.

## 15. Initial Deployment

The initial production deployment contains:

- One web frontend service.
- One API service.
- One background worker service with configurable concurrency.
- Managed PostgreSQL with pgvector enabled.
- Managed Redis.
- Private S3-compatible object storage.
- One configured cloud model provider.
- Optional private model endpoint.

Services run in separate containers. Database migrations run as an explicit
deployment step. The worker service can scale independently when processing
demand grows.

PostgreSQL receives automated backups and point-in-time recovery when supported
by the selected host. Object storage uses versioning or lifecycle-protected
backups. Restore procedures are tested before production launch.

## 16. Design Decisions

The approved decisions are:

- Evidence-first hierarchical summarization instead of flat map-reduce.
- Exhaustive structure traversal instead of retrieval-selected summarization.
- PostgreSQL instead of SQLite because the application is hosted and used
  across multiple devices and accounts.
- pgvector and PostgreSQL full-text search instead of a separate vector
  database for the initial scale.
- Object storage instead of local application-disk storage.
- Background workers and a durable queue instead of long web requests.
- Invite-only multi-user isolation instead of a public SaaS feature set.
- Provider-neutral model integration with both cloud and private endpoints.
