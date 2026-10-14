# New Device Setup

Prepared October 14, 2026. Commands below run from the repository root unless
stated otherwise. The primary supported walkthrough is Windows with PowerShell
7, matching the existing local launcher and migration scripts.

## 1. Install And Check Tools

Install these tools on the new device using their official installers or your
approved package manager. Do not copy executable caches from the old device.

| Tool | Project requirement | Check |
| --- | --- | --- |
| Git | Clone and push the repository | `git --version` |
| Node.js | 24, matching CI and container builds | `node --version` |
| pnpm | `11.21.0`, pinned in root `package.json` | `pnpm --version` |
| Python | 3.12 recommended; project requires >=3.12 | `python --version` |
| uv | Supports the checked-in Python lockfile | `uv --version` |
| PowerShell | 7 (`pwsh`) for migration/local scripts | `pwsh --version` |
| Docker Desktop | Running Linux containers with the `docker compose` plugin | `docker compose version` |
| ripgrep | Recommended for agent code searches | `rg --version` |
| GitHub CLI | Optional for repository authentication and workflow inspection | `gh --version` |
| Google Cloud CLI | Required only for Vertex AI or production access | `gcloud --version` |
| kubectl and GKE auth plugin | Required only for production inspection | `kubectl version --client` |

The handoff checks on the old device passed with Node.js 24.18.1, pnpm
11.21.0, uv 0.12.17, PowerShell 7.6.5, and Docker Compose 5.3.1. These are
verification evidence, not permission to rewrite lockfiles or upgrade the
project on the new device.

For pnpm after Node.js is installed:

```powershell
npm install --global pnpm@11.21.0
```

If Python 3.12 is not installed, uv can install it:

```powershell
uv python install 3.12
```

Check that Docker's daemon is running with `docker info`. Installing Docker
without starting it is not enough. Linux/macOS users can run services in
separate terminals; `scripts/start-local.ps1` is a Windows terminal launcher.

## 2. Clone And Authenticate

Use your own GitHub account and access rights:

```powershell
gh auth login
gh auth setup-git
git clone https://github.com/tainguyen21/book-summary.git
Set-Location book-summary
git status --short --branch
git log -5 --oneline
```

Without GitHub CLI, authenticate HTTPS through Git Credential Manager, or
configure your own SSH key and use the normal `github.com` SSH hostname.
The old device's `github.com-tai21` SSH alias is not portable. Do not copy
private SSH keys into the repository. Configure `git user.name` and
`git user.email` locally with your own identity before committing.

Read `AGENTS.md` and `docs/agent-handoff.md` before asking an agent to edit code.

## 3. Install Dependencies And Configure Local Auth

```powershell
pnpm install --frozen-lockfile
uv sync --project services/data --locked --python 3.12
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `.env` privately. Keep local database URLs, MinIO settings, and
`NEXT_PUBLIC_API_URL=http://localhost:3001` from the example. Replace the
Auth0 placeholders with the approved application's public values:

```dotenv
NEXT_PUBLIC_AUTH0_DOMAIN=dev-p8c5tpe1ghv8qtxf.us.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=U3USwzKKexcx7Y2FkWVTRznXrK7dTdaq
NEXT_PUBLIC_AUTH0_AUDIENCE=https://api.bookwise.local
NEXT_PUBLIC_AUTH0_REDIRECT_URI=http://localhost:3000
OIDC_ISSUER=https://dev-p8c5tpe1ghv8qtxf.us.auth0.com/
OIDC_AUDIENCE=https://api.bookwise.local
```

Confirm with the Auth0 administrator that `http://localhost:3000` is an allowed
callback URL, logout URL, and web origin for this SPA. The access token must
contain `https://bookwise.local/email` and
`https://bookwise.local/email_verified=true`; do not weaken API verification.
The audience is an Auth0 API identifier, not the web or public API URL.

Static builds can use placeholders, but real sign-in and end-to-end processing
cannot. To generate summaries, configure a real model provider separately.
For Vertex AI:

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project bookwise-509408
```

The signed-in account must already have appropriate project permissions.
Set the worker's `.env` values:

```dotenv
BOOKWISE_MODEL_PROVIDER=vertex
BOOKWISE_SUMMARY_MODEL=gemini-2.5-flash
BOOKWISE_EMBEDDING_MODEL=gemini-embedding-001
BOOKWISE_EMBEDDING_DIMENSIONS=768
GOOGLE_CLOUD_PROJECT=bookwise-509408
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=true
```

Local storage can remain MinIO while generation uses Vertex AI. Do not point
local database URLs at production. ADC authenticates application libraries;
`gcloud auth login` authenticates CLI operations and is a separate setup.

## 4. Start Local Services

```powershell
pnpm run start:local
```

The launcher starts Compose, waits for PostgreSQL, applies local migrations,
and opens API, web, and worker terminals. It imports `.env` for the worker;
the Python worker does not load `.env` itself.

| Service | Address |
| --- | --- |
| Web | `http://localhost:3000` |
| API health | `http://localhost:3001/v1/health` |
| MinIO console | `http://localhost:9001` |
| MinIO object API | `http://localhost:9000` |
| PostgreSQL | `localhost:5432`, database `bookwise_next` |
| Redis | `localhost:6379` |

Use development-only Compose credentials from `.env.example`. Never reuse
them for production. Stop service terminals individually and use
`docker compose stop` to stop local infrastructure without deleting data.
Do not use `docker compose down -v` unless deleting local data is intentional.

## 5. Verify The Checkout

Run existing checks; do not introduce new automated tests without approval:

```powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
pnpm --dir apps/web test
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
uv run --project services/data ruff check services/data
uv run --project services/data python -m compileall -q services/data/src
docker compose config --quiet
Invoke-RestMethod http://localhost:3001/v1/health
git diff --check
```

The existing web suite may emit React `act(...)` warnings. Record failures and
warnings honestly. Next.js may regenerate `apps/web/next-env.d.ts` when switching
between build and development; review that output before staging it.

Manually verify sign-in, a fresh file upload, finalization, processing, and a
published summary. Build/check success alone does not verify a real model run.
Incomplete uploads show guidance and do not automatically progress.

## 6. Connect To Existing Production

Production already exists. Do not rerun `bootstrap-gcp.ps1`,
`configure-services.ps1`, resource creation, or production migrations merely
because this is a new device.

After receiving project access, install the kubectl and
`gke-gcloud-auth-plugin` components using the installation method supported
by your Google Cloud CLI distribution. Then:

```powershell
gcloud auth login
gcloud config set project bookwise-509408
gcloud container clusters get-credentials bookwise-autopilot `
  --region=asia-southeast1 --project=bookwise-509408
kubectl config current-context
kubectl get pods -n bookwise
gh run list --workflow deploy-gcp.yml --limit 3
```

Check the context before any write operation. Runtime secrets remain in
Secret Manager; GitHub's workload identity authenticates deployment jobs,
not the developer's device. Read `infrastructure/gcp/runbook.md` before
operations. Pushes to `master` trigger production deployment.

## 7. Configure The New Agent And Optional Connectors

- Repository instructions and handoff docs are portable. Install/authenticate
  the coding agent on the new device separately.
- Agent skills/plugins under the old user's home directory are not part of
  this repository. Reinstall needed tools, or use the standard CLI workflow.
- `.vscode/mcp.json` contains an optional Auth0 server definition, not an
  authenticated connection. It requests broad tools; review permissions before
  enabling it and authenticate separately. Do not invoke management writes
  merely to verify connection.
- Obsidian's `Bookwise/00 Home/Bookwise.md` guide is outside this Git repository.
  Transfer/sync that vault separately and reconnect its MCP connector.
  No Obsidian synchronization was performed by this handoff.
- `.ua/knowledge-graph.json` is a generated code map for optional navigation.
  Its snapshot refers to `e8bbcba`; regenerate it when useful, and verify claims
  against source. Intermediate analysis and trash are excluded from Git.

Give the next agent: "Read AGENTS.md, docs/agent-handoff.md, and
docs/new-device-setup.md. Check Git status and installed tools, report missing
configuration without printing secrets, and verify the existing checks before
continuing the requested work."

## What Git Does Not Transfer

Git transfers source, migrations, lockfiles, manifests, documentation, and the
reviewed code map. It does not transfer `.env`, dependencies, Docker volumes,
local uploaded books, Auth0 sessions, SSH keys, ADC, cloud CLI accounts, or
connector sessions. If local data must be preserved, arrange a separate secure
PostgreSQL backup and object-storage export; do not commit them or overwrite
production. Cloud SQL and GCS production data remain on GCP.
