---
title: "Ask the library and claim-matched quotes"
description: "Ask one question across all of the owner's books, and show the quote that supports each cited claim."
status: completed
priority: P1
effort: 2d
branch: master
tags: [api, web, database, generation]
created: 2026-10-18
---

# Ask the library (roadmap A4) and claim-matched quotes

## Why the quote fix comes first

In production, a quote card showed the first verified quote recorded for the
cited passage, not the line that supports the claim. On a one-page PDF every
claim cites page 1, so every card showed the same unrelated line.

## Contract

- **Outcome:**
  - Each Ask marker shows the sentence of the cited passage that best matches
    the claim it follows. The sentence is verbatim from the passage. If
    nothing matches (for example, the answer is in another language), the
    card falls back to the evidence quote.
  - `/search` has an "Ask your library" panel. One question is answered from
    passages across the owner's books, and each source names its book.
    Answers are streamed, cited, and cached like Ask a book.
- **Constraints:**
  - Owner-scoped. Spend counts toward the daily budget, and library usage rows
    have no book id.
  - Retrieval favours spread across books: at most 3 of the 8 sources come
    from one book.
  - No new dependencies, no new automated tests, no push without approval.
- **Non-goals:** follow-up conversation memory, choosing a subset of books,
  and MMR re-ranking by embedding.
- **Acceptance:**
  1. On the evaluation book and the one-page PDF case, marker quotes match the
     claim, and older cached answers still render (fallback).
  2. `POST /v1/ask` with `{ question }` streams `sources` (with `bookId`
     and `bookTitle`), `delta`, and `done`. A repeat is cached and becomes
     invalid when any book's current source document changes. Over the budget,
     it returns `error` with code `budget`.
  3. The library answer cites passages from more than one book when they are
     relevant. "View in context" opens the right book's passage.
  4. API lint, build, and Prettier pass; web lint, typecheck, tests, and build pass.

## Design

- **Matching:** a pure function in `domain/ask`.
  - The claim is the answer text between the previous sentence end and the marker.
  - Candidate sentences are the passage split on sentence ends and line breaks.
  - The score is the number of shared meaningful words, with ties going to the
    shorter sentence. A long sentence is trimmed to a window around its matches.
  - The result is `markerQuotes`, aligned with the markers in order. It is sent
    in `done` and cached in a new `marker_quotes` column.
- **Migration 016:**
  - adds `app.book_answers.marker_quotes`;
  - creates `app.library_answers`, keyed by owner, question, prompt version,
    and library version (a hash of every current book/source-document pair).
- **Use case:** one answering flow with a book scope or a library scope. The
  library scope uses its own instruction (passages are labelled with the book
  title) and a per-book cap.
- **Web:** the panel becomes a shared `AskPanel` with an endpoint, heading,
  and book labels, used on the book page and on `/search`.

## Results (2026-10-18)

- **Matcher:**
  - On the PDF case it picks the income-period line instead of the employer
    line.
  - On the evaluation book, the markers match their claims, including
    adjacent markers ([1][2]) and a marker placed after a full stop.
  - Five-letter stemming lets "watered" match "watering".
  - A source that doesn't support the claim returns null, so the card falls
    back to the evidence quote.
- **Use case** (local Postgres, live Vertex):
  - The answer cached before migration `016` still renders, falling back to
    the evidence quote.
  - A new book question returns matched quotes.
  - The library answer drew on 2 books, with first text after 3.9 s. A
    rephrased repeat came from the cache in 1 ms.
  - An owner with no ready books gets 404.
  - Library usage rows have no book id; book rows keep theirs.
- **Browser** (local):
  - "Ask your library" on `/search` names the book in every marker label and
    quote card.
  - "View in context" opens the right book's passage, and Escape returns focus.
  - The book page panel shows claim-matched quotes.
  - At 375 px there is no horizontal scroll.
- **Fixed while testing:** library answers put titles in Markdown italics. A
  plain-text rule was added to both instructions; this changes the prompt
  versions, so earlier cached answers are not reused.
- **Checks:** API lint, build, and Prettier pass; web lint, typecheck, and the 3 tests pass.
- **Deploy:** migration `016` only adds a column (with a default) and a table.
