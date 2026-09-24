# Bookwise GKE Autopilot Deployment Design

**Date:** September 24, 2026

## Goal

Prepare Bookwise for an initial public deployment on Google Cloud using one
GKE Autopilot cluster with one Pod for each application workload:

- `bookwise-web`
- `bookwise-api`
- `bookwise-worker`

The deployment keeps durable application state in managed Google Cloud
services and keeps Kubernetes focused on running application processes.

## Scope

This design covers:

- Container images for the web, API, and Python worker.
- GKE Autopilot cluster and workload resources.
- Cloud SQL PostgreSQL as the production database.
- Google Cloud Storage as production object storage.
- Vertex AI as the model provider.
- Secret Manager and Workload Identity configuration.
- GKE networking and initial public access.
- Database migration and deployment order.
- Initial one-Pod cost boundary.

This design does not cover:

- Production custom-domain ownership or DNS changes.
- Multi-region deployment.
- High-availability database architecture.
- Horizontal autoscaling in the initial release.
- Replacing Auth0 with Google Identity Platform.
- Running PostgreSQL, Redis, or MinIO inside GKE.

## Runtime Architecture

```text
Internet
  |
  v
GKE external entry point
  |
  +-- bookwise-web Service
  |     |
  |     +-- bookwise-web Deployment, 1 Pod
  |
  +-- bookwise-api Service
        |
        +-- bookwise-api Deployment, 1 Pod

bookwise-worker Deployment, 1 Pod
  |
  +-- Cloud SQL PostgreSQL
  +-- Cloud Storage
  +-- Vertex AI

All workloads
  |
  +-- Secret Manager through Workload Identity
```

The web, API, and worker are long-running container processes. The web and API
are exposed through Kubernetes Services. The worker is internal and does not
receive public traffic.

## Managed Services

### Cloud SQL

Cloud SQL for PostgreSQL is the production database. It replaces the local
`pgvector/pgvector` container while preserving the existing schemas and
migrations.

The implementation will:

- Use the existing migration files.
- Run migrations as an explicit deployment step or Kubernetes Job.
- Configure separate application and data database URLs as required by the
  existing role model.
- Use private or controlled network access from GKE.
- Keep PostgreSQL credentials out of container images and Git.

### Cloud Storage

The native `GcsObjectStorage` adapters remain the production storage path.

Production configuration:

```dotenv
OBJECT_STORAGE_PROVIDER=gcs
GCS_BUCKET=bookwise-509408-storage
GOOGLE_CLOUD_PROJECT=bookwise-509408
```

The API generates signed upload URLs. The Python worker reads originals and
writes normalized immutable artifacts using its attached Google service
identity.

Local development continues to use MinIO through:

```dotenv
OBJECT_STORAGE_PROVIDER=minio
```

### Vertex AI

The worker uses Vertex AI through its attached Google service identity:

```dotenv
BOOKWISE_MODEL_PROVIDER=vertex
BOOKWISE_SUMMARY_MODEL=gemini-2.5-flash
BOOKWISE_EMBEDDING_MODEL=gemini-embedding-001
BOOKWISE_EMBEDDING_DIMENSIONS=768
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=true
```

No model API key is stored in Kubernetes.

### Secret Manager

Secret Manager stores values that should not be embedded in Kubernetes
manifests or container images, including:

- Cloud SQL connection credentials or connection URL.
- Auth0 issuer and audience values used by the API.
- Any future server-only secrets.

Public web configuration such as the Auth0 SPA domain, client ID, audience,
redirect URL, and API URL may be supplied as web deployment configuration.

## Workloads

### Web Deployment

The web container runs the existing Next.js production server.

Initial settings:

```text
replicas: 1
service: ClusterIP
public access: through GKE entry point
```

The container receives:

```dotenv
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_AUTH0_DOMAIN
NEXT_PUBLIC_AUTH0_CLIENT_ID
NEXT_PUBLIC_AUTH0_AUDIENCE
NEXT_PUBLIC_AUTH0_REDIRECT_URI
```

### API Deployment

The API container runs the existing NestJS production server.

Initial settings:

```text
replicas: 1
service: ClusterIP
port: 3001
```

The API receives:

```dotenv
PORT=3001
APP_DATABASE_URL
OIDC_ISSUER
OIDC_AUDIENCE
OBJECT_STORAGE_PROVIDER=gcs
GCS_BUCKET
GOOGLE_CLOUD_PROJECT
S3_PRESIGNED_URL_EXPIRY_SECONDS
```

The API remains responsible for app-schema writes and command creation. It
does not directly run book ingestion or summary generation.

### Worker Deployment

The worker becomes a long-running process instead of executing one batch and
exiting. Its loop will:

1. Claim available commands from PostgreSQL.
2. Process up to the configured batch limit.
3. Record completion or failure.
4. Sleep for a configurable interval when no command is available.
5. Repeat until the Pod receives a termination signal.

Initial settings:

```text
replicas: 1
public service: none
PROCESSING_BATCH_LIMIT: configurable
PROCESSING_POLL_INTERVAL_SECONDS: configurable
```

The existing lease, heartbeat, retryable failure, permanent failure, and
`FOR UPDATE SKIP LOCKED` behavior remain authoritative. This allows additional
worker replicas later without changing command ownership semantics.

The worker receives:

```dotenv
DATA_DATABASE_URL
OBJECT_STORAGE_PROVIDER=gcs
GCS_BUCKET
GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_LOCATION
GOOGLE_GENAI_USE_VERTEXAI=true
BOOKWISE_MODEL_PROVIDER=vertex
BOOKWISE_SUMMARY_MODEL
BOOKWISE_EMBEDDING_MODEL
BOOKWISE_EMBEDDING_DIMENSIONS
BOOKWISE_MODEL_TIMEOUT_SECONDS
BOOKWISE_MODEL_MAX_OUTPUT_TOKENS
BOOKWISE_GENERATION_CHUNK_CHARS
PROCESSING_BATCH_LIMIT
PROCESSING_POLL_INTERVAL_SECONDS
```

## Identity And Permissions

Each workload gets a dedicated Google service account or a deliberately
scoped shared runtime identity:

- Web: no Google Cloud permissions unless a future server-side feature needs
  them.
- API: Cloud Storage object access needed to create and validate upload URLs.
- Worker: Cloud Storage object access and Vertex AI User permission.
- Migration Job: Cloud SQL database access and migration credentials.

Kubernetes service accounts will use Workload Identity Federation for GKE.
Long-lived service-account JSON keys will not be stored in the repository,
container images, or Kubernetes YAML.

## Networking And Public Access

The initial deployment will use a GKE external entry point with separate
routing for web and API traffic. The implementation will support either:

- Separate hostnames such as `app.example.com` and `api.example.com`.
- A temporary external IP for the first verification deployment.

TLS and custom-domain resources will be kept configurable so the first
deployment does not require DNS ownership to validate the cluster.

Cloud SQL connectivity will use the supported GKE-to-Cloud-SQL path selected
during implementation. The database will not be exposed publicly.

## Containerization

The implementation will add production Dockerfiles for:

- `apps/web`
- `services/api`
- `services/data`

Images will be built for Artifact Registry and will:

- Use production-only runtime commands.
- Avoid copying `.env` or local credentials.
- Run as non-root where compatible.
- Emit logs to stdout and stderr.
- Expose only the ports required by the workload.

## Deployment Order

The deployment guide and scripts will follow this order:

1. Select the Google Cloud project and region.
2. Enable required Google Cloud APIs.
3. Create or verify Artifact Registry.
4. Create the GKE Autopilot cluster.
5. Create Cloud SQL PostgreSQL.
6. Configure the GCS bucket and IAM.
7. Configure service accounts and Workload Identity.
8. Store server configuration in Secret Manager.
9. Build and push container images.
10. Run database migrations.
11. Deploy API, web, and worker resources.
12. Create the external entry point.
13. Verify workload health, logs, GCS access, Vertex access, and book
    processing.

## Initial Cost Boundary

The initial deployment intentionally uses one Pod per workload:

```text
web: 1
api: 1
worker: 1
```

Horizontal Pod Autoscalers and multiple replicas are deferred. Resource
requests and limits will be explicit and conservative so Autopilot billing
does not grow from accidental defaults.

Cloud SQL machine size, storage size, backup retention, and GKE region are
deployment parameters. The initial guide will identify them explicitly
instead of silently selecting a production-sized database.

## Observability

The initial deployment will rely on container stdout/stderr and GKE/Cloud
Logging. The deployment guide will include commands for:

- Listing Pods and Services.
- Following web, API, and worker logs.
- Checking worker Pod status.
- Inspecting database migration output.
- Inspecting processing command status.

Application metrics and distributed tracing are deferred.

## Verification

Verification will cover existing checks plus deployment-focused checks where
possible without adding test infrastructure:

- Docker image builds.
- Kubernetes manifest rendering.
- GKE configuration validation.
- API and web container startup.
- Worker container startup and polling loop.
- Database migration execution.
- GCS signed upload and worker readback.
- Vertex AI provider access.
- End-to-end processing of one supported book after deployment.

No new automated test suites will be added unless explicitly requested.

## Documentation Impact

The current README documents local Docker/MinIO development and the local
Vertex provider. It will need a related deployment section covering GKE
Autopilot, Cloud SQL, GCS, Workload Identity, Secret Manager, image builds,
migrations, and rollback. That documentation update is part of the deployment
implementation because it describes the new operational workflow.
