# Bookwise Obsidian Vault Design

Status: Approved for design review
Date: September 7, 2026

## Purpose

Create a standalone Obsidian vault that gives engineers and collaborators one
clear, navigable view of Bookwise: its purpose, architecture, technical
boundaries, operating procedures, delivery state, and planned work.

The vault is a maintained project guide, not a replacement for source code or
the implementation plans in this repository. Each note identifies its source
material and links to related notes so a reader can move from product intent to
architecture, workflows, operations, and roadmap without searching the whole
repository.

## Location And Scope

The vault will be created at:

```text
C:\Users\nguye\Documents\Bookwise
```

It will be a standalone vault beside the current `Obsidian Vault` directory.
It will contain project documentation only. It will not copy `.env` files,
credentials, access tokens, database passwords, or other secrets.

## Information Architecture

```text
Bookwise/
  00 Home/
    Bookwise.md
    Documentation Map.md
  01 Product/
    Purpose and Scope.md
    User Journeys.md
    Domain Glossary.md
  02 Architecture/
    System Overview.md
    Components and Boundaries.md
    Data Flow.md
    Authentication and Authorization.md
    Data Model.md
  03 Engineering/
    Tech Stack.md
    Repository Map.md
    API Reference.md
    Local Development.md
    Configuration Reference.md
  04 Workflows/
    Private Library Workflow.md
    Upload and Storage Workflow.md
    Processing Pipeline.md
  05 Delivery/
    Timeline.md
    Roadmap.md
    Decisions.md
    Risks and Open Questions.md
  06 Operations/
    Database and Migrations.md
    Storage and MinIO.md
    Troubleshooting.md
    Verification Guide.md
  07 References/
    Source Document Index.md
```

The numbered folders establish a reliable reading order while their names
remain meaningful in ordinary file navigation.

## Content Rules

Every substantive note will include frontmatter with:

- `status`: `current`, `planned`, `superseded`, or `reference`
- `last_reviewed`: September 7, 2026
- `source`: repository paths or implementation evidence

The home note and documentation map will act as maps of content. Notes will
use Obsidian wikilinks for relationships and relative repository paths in code
format for original source material.

Current behavior will be separated explicitly from planned work. For example,
the private-library workflow will document the current queued ingest boundary,
while the processing-pipeline note will identify command claiming, parsing,
and event recording as upcoming work.

## Visual Assets

The vault will use Obsidian-compatible Mermaid diagrams instead of generated
static images:

1. A system context diagram in `System Overview.md`.
2. A component and trust-boundary diagram in `Components and Boundaries.md`.
3. A browser-to-NestJS-to-Auth0 sequence diagram in `Authentication and
   Authorization.md`.
4. An upload-to-MinIO-to-queued-command flowchart in `Upload and Storage
   Workflow.md`.
5. A logical entity relationship diagram in `Data Model.md`.
6. A delivery timeline diagram in `Timeline.md`.

These diagrams stay editable with the documentation and avoid image files that
would become stale or be difficult to review in Git.

## Source Strategy

The initial vault will synthesize these repository sources:

- `README.md`
- `docs/project-timeline.md`
- `docs/superpowers/specs/2026-08-05-book-summarization-system-design.md`
- `docs/superpowers/specs/2026-08-11-nestjs-python-service-architecture.md`
- `docs/superpowers/specs/2026-08-14-private-uploads-library-auth0-design.md`
- `docs/superpowers/specs/2026-09-03-auth0-react-spa-migration-design.md`
- `docs/superpowers/specs/2026-09-05-auth0-spa-api-token-boundary-design.md`
- `docs/superpowers/specs/2026-09-05-spa-private-library-design.md`
- Active plans under `docs/superpowers/plans/`

The vault will summarize and organize those sources rather than reproduce
their full text. `Source Document Index.md` will provide the traceable map
back to the repository.

## Initial Success Criteria

The created vault is successful when:

1. A newcomer can understand Bookwise's purpose, current capabilities, and
   next development milestone from `00 Home/Bookwise.md`.
2. The product, architecture, engineering, workflow, delivery, and operations
   areas are navigable from the documentation map.
3. Authentication, upload, storage, and processing boundaries have explicit
   diagrams.
4. Local setup and troubleshooting instructions reflect the current working
   environment without exposing secrets.
5. Current delivery state is distinguished from future work and superseded
   plans.
