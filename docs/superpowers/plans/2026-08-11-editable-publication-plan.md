# Editable Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let NestJS create manual summary revisions and approve or publish an
effective summary without mutating Python-generated data.

**Architecture:** Python-generated summaries remain immutable `data` records.
NestJS stores revisions and publication state in `app` records, exposes an
effective-summary projection, and distinguishes user-edited content from
evidence-verified generated content.

**Tech Stack:** NestJS, PostgreSQL, SQL views, TypeScript, Next.js.

## Global Constraints

- Follow the roadmap global constraints.
- Do not add automated tests.
- NestJS must not update `data.generated_summaries`.

---

### Task 1: Add publication and revision database records

**Files:**
- Create: `infrastructure/database/migrations/005_create_summary_publications.sql`
- Create: `services/api/src/domain/publication/summary-revision.ts`
- Create: `services/api/src/domain/publication/summary-publication.ts`
- Create: `services/api/src/infrastructure/database/publication.repository.ts`

**Interfaces:**
- Produces: `app.summary_revisions`.
- Produces: `app.summary_publications`.
- Produces: `app.effective_summaries` view.

- [ ] **Step 1: Define revision storage**

Store `generated_summary_id`, author ID, markdown body, revision reason,
`citation_status`, and creation time. Reject a revision whose generated summary
belongs to another owner or book.

- [ ] **Step 2: Define publication storage**

Store state, active revision ID, approved-by user, approval time, and
publication time. Allow one active publication per book and summary scope.

- [ ] **Step 3: Create the effective-summary view**

Return the active manual revision when one exists; otherwise return the linked
generated summary. Include `content_origin` as `generated` or `user_edited`.

- [ ] **Step 4: Verify manually**

Apply migration and inspect that publication tables reference `data` records
without granting `app_rw` update privileges on the `data` schema.

- [ ] **Step 5: Commit**

```bash
git add infrastructure/database/migrations services/api/src/domain services/api/src/infrastructure
git commit -m "feat: add editable summary publications"
```

### Task 2: Add NestJS revision, approval, and publication commands

**Files:**
- Create: `services/api/src/application/publication/create-revision.use-case.ts`
- Create: `services/api/src/application/publication/approve-revision.use-case.ts`
- Create: `services/api/src/application/publication/publish-revision.use-case.ts`
- Create: `services/api/src/interfaces/http/publication.controller.ts`

**Interfaces:**
- Produces: `POST /v1/books/{bookId}/summaries/{summaryId}/revisions`.
- Produces: `POST /v1/publications/{publicationId}/approve`.
- Produces: `POST /v1/publications/{publicationId}/publish`.

- [ ] **Step 1: Create manual-revision use case**

Require book ownership or administrator privileges. Persist a revision without
changing the generated summary row.

- [ ] **Step 2: Create approval and publication use cases**

Require administrator privileges for approval and publication. Transition only
`draft -> approved -> published`; write actor and timestamps with each change.

- [ ] **Step 3: Expose effective-summary reads**

Return generated citation metadata, manual-edit provenance, publication state,
and an explicit user-edited indicator.

- [ ] **Step 4: Verify manually**

Create a generated summary through Python, create a NestJS revision, publish
it, and confirm the generated record hash remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add services/api
git commit -m "feat: add NestJS summary editing and publishing"
```

### Task 3: Add the frontend publication workflow

**Files:**
- Create: `apps/web/src/app/books/[bookId]/summary/page.tsx`
- Create: `apps/web/src/components/summary/revision-editor.tsx`
- Create: `apps/web/src/components/summary/publication-actions.tsx`
- Create: `apps/web/src/components/summary/effective-summary.tsx`

**Interfaces:**
- Consumes: NestJS publication APIs.
- Produces: manual edit, approval, publication, and provenance displays.

- [ ] **Step 1: Render effective content**

Show generated citations for generated text and a visible user-edited state for
manual revisions.

- [ ] **Step 2: Add editor and commands**

Allow authorized users to save a revision. Show approval and publish commands
only to administrators.

- [ ] **Step 3: Verify manually**

Edit a summary in the browser, publish it as an administrator, and reload the
page to confirm the effective revision is shown.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat: add editable summary publication UI"
```

## Plan Acceptance Checkpoint

- Manual edits never update generated Python summaries.
- Every effective summary identifies its generated or user-edited origin.
- Only authorized NestJS users can approve or publish.
- NestJS uses direct read access to generated records and direct write access
  only to `app` publication tables.
