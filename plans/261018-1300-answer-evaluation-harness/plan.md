---
title: "Answer evaluation harness"
description: "On-demand golden-question evaluation of Ask a book, graded for faithfulness, key facts, and traps."
status: completed
priority: P2
effort: 1d
branch: master
tags: [api, evaluation, generation]
created: 2026-10-18
---

# Answer evaluation harness (roadmap A9)

## Contract

- **Outcome:** `pnpm --dir services/api eval:ask -- --owner --book --set --out`
  asks one book every question in a golden set (cache skipped), grades each
  answer with the model, and writes a Markdown report.
- **Metrics:**
  - answered or declined as expected;
  - faithfulness (the share of claims supported by the cited passages);
  - key facts covered, and trap claims stated as true;
  - markers with a claim-matched quote;
  - median time to first text, and spend.
- **Constraints:**
  - It runs on demand only. It is not a test-suite or CI step, and it adds no test dependencies.
  - Judge spend is recorded as `evaluation` in `data.model_usage` (migration
    `017`) and counts toward the daily budget.
- **Golden set:** `services/api/evaluation/the-slow-orchard.questions.json`
  has 13 questions on the evaluation book: 10 English, 1 Vietnamese, and 2
  that the book doesn't answer. Their key facts and traps are taken from the
  October 17 rubric.

## Results (2026-10-18, local evaluation book)

| Run | As expected | Faithfulness | Key facts | Traps | Matched quotes | First text | Spend |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Baseline | 12 / 13 | 100% | 18 / 20 | 0 | 41 / 41 | 3.2 s | $0.042 |
| After fixes | 13 / 13 | 100% | 21 / 23 | 0 | 46 / 48 | 3.0 s | $0.049 |

- **What the baseline found:**
  - "What are the three rules?" was refused (`NOT_IN_BOOK`). Retrieval found
    the paragraph introducing the rules and the one on the third rule, but not
    the two in between.
  - "Did it cost the town nothing?" missed the council insurance paragraph,
    because "costing" doesn't match "cost" in the `simple` configuration.
- **Fixes made in the Ask pipeline:**
  - The top 3 hits also bring the 2 paragraphs after them, up to 12 sources
    within the 16,000-character limit.
  - The instruction now says to answer what the passages cover and name what
    they don't, saving `NOT_IN_BOOK` for passages with nothing relevant.
  - Ask keyword matching uses 4-letter prefixes for plain ASCII words of 5 or
    more letters. Accented words, including Vietnamese syllables, and the
    search page stay exact.
  - Generation is retried once when it fails before any text has streamed. One
    run hit a transient Vertex error on the Vietnamese question.
- **Remaining misses vary between runs:** each run missed a different single
  fact (Odile Fenn's background, or the named-waterer rule). Model grading is
  not exact either, so compare runs by trend.
- **Reports:** `plans/reports/eval-261018-ask-slow-orchard-baseline.md` and
  `plans/reports/eval-261018-ask-slow-orchard.md`.
- **Checks:** API lint, build, and Prettier pass.
