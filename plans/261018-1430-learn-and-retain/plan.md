---
title: "Learn and retain: Vietnamese UI, flashcards, Markdown export"
description: "An English/Vietnamese interface, FSRS flashcards made from summaries, and Markdown export of a summary with its quotes."
status: completed
priority: P2
effort: 2d
branch: master
tags: [web, api, i18n, learning]
created: 2026-10-18
---

# Learn and retain (roadmap C7, A8, C5 export only)

## Decisions (user, 2026-10-18)

- **C5:** export only. Summaries never become public, so there are no share links.
- **Skipped for now:** B10 worker scale-to-zero, A10 audio summaries, A7
  chapter summaries, and C8 PWA.

## Vietnamese interface (C7)

- **Locale layer:**
  - `lib/i18n/locale.ts` holds the language, persists it in localStorage
    (falling back to the browser language), and keeps `<html lang>` in step.
  - It uses `useSyncExternalStore` with an English server snapshot, so
    hydration always matches.
  - `defineMessages(en, vi)` types the Vietnamese set to the exact English
    shape, so a missing string fails typecheck.
- **Switch:** "Tiếng Việt" / "English" in the sidebar, and an icon button in
  the phone top bar.
- **Coverage:** shell, palette, library, upload, sign-in, book page, reader,
  location labels ("Đoạn 12", "Trang 1"), Ask (errors by code), search,
  flashcards, and book status labels. Dates, numbers, and money follow the
  locale.
- **Not covered:** book content (summaries, quotes, answers, titles) keeps its
  own language and is marked with `lang` (`vi` or `en`) for screen readers.
- **Stays English:** the landing page and browser tab titles, which are
  server-rendered metadata.
- **Translation:** two agents translated disjoint areas. Their Vietnamese
  wording has not been reviewed by a native speaker.

## Flashcards (A8)

- **API** (migration `018`):
  - `POST /v1/books/:bookId/flashcards` makes 8–15 cards from the summary's
    numbered sentences. Each card cites the sentences' source spans, and its
    language follows the summary.
  - Generation uses Vertex with a 4,096-token output cap. The cost is recorded
    as `flashcards` usage under the daily budget (429 when it is spent).
  - `GET /v1/books/:bookId/flashcards`, `GET /v1/flashcards/due`, and
    `POST /v1/flashcards/:id/review` with `{ rating: 1–4 }`. Reviews are
    scheduled with FSRS (`ts-fsrs` 5.4.2) and logged in
    `app.flashcard_reviews`.
- **Web:**
  - The book page has a Flashcards panel to make the deck, review it, remake
    it (with confirmation), or list the cards.
  - `/review` shows one card at a time. Space reveals the answer, 1–4 rate it,
    and "View source" opens the passage.
  - The sidebar and palette have a "Review" entry with a count of due cards.

## Markdown export (C5)

- "Export Markdown" on the summary header downloads `<title>.md` in the
  browser, with no API call.
- The file has YAML front matter, the summary paragraphs, and one footnote
  per cited sentence. A footnote lists each distinct verified quote with its
  locations in the interface language.

## Results (2026-10-18)

- **Vietnamese UI in the browser:**
  - The library, sidebar, book page, Ask, search, review, and the deck panel
    all switch.
  - `<html lang>` follows the switch.
  - Dates show as "16 thg 10" and money as "0,21 US$".
  - Switching back to English restores everything.
- **Flashcards with the API against live Vertex:**
  - The evaluation book got 10 cards and the Vietnamese book 11 Vietnamese
    cards, every card with sources, in 4.5–7.6 s at about $0.006 each.
  - FSRS "Good" on a new card scheduled it in 10 minutes; "Good" again pushed
    it out 2 days.
  - Another owner gets 404, and the budget cap blocks generation.
- **Review page in the browser:**
  - The due badge counted 20, Space revealed the answer, and "3" moved on to
    the next card.
  - At 375 px the 4 rating buttons are a 2×2 grid, each 147×48 px, with no
    horizontal scroll.
- **Export:** `thu-vien-ben-song.md` has front matter, 9 footnotes with
  verbatim quotes, and merged locations ("Đoạn 1, Đoạn 3").
- **Checks:** web lint, typecheck, the 3 tests, and the production Next.js
  compile (including `/review`) pass. API lint and compile pass.
