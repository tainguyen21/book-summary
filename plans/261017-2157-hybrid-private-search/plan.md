---
title: "Hybrid private search"
description: "Search inside your own books by keyword and by meaning, with results that open the cited passage."
status: completed
priority: P1
effort: 2d
branch: master
tags: [api, web, database, search]
created: 2026-10-17
---

# Hybrid private search (roadmap A2)

## Decision

The user chose (2026-10-17) that interactive model calls run in the API:
the API service account gets `roles/aiplatform.user`. This extends "only the
worker calls models" to "the worker for background work, the API for
interactive requests". Spend from the API still lands in `data.model_usage`
and counts toward the daily cap.

## Contract

- **Outcome:** a `/search` page searches across the signed-in owner's books
  and returns matching evidence and passages. Each result shows the book, the
  location, and a snippet (a verified quote when one exists), and opens the
  passage in context.
- **Ranking:** keyword search (Postgres full text, `simple` configuration,
  which suits English and Vietnamese) and meaning search (pgvector cosine over
  evidence embeddings, with a `gemini-embedding-001` query embedding) are
  merged by reciprocal rank fusion.
- **Constraints:**
  - Owner-scoped.
  - Python still owns `data`. The API records spend only through a narrow
    `SECURITY DEFINER` function.
  - When over the daily budget, or with no model configured, search falls back to keyword-only and says so.
  - No new automated tests, no push without approval.
- **Non-goals:** "Ask a book" (next plan), search inside the summary text, ⌘K palette, cross-language search.
- **Acceptance:**
  1. `GET /v1/search?q=` returns at most 20 results across the owner's books
     only. Another owner's books are never returned, checked with a second owner id.
  2. A keyword query finds an exact phrase. A paraphrased query finds the
     evidence by meaning even with no shared words.
  3. Each meaning search writes a `query_embedding` row to `data.model_usage`
     with no book or command. Over the cap, results are keyword-only with
     `mode: "keyword"`.
  4. The page has a labelled search field, loading, empty, and error states,
     and results that are keyboard reachable. "View passage" opens the passage dialog.
  5. API lint, build, and Prettier pass; web lint, typecheck, tests, and build pass.

## Design

- **Migration 014:**
  - Make `data.model_usage.book_id` and `command_id` nullable, and allow
    `query_embedding` and `answer` operations.
  - Add `data.record_app_model_usage(...)` (`SECURITY DEFINER`, granted to `app_rw`).
  - Add view `data.book_search_evidence`: owner, book, evidence id,
    statement, first cited span, its location, verified quote, and the
    768-dimension embedding. Only evidence behind the current summary is included.
  - Add GIN full-text indexes on span content and evidence statements, and an
    HNSW cosine index on the 768-dimension embedding expression.
- **API:**
  - `VertexEmbeddingClient`: `google-auth-library` plus the Vertex `predict`
    REST call, with task type `RETRIEVAL_QUERY` and 768 dimensions.
  - `SearchUseCase` checks the budget, embeds the query, and records usage. It
    runs the keyword and meaning queries and fuses them with RRF (k = 60).
- **Web:** a `/search` route, a "Search books" nav item, debounced input
  (300 ms, minimum 2 characters), and results grouped by book with "View
  passage" (the existing `PassageDialog`).

## Results (2026-10-17)

- **Use case against local Postgres and live Vertex:**
  - "why did the saplings perish in the cold" shares no words with the book
    yet returns the frost evidence (hybrid).
  - "money spent on the project" returns the 9,400-euro evidence with its verified quote.
  - Another owner gets 0 results.
  - Over the cap, mode is keyword with reason `budget`. With no embedder, mode
    is keyword with reason `unavailable`.
  - Each meaning search wrote one `query_embedding` row with no book or
    command, costing about $0.000001.
  - Query characters cannot inject tsquery operators (`can't & | !:*` becomes
    `can | frost`), and Vietnamese two-letter words are kept.
- **Latency:** the Vertex `global` embedding endpoint took about 11.5 s per
  call from here, against 1.3 s (`us-central1`) and 2.4 s (`asia-southeast1`),
  with identical vectors (cosine 1.000000). Added `BOOKWISE_EMBEDDING_LOCATION`
  (asia-southeast1 in the ConfigMap) and a 4 s timeout before keyword fallback.
- **Keyword fix found while testing:** websearch AND semantics found nothing
  for natural questions, and plain OR matched almost everything through stop
  words. Now any meaningful word matches, ranked by `ts_rank`.
- **Browser** (local, signed in), against a local API without the regional
  setting, so keyword mode:
  - "Search books" is the active nav item, and the field is focused and labelled.
  - The query returned 20 results in 9 book groups, with highlighted matches,
    3 quotes, one clear button, and a keyword notice with the correct reason.
  - "View passage" opens the passage dialog, and Escape returns focus.
- **Checks:** API lint, build, and Prettier pass; web lint, typecheck, and the 3 tests pass.
- **Deploy prerequisite:** `roles/aiplatform.user` on
  `bookwise-api@bookwise-509408.iam.gserviceaccount.com`, now added to
  `configure-services.ps1`. Without it, production search still works, in keyword mode.
