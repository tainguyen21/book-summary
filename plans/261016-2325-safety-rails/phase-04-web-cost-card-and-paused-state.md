---
phase: 4
title: Cost card and paused state in the web app
status: pending
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
