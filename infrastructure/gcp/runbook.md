# Bookwise GKE Runbook

This runbook covers the first deployment of Bookwise to GKE Autopilot in
`bookwise-509408`. The initial target is one Pod each for the web, API, and
worker workloads.

## First Deployment

Authenticate locally and select the project:

```powershell
gcloud auth login
gcloud config set project bookwise-509408
```

Bootstrap Artifact Registry, the Autopilot cluster, the namespace, and runtime
service accounts:

```powershell
pwsh infrastructure/gcp/scripts/bootstrap-gcp.ps1
pwsh infrastructure/gcp/scripts/configure-services.ps1
```

Create the Cloud SQL instance and database if they do not exist. The expected
connection name is:

```text
bookwise-509408:asia-southeast1:bookwise-postgres
```

Create the Secret Manager values described in
`infrastructure/gcp/secrets/README.md`. The database URLs must use
`127.0.0.1:5432` because the workloads connect through the Cloud SQL Auth
Proxy sidecar or migration proxy.

Add these GitHub repository variables under **Settings > Secrets and
variables > Actions > Variables**:

```text
GCP_PROJECT_ID
GCP_REGION
GKE_CLUSTER_NAME
GKE_NAMESPACE
ARTIFACT_REGISTRY_REPOSITORY
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_DEPLOYER_SERVICE_ACCOUNT
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_AUTH0_DOMAIN
NEXT_PUBLIC_AUTH0_CLIENT_ID
NEXT_PUBLIC_AUTH0_AUDIENCE
NEXT_PUBLIC_AUTH0_REDIRECT_URI
```

Start **Deploy to GKE** manually from the GitHub Actions page for the first
deployment. Later pushes to `master` start the same workflow automatically.

## Inspect The Deployment

```powershell
gcloud container clusters get-credentials bookwise-autopilot `
  --region=asia-southeast1 --project=bookwise-509408

kubectl get pods,services,ingress,jobs -n bookwise -o wide
kubectl rollout status deployment/bookwise-web -n bookwise
kubectl rollout status deployment/bookwise-api -n bookwise
kubectl rollout status deployment/bookwise-worker -n bookwise
```

Follow logs in real time:

```powershell
kubectl logs -n bookwise deployment/bookwise-api -f
kubectl logs -n bookwise deployment/bookwise-web -f
kubectl logs -n bookwise deployment/bookwise-worker -f
kubectl logs -n bookwise job/bookwise-migrate
```

If a Pod is restarting or stuck:

```powershell
kubectl describe pod -n bookwise -l app.kubernetes.io/name=bookwise-api
kubectl get events -n bookwise --sort-by=.lastTimestamp
```

## Rollback

Use a previously published commit SHA. The deployment script deletes and
recreates the migration Job, then waits for all three rollouts:

```powershell
pwsh infrastructure/gcp/scripts/deploy.ps1 `
  -ImageTag PREVIOUS_COMMIT_SHA
```

Database migrations are forward-only. Do not delete rows from
`public.schema_migrations` to force a rollback. If a schema change needs
reversal, ship a new forward migration.

## Cleanup

Scaling application workloads to zero preserves the cluster and managed data:

```powershell
kubectl scale deployment --all --replicas=0 -n bookwise
```

Deleting the cluster is destructive to Kubernetes resources but does not
delete Cloud SQL or Cloud Storage:

```powershell
gcloud container clusters delete bookwise-autopilot `
  --region=asia-southeast1 --project=bookwise-509408
```

Review Cloud SQL and the `bookwise-509408-storage` bucket separately before
deleting either. Their data is not recoverable after deletion unless backups
or versioning were configured.
