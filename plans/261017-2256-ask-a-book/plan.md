---
title: "Ask a book"
description: "Ask a question on a book's page and get a streamed answer built only from that book, with numbered citations to verbatim quotes."
status: completed
priority: P1
effort: 2d
branch: master
tags: [api, web, database, generation]
created: 2026-10-17
---

# Ask a book (roadmap A3, with the A5 answer cache)

## Measurements that shape the design (2026-10-17)

- `gemini-3.8-flash` exists only on the Vertex `global` endpoint; regional
  endpoints return 404.
- A non-streamed one-line answer took 4.9–12 s. Streamed, the first bytes
  arrived in 1.7–6.0 s and the full answer in 3.5–6.4 s.
- So the answer streams as server-sent events, and repeated questions are cached.

## Contract

- **Outcome:** a book page with a summary has an "Ask this book" panel.
  - The answer streams in, with markers `[n]` after claims. Each marker opens
    the same quote card as the summary (verified quote, location, "View in context").
  - If the book doesn't answer the question, it says so plainly instead of guessing.
  - Asking the same question again returns the cached answer instantly.
- **Constraints:**
  - The answer may use only retrieved passages of that one book. Passages are
    untrusted data in the prompt.
  - Markers outside the provided passages are dropped.
  - Owner-scoped. Spend (query embedding plus answer) is recorded in
    `data.model_usage` with the book id and counts toward the daily cap. Over
    the cap, asking is refused with a clear message, but cached answers still work.
  - No new dependencies, no new automated tests, no push without approval.
- **Non-goals:** multi-book questions (A4), follow-up conversation memory,
  editing or rating answers, persisting history beyond the cache.
- **Acceptance:**
  1. `POST /v1/books/:bookId/ask` with `{ question }` streams `sources`, then
     `delta` text, then `done` (`answered`, `cached`). Another owner's book returns 404.
  2. An answerable question gets a correct, cited answer. An unanswerable one
     ("What does the book say about Mars?") gets `answered: false`.
  3. A repeated question (after normalizing case, spacing, and punctuation)
     is served from `app.book_answers` with `cached: true` and no model call.
     The cache entry is invalid once the book's source document changes.
  4. Usage rows (`query_embedding`, `answer`) carry the book id. Over the cap, a
     new question gets an `error` event with code `budget`.
  5. The UI streams text progressively with an accessible live region.
     Markers are 44 px buttons that open quote cards. Not-answered, error,
     and budget states are clear. Keyboard and 375 px widths work.
  6. All existing checks pass.

## Design

- **Retrieval:** the hybrid search queries, filtered to one book, take the
  top 8 distinct spans (at most about 16,000 characters of passage text).
  Each span becomes a numbered source with its location and, when one exists,
  the verified quote of evidence citing it.
- **Generation:** Vertex `streamGenerateContent?alt=sse` via
  `google-auth-library`, temperature 0, thinking LOW, at most 1,024 output
  tokens. The instruction is: "answer only from the numbered passages, put
  [n] after each claim, and reply exactly NOT_IN_BOOK if they don't contain
  the answer". Usage comes from the final chunk's `usageMetadata`.
- **Cache:** migration `015` creates `app.book_answers`, keyed by book,
  normalized question, prompt version, and current source document. It stores
  the answer text, sources, and `answered`. The API owns the `app` schema, so no data-schema writes are needed.
- **Web:** an `AskBookPanel` on the ready book page streams via `fetch` and a
  `ReadableStream`, renders markers as citation buttons, and reuses the
  quote-card styles.

## Results (2026-10-17)

- **Use case against local Postgres and live Vertex** (evaluation book):
  - An answerable question streamed `sources` (8, all with quotes), `delta`,
    then `done` with `answered: true`. First text arrived after about 7.1 s,
    and the cited answer was correct.
  - "What does the book say about Mars?" returned `answered: false`.
  - A rephrased repeat was served from the cache (`cached: true`) in 2 ms.
  - Over the cap, the result was an `error` event with code `budget`.
  - Usage rows (`answer`, `query_embedding`) carry the book id.
  - Another owner gets 404.
- **Browser** (local, signed in, API on port 3002 with Vertex settings):
  - The answer streams in after "Reading the book…". Markers open quote cards,
    "View in context" opens the passage dialog, and Escape returns focus to the dialog trigger and then to the marker.
  - The not-answered message is shown plainly. A case-changed repeat shows
    "Answered earlier · instant".
  - The API on port 3001 had no model configured, and it showed the
    "unavailable" error message.
  - At 375 px the form stacks and there is no horizontal scroll.
  - Markers are 18 px visually, with a 44 px hit area.
- **Fixed while testing:** CORS now allows PATCH and DELETE, so local
  cross-origin rename and delete work. Production is same-origin.
- **Checks:** API lint, build, and Prettier pass; web lint, typecheck, and the 3 tests pass.
- **Deploy:** migration `015` runs in the deploy job, and the API BackendConfig now sets a 60 s load balancer timeout (the default is 30 s; answers time out at 45 s). The API already has
  `roles/aiplatform.user` and the `BOOKWISE_SUMMARY_MODEL` /
  `GOOGLE_CLOUD_LOCATION` settings in its ConfigMap — check before pushing.
