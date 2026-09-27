# Bookwise GCP Deployment

This directory contains the deployable GCP and Kubernetes configuration for
Bookwise. Local development remains driven by the root Docker Compose setup.
The operator procedure for first deployment, rollback, and cleanup is in
[`runbook.md`](runbook.md).

The initial production target is:

```text
GKE Autopilot cluster: bookwise-autopilot
Region:                asia-southeast1
Namespace:             bookwise
Artifact Registry:     asia-southeast1-docker.pkg.dev/bookwise-509408/bookwise
Cloud Storage bucket:  gs://bookwise-509408-storage
```

## Prerequisites

- Google Cloud CLI authenticated to `bookwise-509408`.
- `kubectl` installed.
- Docker installed.
- A Cloud SQL PostgreSQL instance and database configured separately.
- Auth0 production values available.
- GitHub OIDC federation configured for deployment automation.

Copy the non-secret settings for local scripts:

```powershell
Copy-Item infrastructure/gcp/config.env.example infrastructure/gcp/.env
```

Do not commit `infrastructure/gcp/.env`, rendered manifests, or credential
files.

## Bootstrap

The bootstrap script is idempotent and creates or verifies the Artifact
Registry repository, GKE Autopilot cluster, namespace, and workload service
accounts:

```powershell
pwsh infrastructure/gcp/scripts/bootstrap-gcp.ps1
```

Create the Cloud SQL instance before the first deployment. This is a small
starting shape for the initial one-Pod environment; choose the database name,
region, and password policy to match your organization:

```powershell
gcloud sql instances create bookwise-postgres `
  --database-version=POSTGRES_16 `
  --cpu=1 `
  --memory=3840MiB `
  --region=asia-southeast1 `
  --availability-type=zonal `
  --storage-type=SSD `
  --storage-size=20 `
  --project=bookwise-509408
gcloud sql databases create bookwise_next `
  --instance=bookwise-postgres `
  --project=bookwise-509408
```

The Kubernetes configuration uses the Cloud SQL connection name
`bookwise-509408:asia-southeast1:bookwise-postgres`. If you choose a different
instance name, update `CLOUD_SQL_INSTANCE` in
`kubernetes/base/configmap.yaml`.

Configure workload identities and the GitHub OIDC provider after bootstrap:

```powershell
pwsh infrastructure/gcp/scripts/configure-services.ps1
```

The script prints the exact GitHub repository variables to create. Add them
under **Settings > Secrets and variables > Actions > Variables** in
`tainguyen21/book-summary`. The workflow also expects the public Auth0
variables listed below.

## Build And Deploy

Build and push immutable images using a commit SHA:

```powershell
$tag = (git rev-parse HEAD)
docker build -f apps/web/Dockerfile -t "asia-southeast1-docker.pkg.dev/bookwise-509408/bookwise/bookwise-web:$tag" .
docker build -f services/api/Dockerfile -t "asia-southeast1-docker.pkg.dev/bookwise-509408/bookwise/bookwise-api:$tag" .
docker build -f services/data/Dockerfile -t "asia-southeast1-docker.pkg.dev/bookwise-509408/bookwise/bookwise-worker:$tag" .
docker push "asia-southeast1-docker.pkg.dev/bookwise-509408/bookwise/bookwise-web:$tag"
docker push "asia-southeast1-docker.pkg.dev/bookwise-509408/bookwise/bookwise-api:$tag"
docker push "asia-southeast1-docker.pkg.dev/bookwise-509408/bookwise/bookwise-worker:$tag"
docker build -f services/data/Dockerfile.migrations -t "asia-southeast1-docker.pkg.dev/bookwise-509408/bookwise/bookwise-migrator:$tag" .
docker push "asia-southeast1-docker.pkg.dev/bookwise-509408/bookwise/bookwise-migrator:$tag"
pwsh infrastructure/gcp/scripts/deploy.ps1 -ImageTag $tag
```

The GitHub Actions workflow performs this same process without a long-lived
Google service-account key.

## Required Production Secrets

Create these Kubernetes Secret keys from Secret Manager or an approved secret
sync mechanism before deployment:

```text
APP_DATABASE_URL
DATA_DATABASE_URL
OIDC_ISSUER
OIDC_AUDIENCE
S3_PRESIGNED_URL_EXPIRY_SECONDS
NEXT_PUBLIC_AUTH0_DOMAIN
NEXT_PUBLIC_AUTH0_CLIENT_ID
NEXT_PUBLIC_AUTH0_AUDIENCE
NEXT_PUBLIC_AUTH0_REDIRECT_URI
NEXT_PUBLIC_API_URL
```

The API and worker use native GCS and Vertex AI through Workload Identity:

```text
OBJECT_STORAGE_PROVIDER=gcs
GCS_BUCKET=bookwise-509408-storage
BOOKWISE_MODEL_PROVIDER=vertex
```

The GitHub Actions workflow reads the server-side values from Secret Manager.
Create the required secrets once:

```powershell
gcloud secrets create bookwise-app-database-url --data-file=-
gcloud secrets create bookwise-data-database-url --data-file=-
gcloud secrets create bookwise-migration-database-url --data-file=-
gcloud secrets create bookwise-oidc-issuer --data-file=-
gcloud secrets create bookwise-oidc-audience --data-file=-
gcloud secrets create bookwise-s3-presigned-url-expiry --data-file=-
```

When prompted by `gcloud`, paste one value and finish with `Ctrl+Z` then
`Enter` in PowerShell. The three database URLs must use
`127.0.0.1:5432`, because the API, worker, and migration Job connect through
their Cloud SQL Auth Proxy:

```text
postgresql://APP_USER:PASSWORD@127.0.0.1:5432/bookwise_next
postgresql+psycopg://DATA_USER:PASSWORD@127.0.0.1:5432/bookwise_next
postgresql://MIGRATION_USER:PASSWORD@127.0.0.1:5432/bookwise_next
```

The public GitHub repository variables are:

```text
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.us.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=your-auth0-client-id
NEXT_PUBLIC_AUTH0_AUDIENCE=https://api.example.com
NEXT_PUBLIC_AUTH0_REDIRECT_URI=https://app.example.com
```

Replace the example hostnames with the actual GKE ingress address or domain
before deploying the public web application.

## Operations

```powershell
kubectl get pods -n bookwise
kubectl logs -n bookwise deployment/bookwise-api -f
kubectl logs -n bookwise deployment/bookwise-web -f
kubectl logs -n bookwise deployment/bookwise-worker -f
kubectl get ingress -n bookwise
kubectl get jobs -n bookwise
kubectl describe pod -n bookwise -l app.kubernetes.io/name=bookwise-worker
```

The CI/CD workflow deploys on pushes to `master` and can also be started
manually from GitHub Actions. It builds each image, pushes it to Artifact
Registry, resolves the pushed immutable digests, runs the migration Job, and
waits for all three deployments to roll out.
