# Replatform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a clean NestJS application service, a clean Python
processing service, and one central SQL migration history with PostgreSQL
schema ownership.

**Architecture:** NestJS exposes the public API through Fastify. Python runs
private command workers. Both services map PostgreSQL records through
infrastructure repositories while domain and application layers remain free of
framework dependencies.

**Tech Stack:** NestJS, Fastify, TypeScript, pnpm, Python, SQLAlchemy,
Celery, PostgreSQL, Redis, Docker Compose, dbmate-compatible SQL migrations.

## Global Constraints

- Follow the roadmap global constraints.
- Do not add automated tests.
- Do not add user-facing FastAPI routes.
- Keep all current FastAPI and Alembic files untouched until the central
  migration runner validates a replacement schema.

---

### Task 1: Create the NestJS clean-architecture application shell

**Files:**
- Create: `services/api/package.json`
- Create: `services/api/tsconfig.json`
- Create: `services/api/src/main.ts`
- Create: `services/api/src/app.module.ts`
- Create: `services/api/src/domain/README.md`
- Create: `services/api/src/application/README.md`
- Create: `services/api/src/infrastructure/README.md`
- Create: `services/api/src/interfaces/README.md`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Produces: `pnpm --dir services/api build`.
- Produces: `bootstrap() -> NestFastifyApplication`.

- [ ] **Step 1: Add the NestJS workspace manifest**

Create scripts named `build`, `start:dev`, `lint`, and `format:check`.
Depend on `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-fastify`,
`reflect-metadata`, `rxjs`, `class-validator`, and `class-transformer`.

- [ ] **Step 2: Create framework composition only**

Implement `main.ts` with `NestFactory.create<NestFastifyApplication>()`,
`FastifyAdapter`, global validation, and the `AppModule`. Keep route handlers
out of `main.ts`.

- [ ] **Step 3: Create layer boundaries**

Add short README files declaring that `domain` imports no NestJS or database
packages, `application` depends only on domain ports, `infrastructure`
implements ports, and `interfaces` adapts HTTP requests.

- [ ] **Step 4: Verify the shell**

Run:

```bash
pnpm install --frozen-lockfile
pnpm --dir services/api lint
pnpm --dir services/api build
```

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml services/api
git commit -m "feat: add NestJS application shell"
```

### Task 2: Create the Python processing-service shell

**Files:**
- Create: `services/data/pyproject.toml`
- Create: `services/data/src/bookwise_data/domain/__init__.py`
- Create: `services/data/src/bookwise_data/application/__init__.py`
- Create: `services/data/src/bookwise_data/infrastructure/__init__.py`
- Create: `services/data/src/bookwise_data/workers/__init__.py`
- Create: `services/data/src/bookwise_data/workers/main.py`

**Interfaces:**
- Produces: `python -m bookwise_data.workers.main`.
- Produces: clean Python layer imports matching the approved specification.

- [ ] **Step 1: Create the Python project manifest**

Include SQLAlchemy, psycopg, Celery, boto3, Pydantic, and parser/model
dependencies required by later plans. Do not include FastAPI.

- [ ] **Step 2: Add worker composition**

Create a `main.py` that imports only a worker bootstrap function. Defer command
handling, parsers, and providers to later plans.

- [ ] **Step 3: Verify the Python service**

Run:

```bash
uv sync --project services/data
uv run --project services/data python -m compileall -q services/data/src
```

- [ ] **Step 4: Commit**

```bash
git add services/data
git commit -m "feat: add Python processing service shell"
```

### Task 3: Establish central SQL migrations and schema roles

**Files:**
- Create: `infrastructure/database/migrations/001_create_service_schemas.sql`
- Create: `infrastructure/database/migrations/002_create_app_foundation.sql`
- Create: `infrastructure/database/migrations/003_create_data_foundation.sql`
- Create: `infrastructure/database/roles/app_rw.sql`
- Create: `infrastructure/database/roles/data_rw.sql`
- Create: `infrastructure/database/roles/migration_admin.sql`
- Create: `infrastructure/database/migrate.ps1`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: `app` and `data` PostgreSQL schemas.
- Produces: `app_rw`, `data_rw`, and `migration_admin` roles.
- Produces: `migrate.ps1 -DatabaseUrl <url>`.

- [ ] **Step 1: Define the migration ledger and schemas**

`001_create_service_schemas.sql` creates `schema_migrations`, `app`, and
`data`. The ledger has `version`, `applied_at`, and `checksum` columns.

- [ ] **Step 2: Define role privileges**

Grant `app_rw` usage and DML only in `app`, with select-only access to approved
`data` views. Grant `data_rw` usage and DML only in `data`, with select-only
access to required `app` books and commands.

- [ ] **Step 3: Define foundation records**

Create `app.users`, `app.invitations`, `app.books`, `app.book_objects`, and
`app.processing_commands`. Create `data.processing_runs`,
`data.processing_events`, and `data.generated_summaries`. Every owner-scoped
table includes `owner_id`, UUID primary keys, and timezone-aware timestamps.

- [ ] **Step 4: Implement the migration runner**

`migrate.ps1` applies lexically ordered SQL files in one transaction per file,
stores its SHA-256 checksum in `schema_migrations`, and stops if an applied
file checksum differs.

- [ ] **Step 5: Verify the database contract**

Run:

```bash
docker compose up -d postgres
powershell -File infrastructure/database/migrate.ps1 -DatabaseUrl <local-url>
docker compose exec -T postgres psql -U bookwise -d bookwise -c "\dn"
```

- [ ] **Step 6: Commit**

```bash
git add infrastructure/database docker-compose.yml
git commit -m "feat: add central database migrations"
```

### Task 4: Remove the superseded FastAPI and Alembic foundation

**Files:**
- Delete: `services/backend/alembic.ini`
- Delete: `services/backend/alembic/`
- Delete: `services/backend/src/bookwise/api/`
- Delete: `services/backend/src/bookwise/db/`
- Delete: `services/backend/src/bookwise/config.py`
- Delete: `services/backend/`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: verified NestJS, Python, and central migration foundations.
- Produces: no FastAPI runtime or Alembic migration path.

- [ ] **Step 1: Confirm the replacement services build**

Run the NestJS build, Python compile check, and central migration runner from
Tasks 1 through 3.

- [ ] **Step 2: Delete the superseded service**

Remove `services/backend` only after the preceding commands succeed.

- [ ] **Step 3: Rewrite developer commands**

Document NestJS as the API service, Python as the private processing service,
and `migrate.ps1` as the sole schema migration command.

- [ ] **Step 4: Verify no obsolete entrypoints remain**

Run:

```bash
rg -n "FastAPI|uvicorn|alembic|bookwise.api" README.md services infrastructure .github
```

The command must return no active runtime references.

- [ ] **Step 5: Commit**

```bash
git add -A services/backend README.md .github
git commit -m "refactor: remove superseded FastAPI foundation"
```

## Plan Acceptance Checkpoint

- NestJS builds and exposes no product behavior beyond framework composition.
- Python compiles and exposes no browser-facing HTTP service.
- Central migrations create `app` and `data` schemas with restricted roles.
- No service can write unrestricted records in the other schema.
- No FastAPI or Alembic runtime entrypoint remains.
