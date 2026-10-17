---
title: "Book management: rename, delete, retry failed, clear incomplete uploads"
description: "Let owners fix and clean up their library: rename a book, delete it with its stored files, retry a failed summary, and clear unfinished uploads."
status: planned
priority: P2
effort: 2.5d
branch: master
tags: [api, worker, web, database, storage]
blockedBy: []
blocks: []
created: 2026-10-17
---

# Book management (roadmap C1)

## Contract

- **Outcome:** from the library and the book page, an owner can:
  - rename a book;
  - delete a book, which removes its rows and its stored files;
  - retry a book whose summary failed permanently;
  - clear all incomplete uploads at once.
- **Constraints:**
  - The API writes only the `app` schema. Python owns `data`, so retry is
    requested in `app` and honoured by the worker.
  - Every action is owner-scoped; another owner's book returns 404.
  - Never log titles, filenames, object keys, or tokens.
  - No new automated tests (AGENTS.md). Back up the DB before migrating. No push without approval.
- **Non-goals:** undo or trash, bulk delete of ready books, editing summaries,
  cancelling a running summary, and reclaiming spend already recorded.
- **Acceptance:**
  1. Renaming updates the library and book page; the title is trimmed and
     1–500 characters; filename and summary are unchanged.
  2. Deleting a ready book removes the book, its source document, evidence,
     summary, runs, events, and checkpoints, plus its original and
     normalized objects in storage. `data.model_usage` rows stay, so today's
     spend does not drop. Deleting while a run is actively summarizing returns
     409 and the UI disables the action.
  3. Retrying a `permanent_failed` summary reopens the same run. It is claimed
     again, reuses any saved evidence chunks, and does not create a second
     source document. Retry is refused (409) unless the latest run is
     `permanent_failed`.
  4. "Clear incomplete uploads" deletes only `pending_upload` books and
     reports how many were removed.
  5. API lint, build, and Prettier pass; web lint, typecheck, tests, and build
     pass; Python ruff and compileall pass. Each action is checked locally in
     the browser after the user signs in.

## Verified design facts (2026-10-17)

- **Cascade delete works.** As `app_rw`, `DELETE FROM app.books` cascaded
  through source documents, spans, nodes, evidence, the summary, runs, and
  checkpoints. The immutability triggers in migration 004 allow deletes once
  the parent book is gone. `data.model_usage` kept its 3 rows (no foreign keys,
  by design). This was checked inside a rolled-back transaction.
- **Why retry cannot use a new processing version.** Summary claims require
  exactly one source document per book (`book_source_document_claim_state`).
  Re-queuing under a new version would ingest a second source document and
  block the summary forever. Retry must reopen the existing run instead.
- **Storage:** originals live at `books/{owner}/{book}/{object}/original`,
  normalized artifacts under `normalized/{owner}/{book}/`. The API service
  account already has `storage.objectAdmin`. The API's `ObjectStorage` port
  has only `createPutUrl` and `head` today.

## Phases

### 1. Retry requests (database + worker), 0.75d

- **Migration `011_create_processing_retry_requests.sql`:**
  - Table `app.processing_retry_requests`: `id`, `owner_id`, `book_id`, and
    `command_id` (FK to `app.processing_commands`, on delete cascade), plus
    `requested_at`.
  - Owner index. `app_rw` gets `INSERT`/`SELECT`; `data_rw` gets `SELECT`.
- **Claim query** (`command_repository.py`): a `permanent_failed` run is also
  eligible when a retry request for its command is newer than the run's
  `updated_at`.
- **Reopen:** `_CREATE_OR_REOPEN_RUN` allows `permanent_failed` → `running`
  under the same condition, and `_ALLOWED_TRANSITIONS` adds
  `PERMANENT_FAILED → RUNNING`.
- **Retry scope:** a summary failure retries `regenerate_summary` only. An
  ingest failure retries `ingest_book`, and its summary command follows
  through the normal readiness rule.
- **Log:** `command_claimed` gains `retry=true` (an allow-listed key) when a
  request triggered the claim.

### 2. API, 0.75d

- **Storage port:** `deletePrefix(prefix)` for GCS (list and delete) and S3/MinIO
  (`ListObjectsV2` plus `DeleteObjects`).
- **Endpoints**, all guarded and owner-scoped:
  - `PATCH /v1/books/:bookId` with `{ title }` returns the updated book.
  - `DELETE /v1/books/:bookId` returns 204, 404 when not the owner's, and 409
    while a run is `running` with a fresh lease. It deletes the DB row first, in
    one transaction, then deletes the `books/{owner}/{book}/` and
    `normalized/{owner}/{book}/` prefixes. A storage failure is logged with ids
    only and still returns 204; orphan cleanup is a follow-up.
  - `POST /v1/books/:bookId/retry` returns 202 and inserts a retry request for
    the failed command; it returns 409 unless the latest run is `permanent_failed`.
  - `DELETE /v1/books/incomplete` returns `{ deleted: n }`. It deletes only
    `pending_upload` books and their partial objects. Declare it before
    `DELETE /v1/books/:bookId`, or Nest routes "incomplete" to the
    UUID-validated parameter route and returns 400.
- **Use cases** follow the existing pattern (`application/books/*.use-case.ts`).

### 3. Web, 0.75d

- **Book actions menu** (library list and grid rows, plus the book page):
  Rename, Retry (failed only), Delete. Delete is disabled with a hint while summarizing.
- **Rename dialog:** a single text field with validation; the change is applied
  optimistically and rolled back on error.
- **Delete confirmation:** "Delete '{title}'? This removes the file and its
  summary. It can’t be undone." Focus moves to the cancel button.
- **Retry:** the failed book page's primary action calls retry; the book returns
  to "Queued" and polling resumes.
- **Needs attention view:** a "Clear incomplete uploads (n)" button with a confirmation.
- **Accessible:** a keyboard-reachable menu, dialog focus trap, and an
  `aria-live` result message.

### 4. Verification and docs, 0.25d

- **Local:** back up, apply 011, then try each action in the browser after you
  sign in. Use the queued 76 MB "Large Field Notes" test book to check deletion.
  Retry a book forced into `permanent_failed`.
- **Docs:** update the README API list and the timeline; ask before syncing Obsidian.

## Risks

- **Mid-run delete:** a worker already holding a lease could write after the
  delete. The 409 guard covers live leases; a stale lease's writes fail on
  foreign keys and end retryable with no target, which is harmless.
- **Orphaned objects** if storage deletion fails after the DB commit: private,
  low cost, logged for a later sweep.
- **Retry loops:** a permanently invalid file can be retried indefinitely by
  hand. Each retry is user-initiated and the daily cap still applies.

## Unresolved questions

1. Should delete be allowed while a book is summarizing? The plan blocks it with 409.
2. Should "clear" also remove failed books, or only incomplete uploads? The plan covers only incomplete uploads.
3. Is a confirmation enough for delete, or do you want a short undo window? An undo window is out of scope here.
