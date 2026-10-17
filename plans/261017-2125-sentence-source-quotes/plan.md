---
title: "Sentence-level source quotes"
description: "Each summary sentence links to the short verbatim quote from the book that supports it."
status: completed
priority: P1
effort: 1.5d
branch: master
tags: [worker, generation, api, web, database]
created: 2026-10-17
---

# Sentence-level source quotes

## What exists today (verified in source)

- **Summary:** each summary stores a flat list of cited spans
  (`citation_data`); nothing links an individual sentence to its spans.
- **Evidence:** each evidence item cites spans and has an optional
  `source_excerpt`. Since the coverage fix, the prompt asks the model to leave
  the excerpt empty (to save tokens), and excerpts were never checked against the book.
- **Passage dialog:** the existing dialog shows a whole cited span plus
  neighbours, not a short quote.

## Contract

- **Outcome:** in a new summary, every sentence that states something from the
  book has numbered source markers. Activating a marker shows the short,
  **verbatim** quote that supports it, with its location and a "View in
  context" action that opens the existing passage dialog.
- **Constraints:**
  - Quotes must be real text from the book: an excerpt that is not a substring
    of its cited span (after whitespace normalization) is dropped, not shown.
  - Owner-scoped like every summary read.
  - Older summaries keep today's view.
  - No new dependencies, no new automated tests, no push.
- **Non-goals:** re-generating existing summaries; editing quotes; quotes inside the passage dialog.
- **Acceptance:**
  1. **Evidence:** new items carry `source_excerpt` only when it is verbatim from a cited span.
  2. **Summary:** the summary is generated as paragraphs of sentences, each listing its source spans.
     - The stored `body` is unchanged in shape (paragraphs joined by blank lines).
     - The flat citation list still passes the existing check.
  3. **Storage:** `data.generated_summaries.segments` (migration 013) stores
     paragraphs, then sentences, then citations, each citation with
     `source_span_id` and an optional `quote`. It is exposed through
     `book_current_summaries`, and `GET /v1/books/:bookId/summary` returns `segments`.
  4. **UI:** a sentence's markers are buttons (44px hit area, visible focus, numbered like the
     "Where this comes from" chips). Activating one expands a quote card after
     the paragraph. Escape and the same button close it, returning focus. A
     missing quote shows "No short quote recorded" plus "View in context".
  5. The evaluation book shows quotes for most cited sentences, and every
     shown quote is found verbatim in the book file.
  6. All existing checks pass.

## UI design (from ui-ux-pro-max research)

| Topic | Decision | Rule |
| --- | --- | --- |
| Trigger | Small numbered pill after the sentence, `button` with an enlarged invisible hit area (44×44 px) and 8 px spacing | touch target, touch spacing |
| Interaction | Click or tap toggles; no hover-only behavior. Hover and focus tint the sentence to link it visually | hover vs tap, tooltip-keyboard |
| Surface | Inline quote card inserted after the paragraph (progressive disclosure), not a floating popover: no positioning or z-index layering, identical on mobile, natural tab order | progressive-disclosure, z-index management |
| Content | Verbatim quote in a blockquote with curly quotes, location label ("Chapter 3 · ¶5"), and a "View in context" button opening the passage dialog | escape-routes |
| Accessibility | `aria-expanded` and `aria-controls` on markers; the card is a labelled `region`; markers labelled "Source 3, Chapter 3 paragraph 5"; state shown by more than color (pressed style plus icon) | screen reader, color-only |
| Motion | 180 ms height and opacity reveal; none under `prefers-reduced-motion` | duration timing, reduced motion |
| Coexistence | Marker numbers equal `citation_order`, so they match the end-of-summary chips; the chips stay as the full source index | consistency |

## Design (backend)

1. **Evidence prompt:** "copy a short exact quote (at most 25 words) from the
   cited text into source_excerpt". `accepted_evidence_from_output` keeps it only
   when it is a whitespace-normalized substring of one of the cited spans.
2. **`SummaryDraft`:** becomes `paragraphs` → `sentences` (`text`,
   `source_span_ids`). `body` and `source_span_ids` become derived properties,
   so the existing checks, hierarchical sections, and providers keep working.
   The summary prompt asks for per-sentence span ids.
3. **Segments:** after acceptance, each sentence citation gets the quote from
   the evidence item that cites the same span and best matches the sentence
   (word overlap). Sentence spans outside the accepted citations are dropped.
4. **Migration 013:** `segments JSONB NOT NULL DEFAULT '[]'`; the
   immutability trigger also freezes `segments`; the view
   `book_current_summaries` appends `segments`.
5. **API:** `segments` with `sourceSpanId`, `order`, `quote`, and `location` per citation.

## Risks

- **Cost:** quotes and per-sentence ids add output tokens (estimated +20–30% per book).
- **Prompt changes:** evidence and summary prompt versions change, so older
  checkpoints are not reused (by design).

## Results (2026-10-17)

- **Live** (evaluation TXT, local stack, live Vertex):
  - Evidence: 69 of 69 items kept a verified quote.
  - Summary: 5 paragraphs and 21 sentences, all 21 cited and all with at
    least one quote. 36 quotes in total, 0 not found word for word in the book file.
  - Cost $0.111 against $0.092 before (+21%).
- **Browser** (local, signed in, dark theme):
  - 21 markers render. The drop cap stays on the first paragraph only. Each
    marker has a 44×44 px hit area and a label such as "Show source quotes:
    source 1, Paragraph 1; …".
  - Activating a marker expands a card with 4 quotes and tints the sentence.
    Escape closes it and returns focus to the marker.
  - "View in context" opens the passage dialog (cited span plus 4
    neighbours). Escape closes only the dialog, and focus returns to the button.
  - At 375 px the card fits with no horizontal scroll.
- **Unrelated finding:** on first load, a book page's processing request can
  return 401 before session sync completes, which shows "We couldn't load this
  book" until Try again. This predates this change.
- **Checks:** API lint, build, and Prettier pass; web lint, typecheck, the 3
  tests, and the build pass; Python ruff and compileall pass.

Acceptance 1–6 met. The light theme was not checked visually; it uses the same tokens.
