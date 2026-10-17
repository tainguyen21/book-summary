---
title: "Citation passage viewer"
description: "Click a citation in a summary to read the cited paragraph and the text around it."
status: completed
priority: P2
effort: 1d
branch: master
tags: [api, web, database]
created: 2026-10-17
---

# Citation passage viewer (roadmap A1)

## Contract

- **Outcome:** each citation chip on a summary ("Chapter 3", "Page 12",
  "Paragraph 8") opens a dialog showing the cited passage, highlighted, with up
  to two neighbouring passages before and after it.
- **Product change:** until now the summary page showed citation locations
  but never source text. This shows the owner text from their own book only.
- **Constraints:**
  - Owner-scoped: another owner's book or span returns 404.
  - The API reads `data` only through a view granted inside a migration.
  - No new dependencies, no new automated tests, no push.
- **Non-goals:** full-book reading view, search, highlighting inside the
  summary text, and books ingested before paragraph spans (whose citations
  point at very large spans; those still work, but show one long block).
- **Acceptance:**
  1. `GET /v1/books/:bookId/passages/:spanId` returns the target span and up to
     2 spans on each side, from the same source document, in reading order. It
     returns 404 for another owner, an unknown span, or a span from another book.
  2. A citation chip is a keyboard-reachable button. The dialog has a title
     (the location label), marks the cited passage, closes with Escape, and
     returns focus to the chip.
  3. API lint, build, and Prettier pass; web lint, typecheck, tests, and build pass.

## Design

1. **Migration `012_create_book_source_passages.sql`:** view
   `data.book_source_passages` (`source_span_id`, `owner_id`, `book_id`,
   `source_document_id`, `sequence_number`, `content`, `location`), granted to
   `app_rw`, like the summary views in migration 006. The API filters by owner and book.
2. **API:** `GetSourcePassageUseCase` plus a repository query that finds the
   target, then selects spans with `sequence_number` within ±2 in the same document.
   The route lives in `SummaryController`.
3. **Web:** `BookSummaryReader` gets `bookId`; chips become buttons; a new
   `PassageDialog` fetches on open and shows loading and error states.

## Verification

Run the passage SQL as `app_rw` against a local paragraph-span book (target in
the middle, at the start, and with a foreign owner), then call the use case
against local Postgres. Browser check after the user signs in.

## Results (2026-10-17)

- **Use case against local Postgres** (10-chapter EPUB with paragraph spans):
  - A middle citation returned spans 10–14, with 12 marked cited.
  - The document's first span returned spans 1–3.
  - Another owner, and a span from a different book, both returned nothing (404).
- **Checks:** API lint, build, and Prettier pass; web lint, typecheck, the 3
  existing tests, and the build pass. Migration 012 applied locally after a backup.
- **Not verified:** the signed-in browser dialog. It can be checked in
  production after deploy on the user's existing ready PDF (read-only).
