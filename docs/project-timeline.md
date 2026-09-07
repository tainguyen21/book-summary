# Project Timeline

Last updated: September 7, 2026

## Completed

| Date | Milestone | Outcome |
| --- | --- | --- |
| August 10-11, 2026 | Platform foundation | Created the pnpm workspace, Next.js web app, NestJS API, Python service shell, Docker development stack, and central PostgreSQL migration baseline. |
| August 11, 2026 | Identity foundation | Added NestJS OIDC token verification, invite-only identity rules, user provisioning, and authenticated API contracts. |
| August 14-15, 2026 | Private-library design | Defined the private-upload, library, and processing-command workflow, including owner-scoped access and object-storage requirements. |
| September 3-4, 2026 | Auth0 SPA migration | Replaced the server-session SDK with the official Auth0 React SDK, added client-side sign-in, sign-up, sign-out, and fixed the web app to `http://localhost:3000`. Web tests, lint, and production build pass. |
| September 5-6, 2026 | SPA private library | Implemented direct bearer-authenticated uploads to private MinIO/S3, idempotent queued ingest commands, owner-scoped library and processing reads, and the signed-in upload/library UI. Local static, storage, database, and two-owner adapter verification pass. |
| September 7, 2026 | Browser acceptance | Configured the Auth0 access-token claim boundary and verified sign-in, identity provisioning, upload, queued status, library refresh, PostgreSQL persistence, and private MinIO storage in the local browser workflow. |

## In Progress

The current delivery focus is the Python processing pipeline:

1. Claim queued `ingest_book` commands safely.
2. Read private source objects and parse PDF, EPUB, DOCX, and TXT uploads.
3. Record processing runs and events, then update book and command status.
4. Produce evidence-linked summary inputs for later publication.

## Next

1. Add editable summary publication in NestJS and the web app.
2. Add private search and cited question answering.
3. Add operational hardening, including production storage credentials,
   configurable SPA Auth0 settings, and monitoring.
4. Consider later upload capabilities such as multipart/resumable uploads,
   OCR, malware scanning, and files larger than 100 MiB.

## Reference Plans

- [NestJS and Python roadmap](superpowers/plans/2026-08-11-nestjs-python-roadmap.md)
- [SPA Auth0 migration design](superpowers/specs/2026-09-03-auth0-react-spa-migration-design.md)
- [SPA private library plan](superpowers/plans/2026-09-05-spa-private-library-plan.md)
- [Superseded server-session upload plan](superpowers/plans/2026-08-14-private-uploads-library-auth0-plan.md)
