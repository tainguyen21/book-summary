# Bookwise GKE Runbook

This runbook covers the first deployment of Bookwise to GKE Autopilot in
`bookwise-509408`. The initial target is one Pod each for the web, API, and
worker workloads at `https://tai-dev-web.cloud`.

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

After creating the private `bookwise-509408-storage` bucket, apply its browser
upload CORS policy from the repository root:

```powershell
gcloud storage buckets update gs://bookwise-509408-storage `
  --cors-file=infrastructure/gcp/storage-cors.json `
  --project=bookwise-509408
```

This is a separate setup step, not part of the deployment workflow. Reapply
it after changing the allowed web origin in `storage-cors.json`; do not use
a wildcard origin or make the bucket public to troubleshoot uploads.

Reserve a global external IPv4 address named `bookwise-ip`. At the DNS
provider for `tai-dev-web.cloud`, create a root `A` record that points to the
reserved address:

```text
Record type: A
Host/name:   @
Value:       35.201.95.210
TTL:         300
```

Do this before the first deployment so the GKE managed certificate can
validate the domain.

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

Use these public URL values:

```text
NEXT_PUBLIC_API_URL=https://tai-dev-web.cloud
NEXT_PUBLIC_AUTH0_DOMAIN=dev-p8c5tpe1ghv8qtxf.us.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=AUTH0_SPA_CLIENT_ID
NEXT_PUBLIC_AUTH0_AUDIENCE=https://api.bookwise.local
NEXT_PUBLIC_AUTH0_REDIRECT_URI=https://tai-dev-web.cloud
```

In Auth0, configure `https://tai-dev-web.cloud` as an allowed callback URL,
logout URL, and web origin. Configure the Auth0 API identifier as
`https://api.bookwise.local`. This identifier does not need to resolve in DNS.
It must exactly match the GitHub `NEXT_PUBLIC_AUTH0_AUDIENCE` variable and
Secret Manager `bookwise-oidc-audience`; the public API and callback URLs
remain `https://tai-dev-web.cloud`.

Before starting the workflow, verify:

```text
DNS root A record       -> 35.201.95.210
Auth0 callback URL      -> https://tai-dev-web.cloud
Auth0 logout URL        -> https://tai-dev-web.cloud
Auth0 web origin        -> https://tai-dev-web.cloud
Auth0 API identifier    -> https://api.bookwise.local
GitHub API URL          -> https://tai-dev-web.cloud
GitHub redirect URI     -> https://tai-dev-web.cloud
GitHub Auth0 audience   -> https://api.bookwise.local
Secret OIDC audience    -> https://api.bookwise.local
```

Start **Deploy to GKE** manually from the GitHub Actions page for the first
deployment. Later pushes to `master` start the same workflow automatically.

## Inspect The Deployment

```powershell
gcloud container clusters get-credentials bookwise-autopilot `
  --region=asia-southeast1 --project=bookwise-509408

kubectl get pods,services,ingress,jobs -n bookwise -o wide
kubectl describe managedcertificate bookwise-certificate -n bookwise
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

## Verify Browser Uploads

Inspect the current bucket policy:

```powershell
gcloud storage buckets describe gs://bookwise-509408-storage `
  --project=bookwise-509408 --format="json(cors_config)"
```

Verify the browser preflight without creating or uploading an object:

```powershell
$response = Invoke-WebRequest `
  "https://storage.googleapis.com/bookwise-509408-storage/cors-check" `
  -Method Options `
  -Headers @{
    Origin = "https://tai-dev-web.cloud"
    "Access-Control-Request-Method" = "PUT"
    "Access-Control-Request-Headers" = "content-type"
  }
$response.StatusCode
$response.Headers["Access-Control-Allow-Origin"]
$response.Headers["Access-Control-Allow-Methods"]
$response.Headers["Access-Control-Allow-Headers"]
```

Expect status 200, allow-origin `https://tai-dev-web.cloud`, allow-methods
containing `PUT`, and allow-headers containing `Content-Type`. Status 200
alone does not prove CORS is configured: missing allow headers still block
the browser upload.

In the app, start a fresh upload and inspect the browser Network panel:
`POST /v1/books/uploads` creates a ticket, the signed Cloud Storage `PUT`
uploads the bytes, and `POST /v1/books/:bookId/uploads/finalize` queues
processing. A successful storage PUT alone does not confirm processing.

If the app reports "The file could not upload. Retry before the link expires.":

- Missing CORS allow headers: apply the policy above and retry.
- Storage PUT returns 403: inspect its response for an expired URL, a signed
  content-type mismatch, or a permission error. Send the ticket's exact
  content type; check the API service account's storage and signing roles.
- Expired upload ticket: close the dialog and start a new upload for a fresh
  signed URL. The production expiry is 600 seconds.
- Session or ticket API returns 401: check the Auth0 audience alignment above;
  bucket CORS cannot fix API authentication.

If the book detail page shows "Upload incomplete. Processing has not started",
its API status is `pending_upload`, not an active worker job. Return to the
library and start a fresh upload; the page stops automatic polling for that
entry. A missing original object and no processing command indicate that the
upload was never finalized, so waiting or restarting the worker cannot
complete it.

For upload diagnostics, inspect the browser Console for `Bookwise upload failed`.
The warning includes the stage (`creating`, `uploading`, or `finalizing`),
book ID when available, storage HTTP status when available, a fixed reason
code, `storageUploaded`, and `canReuseTicket`. Status 0 means a network or
CORS failure that the browser could not distinguish. These diagnostics do
not appear in Kubernetes API or worker logs and deliberately omit tokens,
signed URLs, filenames, file contents, and raw errors.

Do not include bearer tokens or full signed URLs in shared logs or screenshots.

## Budget Alert

A monthly Cloud Billing budget emails the billing account's admins when
actual project spend reaches 50%, 90%, and 100% of the amount. Billing is the
source of truth for all spend (GKE, Cloud SQL, storage, Vertex AI).

Required role on the project's billing account: Billing Account Administrator
or Billing Account Costs Manager. Run the script yourself with that login; it
is never run from CI:

```powershell
gcloud auth login
pwsh infrastructure/gcp/scripts/create-budget-alert.ps1 -MonthlyAmountUsd 10
```

The script enables `billingbudgets.googleapis.com`, then creates the
`bookwise-monthly` budget scoped to `bookwise-509408`. Running it again with
the same `-DisplayName` changes nothing. The amount is in USD; if the billing
account uses another currency, gcloud rejects the request rather than
creating a budget in the wrong currency.

Verify in the Console under Billing > Budgets & alerts, or with:

```powershell
gcloud billing budgets list --billing-account=BILLING_ACCOUNT_ID `
  --filter="displayName=bookwise-monthly"
```

To change the amount, edit the budget in the Console. Re-running the script
does not update an existing budget.

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
