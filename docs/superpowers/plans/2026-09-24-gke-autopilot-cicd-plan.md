# GKE Autopilot And CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare Bookwise for an initial Google Cloud deployment on GKE
Autopilot with one web Pod, one API Pod, and one continuously running worker
Pod, then deploy those workloads from GitHub Actions without stored cloud keys.

**Architecture:** Build three production containers and publish them to
Artifact Registry. Deploy them with Kustomize to the `bookwise` namespace in
the `bookwise-autopilot` cluster. Use Cloud SQL PostgreSQL, native GCS,
Vertex AI, Secret Manager, and GKE Workload Identity for runtime dependencies.
Use GitHub Actions OIDC federation for CI/CD authentication.

**Tech Stack:** Docker, Node.js 24, pnpm 11, Python 3.12, uv, GKE Autopilot,
Kustomize, Cloud SQL PostgreSQL, Cloud Storage, Vertex AI, Secret Manager,
Artifact Registry, GitHub Actions, Workload Identity Federation.

**Spec:** `docs/superpowers/specs/2026-09-24-gke-autopilot-deployment-design.md`

## Global Constraints

- Initial replicas are exactly one each for web, API, and worker.
- Production object storage uses `OBJECT_STORAGE_PROVIDER=gcs`.
- Production model access uses Vertex AI and attached Google identities.
- Long-lived service-account JSON keys must not be stored in GitHub, images, or
  Kubernetes manifests.
- Cloud SQL and Cloud Storage remain outside the Kubernetes cluster.
- The worker preserves PostgreSQL leases, heartbeats, and retries in
  `data.processing_runs`. Claims use nonblocking transaction-scoped advisory
  locks keyed by `bookwise-command:<command UUID>`, not row locks on
  read-only `app.processing_commands`. Ordered keyset scanning skips busy
  candidates, and conditional run upserts enforce lease eligibility.
- Do not add automated test suites or CI test infrastructure.
- Preserve unrelated existing working-tree changes.
- Use project `bookwise-509408`, region `asia-southeast1`, cluster
  `bookwise-autopilot`, Artifact Registry repository `bookwise`, and namespace
  `bookwise`.

## Review Focus

- An empty worker queue must leave the worker alive and polling.
- Missing configuration must produce visible Pod startup errors.
- The API must generate GCS signed upload URLs with its runtime identity.
- API and worker must reach Cloud SQL without exposing PostgreSQL publicly.
- CI/CD must deploy the exact image digest produced by the same workflow run.

---

### Task 1: Define The GCP Deployment Workspace

**Files:**

- Create: `infrastructure/gcp/README.md`
- Create: `infrastructure/gcp/config.env.example`
- Create: `infrastructure/gcp/kubernetes/base/kustomization.yaml`
- Create: `infrastructure/gcp/kubernetes/overlays/production/kustomization.yaml`
- Create: `infrastructure/gcp/scripts/bootstrap-gcp.ps1`
- Create: `infrastructure/gcp/scripts/deploy.ps1`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: project `bookwise-509408`, region `asia-southeast1`, existing
  database migrations, and the approved GKE design.
- Produces: one documented infrastructure root and deterministic deployment
  entrypoints used locally and by GitHub Actions.

- [ ] **Step 1: Create the infrastructure directory contract**

Use this structure:

```text
infrastructure/gcp/
  README.md
  config.env.example
  kubernetes/
    base/
    overlays/
  scripts/
    bootstrap-gcp.ps1
    deploy.ps1
```

Keep database SQL under the existing `infrastructure/database/` directory.

- [ ] **Step 2: Define non-secret deployment variables**

Create `config.env.example` with:

```dotenv
GCP_PROJECT_ID=bookwise-509408
GCP_REGION=asia-southeast1
GKE_CLUSTER_NAME=bookwise-autopilot
GKE_NAMESPACE=bookwise
ARTIFACT_REGISTRY_REPOSITORY=bookwise
IMAGE_WEB=bookwise-web
IMAGE_API=bookwise-api
IMAGE_WORKER=bookwise-worker
GCS_BUCKET=bookwise-509408-storage
```

Do not put database passwords, Auth0 client secrets, or service-account keys in
this file.

- [ ] **Step 3: Add safe ignore rules**

Ignore local deployment values and rendered secret files:

```gitignore
infrastructure/gcp/.env
infrastructure/gcp/rendered/
infrastructure/gcp/secrets/
```

- [ ] **Step 4: Implement idempotent GCP bootstrap**

`bootstrap-gcp.ps1` must:

1. Require `gcloud` and `kubectl`.
2. Set the active project to `bookwise-509408`.
3. Enable Artifact Registry, GKE, Cloud SQL Admin, Cloud Storage, Vertex AI,
   Secret Manager, IAM Credentials, and Security Token Service APIs.
4. Create Artifact Registry repository `bookwise` if absent.
5. Create the GKE Autopilot cluster `bookwise-autopilot` if absent.
6. Fetch cluster credentials.
7. Create namespace `bookwise` if absent.
8. Create or verify the Google service accounts used by API, worker, and CI/CD.
9. Print the remaining one-time Cloud SQL and Secret Manager setup commands.

The script must never delete or recreate existing resources.

- [ ] **Step 5: Implement the deployment wrapper**

`deploy.ps1` must require an immutable image tag, fetch cluster credentials,
render the production Kustomize overlay, run `kubectl apply -k`, wait for web,
API, and worker rollouts, and print Pod/Service status.

- [ ] **Step 6: Validate scripts without creating resources**

Run the PowerShell parser against both scripts:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path infrastructure/gcp/scripts/bootstrap-gcp.ps1),
  [ref]$tokens,
  [ref]$errors
) | Out-Null
if ($errors.Count -gt 0) { $errors | Format-List; exit 1 }
```

Repeat for `deploy.ps1`.

- [ ] **Step 7: Commit the workspace scaffolding**

```powershell
git add infrastructure/gcp .gitignore
git commit -m "chore: add GCP deployment workspace"
```

### Task 2: Containerize The Web, API, And Worker

**Files:**

- Create: `apps/web/Dockerfile`
- Create: `services/api/Dockerfile`
- Create: `services/data/Dockerfile`
- Create: `.dockerignore`
- Modify: `services/data/src/bookwise_data/workers/bootstrap.py`

**Interfaces:**

- Consumes: existing package scripts, lockfiles, and runtime environment
  variables.
- Produces: three production images that emit logs to stdout/stderr.

- [ ] **Step 1: Define the web image**

Use a multi-stage Node image:

```text
dependencies: pnpm install --frozen-lockfile
builder:      pnpm --dir apps/web build
runtime:      pnpm --dir apps/web start
```

Pass public `NEXT_PUBLIC_*` variables during the Next.js build. Do not copy
the root `.env` into the image.

- [ ] **Step 2: Define the API image**

Use a multi-stage Node image:

```text
dependencies: pnpm install --frozen-lockfile
builder:      pnpm --dir services/api build
runtime:      node services/api/dist/main.js
```

Only runtime environment variables come from Kubernetes.

- [ ] **Step 3: Define the worker image**

Use a Python 3.12 image with uv and the locked `services/data` environment:

```text
uv sync --project services/data --locked
python -m bookwise_data.workers.main
```

Do not copy local ADC files, `.env`, `.venv`, caches, or test artifacts.

- [ ] **Step 4: Convert the worker into a long-running process**

Add `PROCESSING_POLL_INTERVAL_SECONDS` with a positive default. Change worker
bootstrap behavior to repeatedly call `run_once(batch_limit)`, sleep when the
returned count is zero, and stop cleanly on SIGTERM. Do not change command
claiming, heartbeat, or state-transition logic.

- [ ] **Step 5: Add container ignore rules**

Exclude:

```text
.env
.venv
node_modules
.next
dist
__pycache__
.git
.pytest_cache
.ruff_cache
```

- [ ] **Step 6: Build all images locally**

Run:

```powershell
docker build -f apps/web/Dockerfile -t bookwise-web:local .
docker build -f services/api/Dockerfile -t bookwise-api:local .
docker build -f services/data/Dockerfile -t bookwise-worker:local .
```

Start each image with the required local environment and verify that the web
and API listen on their configured ports and that the worker remains alive
when the command queue is empty.

- [ ] **Step 7: Commit the containerization slice**

```powershell
git add apps/web/Dockerfile services/api/Dockerfile services/data/Dockerfile `
  .dockerignore services/data/src/bookwise_data/workers/bootstrap.py
git commit -m "feat: add production service containers"
```

### Task 3: Add Kubernetes Base Resources

**Files:**

- Create: `infrastructure/gcp/kubernetes/base/namespace.yaml`
- Create: `infrastructure/gcp/kubernetes/base/service-accounts.yaml`
- Create: `infrastructure/gcp/kubernetes/base/configmap.yaml`
- Create: `infrastructure/gcp/kubernetes/base/web-deployment.yaml`
- Create: `infrastructure/gcp/kubernetes/base/api-deployment.yaml`
- Create: `infrastructure/gcp/kubernetes/base/api-backend-config.yaml`
- Create: `infrastructure/gcp/kubernetes/base/worker-deployment.yaml`
- Create: `infrastructure/gcp/kubernetes/base/services.yaml`
- Create: `infrastructure/gcp/kubernetes/base/migration-job.yaml`

**Interfaces:**

- Consumes: image names from Task 2 and runtime values from Secret Manager.
- Produces: renderable Kubernetes resources for one web, API, worker, and
  migration Job.

- [ ] **Step 1: Define namespace and Kubernetes identities**

Create namespace `bookwise` and Kubernetes service accounts:

```text
bookwise-web
bookwise-api
bookwise-worker
bookwise-migrator
```

Annotate them with the Google service account identities created by the GCP
bootstrap script. Do not include private keys.

- [ ] **Step 2: Define non-secret ConfigMap values**

Include:

```dotenv
OBJECT_STORAGE_PROVIDER=gcs
GCS_BUCKET=bookwise-509408-storage
GOOGLE_CLOUD_PROJECT=bookwise-509408
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=true
BOOKWISE_MODEL_PROVIDER=vertex
BOOKWISE_SUMMARY_MODEL=gemini-2.5-flash
BOOKWISE_EMBEDDING_MODEL=gemini-embedding-001
BOOKWISE_EMBEDDING_DIMENSIONS=768
PROCESSING_BATCH_LIMIT=1
PROCESSING_POLL_INTERVAL_SECONDS=2
```

- [ ] **Step 3: Define Secret Manager-backed values**

Reference Kubernetes Secret keys for:

```text
APP_DATABASE_URL
DATA_DATABASE_URL
OIDC_ISSUER
OIDC_AUDIENCE
S3_PRESIGNED_URL_EXPIRY_SECONDS
```

Use a documented `kubectl create secret` or Secret Manager synchronization
procedure. No secret values belong in the repository.

- [ ] **Step 4: Define web, API, and worker Deployments**

Each Deployment must include:

```yaml
replicas: 1
terminationGracePeriodSeconds: 60
resources:
  requests:
    cpu: 250m
    memory: 512Mi
```

Use separate resource values when the worker requires more memory for parsing.
Add health checks that match the actual application behavior. The API exposes
an unauthenticated `GET /v1/health` returning `{"status":"ok"}`; use it for
HTTP readiness and liveness probes. This endpoint checks HTTP process
availability, not database or managed-service readiness.

- [ ] **Step 5: Define Services**

Create:

```text
bookwise-web: ClusterIP, port 3000
bookwise-api: ClusterIP, port 3001
```

Do not expose the worker through a public Service.

Include `api-backend-config.yaml` in the base Kustomization. Its
`bookwise-api-health` BackendConfig checks HTTP `/v1/health` on port `3001`.
Annotate the API Service with
`cloud.google.com/backend-config: '{"ports":{"http":"bookwise-api-health"}}'`
so the GKE load balancer uses the same endpoint.

- [ ] **Step 6: Define the migration Job**

The migration Job must use the worker or a dedicated migration image with the
existing `infrastructure/database/migrate.ps1` logic represented in a Linux
container command. It must run before API and worker rollout and must be safe
to rerun because the migration ledger already exists.

- [ ] **Step 7: Render and validate resources**

Run:

```powershell
kubectl kustomize infrastructure/gcp/kubernetes/overlays/production
kubectl apply --dry-run=client -k infrastructure/gcp/kubernetes/overlays/production
```

- [ ] **Step 8: Commit the Kubernetes resource slice**

```powershell
git add infrastructure/gcp/kubernetes
git commit -m "feat: add GKE workload manifests"
```

### Task 4: Add GKE Public Entry And Runtime Security

**Files:**

- Create: `infrastructure/gcp/kubernetes/base/ingress.yaml`
- Create: `infrastructure/gcp/kubernetes/base/network-policy.yaml`
- Modify: `infrastructure/gcp/kubernetes/overlays/production/kustomization.yaml`
- Modify: `infrastructure/gcp/README.md`

**Interfaces:**

- Consumes: web and API Services from Task 3.
- Produces: temporary external access and documented migration to DNS/TLS.

- [ ] **Step 1: Define initial external routing**

Create an Ingress or Gateway resource that routes to web and API Services. Use
configuration that allows the first deployment to work with the provisioned
external address before a custom domain is available.

- [ ] **Step 2: Define future hostname routing**

Document the intended hostnames:

```text
app.example.com -> bookwise-web
api.example.com -> bookwise-api
```

Keep hostnames as overlay configuration rather than embedding them in base
manifests.

- [ ] **Step 3: Restrict Pod traffic**

Add a NetworkPolicy that allows:

- Ingress to web from the GKE entry point.
- Ingress to API from the GKE entry point and web as required.
- Worker egress to Cloud SQL, GCS, Vertex AI, and DNS.
- API egress to Cloud SQL, GCS, Auth0, and DNS.

Do not block required managed-service traffic before the first cluster
verification.

- [ ] **Step 4: Render the entry-point resources**

Run:

```powershell
kubectl kustomize infrastructure/gcp/kubernetes/overlays/production
kubectl apply --dry-run=client -k infrastructure/gcp/kubernetes/overlays/production
```

- [ ] **Step 5: Commit the entry-point slice**

```powershell
git add infrastructure/gcp/kubernetes infrastructure/gcp/README.md
git commit -m "feat: add GKE public routing"
```

### Task 5: Configure Cloud SQL, GCS, IAM, And Secrets

**Files:**

- Create: `infrastructure/gcp/scripts/configure-services.ps1`
- Create: `infrastructure/gcp/secrets/README.md`
- Modify: `infrastructure/gcp/README.md`

**Interfaces:**

- Consumes: GCP project and bucket identifiers from Task 1.
- Produces: documented one-time commands and service identities consumed by
  Kubernetes resources and GitHub Actions.

- [ ] **Step 1: Configure Cloud SQL**

Document creation of a PostgreSQL instance in `asia-southeast1` with:

- pgvector enabled.
- Database `bookwise_next`.
- Application and data roles matching the migration scripts.
- Private or controlled connectivity from GKE.
- Automated backups enabled.

Do not put passwords in the script source. Accept them as interactive input or
read them from Secret Manager.

- [ ] **Step 2: Configure GCS IAM**

Grant the API identity permission to create signed upload URLs and inspect
objects. Grant the worker identity permission to read originals and write
normalized artifacts in `bookwise-509408-storage`.

- [ ] **Step 3: Configure Vertex IAM**

Grant the worker identity Vertex AI User access in project `bookwise-509408`.

- [ ] **Step 4: Configure Workload Identity**

Bind each Kubernetes service account to its Google service account with the
minimum required roles. Document the exact `gcloud iam service-accounts add-iam-policy-binding`
and Kubernetes annotation commands.

- [ ] **Step 5: Create Secret Manager entries**

Use names:

```text
bookwise-app-database-url
bookwise-data-database-url
bookwise-oidc-issuer
bookwise-oidc-audience
bookwise-s3-presigned-url-expiry
```

Grant only the API, worker, or migration identity that needs each secret.

- [ ] **Step 6: Verify managed-service access**

Run a short-lived diagnostic Pod using the worker identity to verify:

```text
Cloud SQL connection
GCS list/head/read/write
Vertex AI provider initialization
Secret Manager access
```

Delete the diagnostic Pod after verification.

- [ ] **Step 7: Commit the service configuration documentation**

```powershell
git add infrastructure/gcp/scripts/configure-services.ps1 `
  infrastructure/gcp/secrets/README.md infrastructure/gcp/README.md
git commit -m "docs: define GCP runtime services and IAM"
```

### Task 6: Add GitHub Actions CI/CD

**Files:**

- Create: `.github/workflows/deploy-gcp.yml`
- Modify: `.github/workflows/ci.yml` only if shared build steps are extracted
- Modify: `infrastructure/gcp/README.md`

**Interfaces:**

- Consumes: Dockerfiles, Artifact Registry, GKE cluster, Workload Identity
  Federation, and Kustomize overlay from earlier tasks.
- Produces: build, publish, migrate, and deploy workflow on pushes to
  `master`, plus manual dispatch.

- [ ] **Step 1: Define GitHub OIDC federation inputs**

Document repository variables:

```text
GCP_PROJECT_ID
GCP_REGION
GKE_CLUSTER_NAME
GKE_NAMESPACE
ARTIFACT_REGISTRY_REPOSITORY
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOYER_SERVICE_ACCOUNT
```

The workflow must use `google-github-actions/auth` with Workload Identity
Federation. Do not use `GCP_CREDENTIALS`, service-account JSON, or base64 key
secrets.

- [ ] **Step 2: Build and publish images**

The workflow must:

1. Check out the exact commit.
2. Install pnpm and uv.
3. Run existing lint, build, format, lock, and compile checks.
4. Authenticate to Google Cloud through OIDC.
5. Authenticate Docker to Artifact Registry.
6. Build web, API, and worker images.
7. Push immutable images tagged with `${{ github.sha }}`.
8. Record image digests as workflow outputs.

- [ ] **Step 3: Run the migration**

Use a Kubernetes Job or the documented migration image to run migrations before
rollout. Wait for Job completion and fail the workflow if the Job fails.

- [ ] **Step 4: Deploy immutable images**

Fetch GKE credentials, set the Kustomize image tags to `${{ github.sha }}`,
apply the overlay, and wait for:

```text
deployment/bookwise-web
deployment/bookwise-api
deployment/bookwise-worker
```

to become available.

- [ ] **Step 5: Publish workflow summaries**

Print:

- Commit SHA.
- Image references and digests.
- Cluster and namespace.
- Pod status.
- Service and Ingress addresses.
- Migration Job result.

- [ ] **Step 6: Add workflow concurrency**

Cancel an older deployment when a newer `master` deployment starts, while
allowing the verification workflow to continue independently.

- [ ] **Step 7: Validate workflow syntax**

Run the existing repository checks and validate YAML parsing locally. Use
GitHub Actions `workflow_dispatch` for the first remote run before relying on
push-triggered deployment.

- [ ] **Step 8: Commit the CI/CD slice**

```powershell
git add .github/workflows/deploy-gcp.yml infrastructure/gcp/README.md
git commit -m "ci: deploy Bookwise to GKE"
```

### Task 7: Write The Deployment And Operations Guide

**Files:**

- Modify: `README.md`
- Modify: `infrastructure/gcp/README.md`
- Create: `infrastructure/gcp/runbook.md`

**Interfaces:**

- Consumes: all resource names, variables, IAM bindings, and workflow commands
  created by Tasks 1 through 6.
- Produces: one reproducible operator guide for initial deployment, logs,
  migrations, rollback, and cleanup.

- [ ] **Step 1: Document prerequisites**

Document Google Cloud CLI, kubectl, Docker, GitHub repository permissions,
Auth0 configuration, and the required GCP project.

- [ ] **Step 2: Document first deployment**

Document:

```powershell
gcloud auth login
gcloud config set project bookwise-509408
pwsh infrastructure/gcp/scripts/bootstrap-gcp.ps1
```

Then document Secret Manager setup, GitHub variable setup, and the first
manual workflow dispatch.

- [ ] **Step 3: Document operations**

Include commands for:

```powershell
kubectl get pods -n bookwise
kubectl logs -n bookwise deployment/bookwise-api -f
kubectl logs -n bookwise deployment/bookwise-web -f
kubectl logs -n bookwise deployment/bookwise-worker -f
kubectl get ingress -n bookwise
kubectl get jobs -n bookwise
```

- [ ] **Step 4: Document rollback**

Use the previous immutable image SHA with:

```powershell
pwsh infrastructure/gcp/scripts/deploy.ps1 -ImageTag PREVIOUS_COMMIT_SHA
```

Document that database migrations are forward-only and must not be rolled back
by deleting migration records.

- [ ] **Step 5: Document cleanup**

Document how to scale workloads to zero, delete the cluster, and preserve or
delete Cloud SQL and GCS data separately. Make destructive commands explicit.

- [ ] **Step 6: Commit documentation**

```powershell
git add README.md infrastructure/gcp
git commit -m "docs: add GKE deployment runbook"
```

### Task 8: Verify The Deployment Path

**Files:**

- No new automated test files.
- Modify only deployment files if verification finds a concrete defect.

**Interfaces:**

- Consumes: final images, GCP resources, Kubernetes manifests, and GitHub
  workflow.
- Produces: evidence that the initial one-Pod deployment works.

- [ ] **Step 1: Run repository verification**

```powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
uv sync --project services/data --locked
uv run --project services/data ruff check services/data
uv run --project services/data python -m compileall -q services/data/src
docker compose config
git diff --check
```

- [ ] **Step 2: Verify image startup**

Start each image locally with safe development configuration. Confirm:

- Web serves a page.
- API binds to port 3001.
- Worker remains alive with an empty queue.
- No image contains `.env` or local credentials.

- [ ] **Step 3: Verify Kubernetes rendering**

```powershell
kubectl kustomize infrastructure/gcp/kubernetes/overlays/production
kubectl apply --dry-run=client -k infrastructure/gcp/kubernetes/overlays/production
```

- [ ] **Step 4: Verify the remote rollout**

After GitHub Actions deploys:

```powershell
kubectl get pods -n bookwise -o wide
kubectl rollout status deployment/bookwise-web -n bookwise
kubectl rollout status deployment/bookwise-api -n bookwise
kubectl rollout status deployment/bookwise-worker -n bookwise
```

- [ ] **Step 5: Verify one complete book workflow**

Upload one supported book through the web app, finalize it, confirm that the
worker claims ingestion, confirm the normalized source becomes available,
confirm summary generation reaches Vertex AI, and verify the accepted summary
and citations are visible through the API and web app.

- [ ] **Step 6: Record residual limitations**

Report the initial one-Pod availability limitation, Cloud SQL sizing, missing
custom domain if applicable, and any remaining manual secret setup. Do not
claim production readiness beyond the verified scope.

## Plan Self-Review

- **Spec coverage:** Tasks 1-2 cover workspace and containers; Task 3 covers
  workloads and migration; Task 4 covers public routing; Task 5 covers managed
  services and IAM; Task 6 covers GitHub Actions; Task 7 covers operations;
  Task 8 covers verification.
- **Placeholder scan:** No `TODO`, `TBD`, or unresolved implementation
  placeholder is required. User-specific secrets are named as Secret Manager
  inputs rather than invented values.
- **Type consistency:** Image names, cluster name, namespace, region, bucket,
  Kubernetes service-account names, and Secret Manager names are consistent
  across tasks.
- **Testing constraint:** No new automated tests, fixtures, or test
  dependencies are planned. Existing checks and explicit deployment smoke
  verification are used instead.

