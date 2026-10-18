---
title: "Book-language output"
description: "Summaries and evidence in the book's own language; answers in the question's language."
status: completed
priority: P2
effort: 0.5d
branch: master
tags: [worker, web, generation, i18n]
created: 2026-10-18
---

# Book-language output (roadmap A6)

## Contract

- **Outcome:**
  - Evidence statements and summaries are written in the book's language, so a
    Vietnamese book gets a Vietnamese summary, never translated.
  - Answers already follow the question's language (Ask instructions).
  - The reader marks a Vietnamese summary with `lang="vi"`.
- **Approach:** a prompt rule instead of a language detector or schema
  change: evidence follows the source text, and the summary follows the
  evidence. Verified quotes were already verbatim.
- **Effect on existing summaries:** the prompt versions change, so books
  already in progress redo their evidence and section checkpoints. Existing
  summaries are unchanged until regenerated.

## Results (2026-10-18)

- **Vietnamese book run locally** through the real pipeline against live
  Vertex: an original 450-word test book, "Thư viện bên sông", in about
  38 s.
  - The evidence and the summary were in Vietnamese.
  - The summary kept every fact: dates, 1,200 and 400 books, 80 cm shelves,
    all three rules, 150 → 620 loans a month with the handwritten-record
    caveat, 46 million đồng, and 3 million đồng a year for electricity.
- **Reader:** the summary wrapper has `lang="vi"`, with 9 citations working.
  The English evaluation book is not marked, so it keeps the page's `en`.
- **Checks:** worker `ruff check` passes; web lint and typecheck pass.
- **Not re-run:** the English rubric. The change only asks the model to keep
  the source language.
