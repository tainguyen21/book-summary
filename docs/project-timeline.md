# Project Timeline

Last updated: September 17, 2026

## Completed

| Date | Milestone | Outcome |
| --- | --- | --- |
| August 10-11, 2026 | Platform foundation | Created the pnpm workspace, Next.js web app, NestJS API, Python service shell, Docker development stack, and central PostgreSQL migration baseline. |
| August 11, 2026 | Identity foundation | Added NestJS OIDC token verification, invite-only identity rules, user provisioning, and authenticated API contracts. |
| August 14-15, 2026 | Private-library design | Defined the private-upload, library, and processing-command workflow, including owner-scoped access and object-storage requirements. |
| September 3-4, 2026 | Auth0 SPA migration | Replaced the server-session SDK with the official Auth0 React SDK, added client-side sign-in, sign-up, sign-out, and fixed the web app to `http://localhost:3000`. Web tests, lint, and production build pass. |
| September 5-6, 2026 | SPA private library | Implemented direct bearer-authenticated uploads to private MinIO/S3, idempotent queued ingest commands, owner-scoped library and processing reads, and the signed-in upload/library UI. Local static, storage, database, and two-owner adapter verification pass. |
| September 7, 2026 | Browser acceptance | Configured the Auth0 access-token claim boundary and verified sign-in, identity provisioning, upload, queued status, library refresh, PostgreSQL persistence, and private MinIO storage in the local browser workflow. |
| September 8, 2026 | Processing command worker | Added a Python worker that claims queued application commands with PostgreSQL row locking, records Python-owned processing runs and durable events, recovers abandoned leases, and preserves the NestJS status projection without writing the `app` schema. |
| September 8, 2026 | Source ingestion | Added private-object retrieval, bounded PDF/EPUB/DOCX/TXT parsing, immutable source documents/spans/structure nodes, provenance and owner isolation, normalized private artifacts, and permanent failure handling for invalid or unsupported sources. |
| September 7, 2026 | Browser stabilization | Fixed the client-side processing-status polling loop. Active books now receive one immediate status read, then at most one read every five seconds until their status becomes terminal or the browser page is hidden. Web lint, production build, and the authenticated browser path pass. |
| September 15-17, 2026 | Summary publication | Finalization now queues paired `ingest_book` and `regenerate_summary` commands. Generation claims wait for normalized source readiness, accepted immutable summaries and ordered citation locations are exposed through owner-filtered projections and `GET /v1/books/:bookId/summary`, and `/books/[bookId]` provides the read-only summary experience. Migrations `006` and `007`, local verification, and the repository CI workflow pass; a real provider-backed browser run remains pending until a model provider is configured. |

## In Progress

The current delivery focus is private retrieval and operational validation:

1. Add private search across normalized source material and accepted generated
   artifacts.
2. Add cited question answering while preserving owner and evidence boundaries.
3. Run the complete browser workflow with a configured model provider.
4. Harden production credentials, monitoring, failure recovery, and worker
   operations.

## Next

1. Add private search and cited question answering.
2. Decide whether summary editing belongs in the next publication iteration.
3. Add operational hardening, including production storage credentials,
   configurable SPA Auth0 settings, and monitoring.
4. Consider later upload capabilities such as multipart/resumable uploads,
   OCR, malware scanning, and files larger than 100 MiB.

## Reference Plans

- [NestJS and Python roadmap](superpowers/plans/2026-08-11-nestjs-python-roadmap.md)
- [SPA Auth0 migration design](superpowers/specs/2026-09-03-auth0-react-spa-migration-design.md)
- [SPA private library plan](superpowers/plans/2026-09-05-spa-private-library-plan.md)
- [Summary publication design](superpowers/specs/2026-09-14-summary-publication-design.md)
- [Summary publication plan](superpowers/plans/2026-09-15-summary-publication-plan.md)
- [Superseded server-session upload plan](superpowers/plans/2026-08-14-private-uploads-library-auth0-plan.md)
