---
title: "Live status"
description: "Push book processing status to open pages with Postgres NOTIFY and server-sent events instead of 5-second polling."
status: completed
priority: P2
effort: 1d
branch: master
tags: [api, web, database, realtime]
created: 2026-10-18
---

# Live status (roadmap C3)

## Design

- **Database (migration `020`):** a trigger on `data.processing_events` runs
  `pg_notify('bookwise_book_status', {owner_id, book_id})`. The payload holds
  ids only.
- **API:**
  - Each process holds one dedicated `LISTEN` connection
    (`PostgresBookStatusListener`). It connects on the first subscriber and
    reconnects after errors.
  - `GET /v1/live/books` is a server-sent-events stream. On a notification for
    the owner, it re-reads `getProcessingStatus` (owner-scoped) and sends
    `event: status`, the same shape as `/processing`.
  - The stream pings every 20 s and closes after 50 s, under the load
    balancer's 60 s limit, so the page reconnects.
  - Ask now uses the same SSE helper (`openEventStream`).
- **Web:**
  - `lib/live-status.ts` shares one stream across subscribers. It runs only
    while the page is visible, reconnects when the server closes it, and backs
    off 5–60 s after errors.
  - The library merges pushed statuses, and the book page reloads on a push
    for its book.
  - Polling drops from 5 s to a 30 s fallback.
- **Non-goals:** upload progress and other app-side changes (the uploading
  page already knows them), and browser `EventSource`, which can't send the
  bearer token.

## Results (2026-10-18, local)

- **Listener:**
  - A committed processing event reached `PostgresBookStatusListener` in about
    0.5 s.
  - The throwaway event was deleted afterwards.
- **Browser:**
  - The library page opened `/v1/live/books` (200).
  - A throwaway event for the Vietnamese test book was pushed to the page as
    `status`.
- **Bug fixed during testing:** React's development remount aborted the shared
  stream, and the loop then exited for good. After an abort the loop now
  re-checks its condition: it keeps running if there are subscribers again,
  and stops when the page is hidden or nobody listens.
- **Checks:** API lint and typecheck pass; web lint, typecheck, and the 3 tests pass.
