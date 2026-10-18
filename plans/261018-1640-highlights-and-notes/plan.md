---
title: "Highlights and notes"
description: "Highlight summary sentences, keep notes on them, and export them with the summary."
status: completed
priority: P2
effort: 1d
branch: master
tags: [api, web, database]
created: 2026-10-18
---

# Highlights and notes (roadmap C4)

## Contract

- **Outcome:**
  - The quote card that opens from a sentence's marker has a "Highlight"
    toggle (`aria-pressed`) and a note editor.
  - Highlighted sentences are marked in the summary.
  - "Your highlights" on the book page lists them with notes, with "Show in
    summary" and remove.
  - The Markdown export ends with a "Highlights" section.
- **Integrity:**
  - The API copies the sentence text from the stored summary, never from the
    request.
  - A highlight belongs to one summary version (`summary_id`). After the book
    is summarized again, older highlights stay listed, labelled "From an
    earlier version of this summary".
  - Notes are at most 2,000 characters. Everything is owner-scoped.
- **API** (migration `019`): `GET /v1/books/:bookId/highlights`,
  `PUT /v1/books/:bookId/highlights` with `{ summaryId, paragraph, sentence,
  note? }` (an upsert), and `DELETE /v1/highlights/:id`. Local CORS now allows
  `PUT`.
- **Non-goals:** free-text selection inside sentences, highlights on quotes or
  answers, and a notes page across books.

## Results (2026-10-18, local)

- **Use case:**
  - Creating a highlight and then saving a note keep the same id, and the note
    is trimmed.
  - An unknown sentence, an old summary id, or another owner returns 404. A
    2,001-character note is rejected.
  - Another owner can't list or delete.
- **Browser:**
  - Highlight, then add a note, then save: the toggle shows pressed and
    "Saved"; the sentence is marked; the panel lists it with the note.
  - After a reload, the mark persists. "Show in summary" opens and focuses the
    sentence's marker, with its note in the card.
  - The export ends with "## Highlights" and the quoted sentence plus its note.
  - Removing from the panel clears the mark and the list.
- **Checks:** API lint and typecheck pass; web lint and typecheck pass.
