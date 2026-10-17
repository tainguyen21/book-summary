---
phase: 4
title: Cost card and paused state in the web app
status: completed
effort: 0.5d
dependsOn: [phase-02, phase-03]
---

# Phase 4 — Web cost card and paused state

## Context
- The API (NestJS) controllers live in `services/api/src/interfaces/http/`; data reads go through `services/api/src/infrastructure/database/book-read.repository.ts`, which queries `data.*` views filtered by `owner_id`.
- The redesigned web app (`apps/web`, uncommitted on master) has a stats row in `components/library/library-stats.tsx` and status mapping in `lib/book-status.ts`. The processing status already exposes `latestEventType`.

## Requirements
- `GET /v1/usage/today` returns `{ spentUsd, capUsd, paused, resetsAt }` for the signed-in owner.
  - Spend comes from `data.book_model_usage_daily` for the owner's local day.
  - The cap comes from the API's environment (`BOOKWISE_DAILY_BUDGET_USD`, same value as the worker; add it to the API ConfigMap).
- The library dashboard shows "Today’s AI spend: $0.12 of $1.00", with a thin progress bar. At or over the cap, it shows a warning tone and "Resumes at 00:00".
- A book whose latest event is `budget_paused` shows the badge "Paused · daily budget" (warning tone) instead of "Retrying". The detail page explains: "Paused because today’s AI budget was reached. It resumes automatically after midnight."

## Files
- **Create:**
  - `services/api/src/interfaces/http/usage.controller.ts`
  - a usage read in `book-read.repository.ts`, or a small `usage-read.repository.ts`
- **Modify:**
  - `services/api/src/app.module.ts` (register the controller)
  - `apps/web/src/lib/book-status.ts` (paused case)
  - `apps/web/src/lib/library-types.ts` (schema)
  - `apps/web/src/components/library/library-stats.tsx` (cost card)
  - `apps/web/src/components/book/book-detail-screen.tsx` (paused copy)

## Steps
1. Implement the endpoint with owner scoping copied from the summary controller's principal handling.
2. Fetch it once on dashboard load, with no polling beyond the existing refresh.
3. Map the `budget_paused` latest event in `presentStatus`. This needs the processing status's `latestEventType` passed into the badge source.

## Validation
- API lint and build pass; web lint, typecheck, test, and build pass.
- Browser: with the tiny cap from phase 3, the dashboard shows the over-cap card and the paused badge. After raising the cap, both clear on refresh.

## Risks
- Commit the web redesign first, so this phase doesn't mix with the large uncommitted UI change.

## Results (2026-10-17)

- **Deviation (correctness):** the card shows the shared daily budget, meaning
  global spend since local midnight in `BOOKWISE_BUDGET_TIMEZONE`, which is
  exactly what the worker pauses on. The per-owner UTC-day view would
  disagree with the pause. Migration `010` grants `app_rw` execute on
  `data.model_usage_spent_since`, which returns only a total.
- **API:** `GET /v1/usage/today` (guarded) returns `{spentUsd, capUsd, paused, resetsAt}`.
  The cap and time zone come from the shared ConfigMap. Its SQL was checked as
  `app_rw` locally: $0.4839 spent, resets at 17:00 UTC (midnight Saigon).
- **Web:**
  - A slim budget strip under the stats shows "Today’s AI spend: $X of $Y",
    with a progress bar and a warning tone plus "summaries resume at 00:00" when
    paused. It is hidden when the cap is 0.
  - A `budget_paused` latest event shows the badge "Paused · daily budget"
    (queued category, still polled), and the detail page shows the paused copy.
- **Checks:** API lint, build, and Prettier pass; web lint, typecheck, the 3
  existing tests, and the build pass.
- **Not verified:** the signed-in browser view (Auth0 sign-in is the user's).
