---
title: "Command palette"
description: "⌘K / Ctrl+K quick find for books, library views, search, ask, and upload."
status: completed
priority: P2
effort: 1d
branch: master
tags: [web, accessibility]
created: 2026-10-18
---

# Command palette (roadmap C2)

## Contract

- **Outcome:** ⌘K (Ctrl+K) from any signed-in page, or the sidebar's "Quick
  find" button, opens a palette. It offers:
  - books matched by title or filename, ignoring case and Vietnamese accents;
  - library views, Search books, and Upload book;
  - with 2 or more characters typed, "Search inside books for …" and "Ask
    your library …".
- **Constraints:**
  - The palette never spends tokens: "Ask your library" opens `/search?ask=` with
    the question prefilled and focused, not sent.
  - No new dependencies, and no new tests.
- **Acceptance:**
  - The palette is a modal combobox: arrows, Home/End, Enter, and Escape work.
    The active option is exposed through `aria-activedescendant`, and focus
    returns to the opener.
  - `/search?q=` runs the search, and `/search?ask=` prefills the question.
  - It works at 375 px.

## Results (2026-10-18)

- Verified locally in the browser:
  - ⌘K and Ctrl+K open the palette, with focus on the combobox.
  - "slow orch" filters to 8 books plus the two actions, and ArrowDown moves the
    active option.
  - Enter on "Ask your library" opens `/search?ask=slow%20orch` with the
    question prefilled and focused, and no answer is requested.
  - Enter on "frost" searches `/search?q=frost` (20 results).
  - Escape restores focus to the search field.
  - At 375 px the dialog is 344 px wide with no horizontal scroll, and the
    sidebar button hides on phones, where "Search books" is in the top bar.
- Checks: web lint, typecheck, and the 3 tests pass.
