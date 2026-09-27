param(
    [string]$ProjectId = "bookwise-509408",
    [string]$Region = "asia-southeast1",
    [string]$Namespace = "bookwise",
    [string]$GitHubRepository = "tainguyen21/book-summary",
    [string]$WorkloadIdentityPool = "github",
    [string]$WorkloadIdentityProvider = "bookwise"
)

$ErrorActionPreference = "Stop"

function Invoke-Gcloud {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & gcloud @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "gcloud command failed: gcloud $($Arguments -join ' ')"
    }
}

function Add-ProjectRole {
    param([string]$Member, [string]$Role)
    Invoke-Gcloud projects add-iam-policy-binding $ProjectId `
        "--member=$Member" "--role=$Role" --quiet
}

function Bind-KubernetesIdentity {
    param([string]$GoogleAccount, [string]$KubernetesAccount)
    Invoke-Gcloud iam service-accounts add-iam-policy-binding `
        "$GoogleAccount@$ProjectId.iam.gserviceaccount.com" `
        "--member=serviceAccount:$ProjectId.svc.id.goog[$Namespace/$KubernetesAccount]" `
        "--role=roles/iam.workloadIdentityUser" `
        "--project=$ProjectId" --quiet
}

$projectNumber = (
    & gcloud projects describe $ProjectId --format="value(projectNumber)"
).Trim()
if ($LASTEXITCODE -ne 0 -or -not $projectNumber) {
    throw "Could not resolve the project number."
}

Add-ProjectRole `
    "serviceAccount:bookwise-api@$ProjectId.iam.gserviceaccount.com" `
    "roles/cloudsql.client"
Add-ProjectRole `
    "serviceAccount:bookwise-api@$ProjectId.iam.gserviceaccount.com" `
    "roles/storage.objectAdmin"
Add-ProjectRole `
    "serviceAccount:bookwise-worker@$ProjectId.iam.gserviceaccount.com" `
    "roles/cloudsql.client"
Add-ProjectRole `
    "serviceAccount:bookwise-worker@$ProjectId.iam.gserviceaccount.com" `
    "roles/storage.objectAdmin"
Add-ProjectRole `
    "serviceAccount:bookwise-worker@$ProjectId.iam.gserviceaccount.com" `
    "roles/aiplatform.user"
Add-ProjectRole `
    "serviceAccount:bookwise-migrator@$ProjectId.iam.gserviceaccount.com" `
    "roles/cloudsql.client"

Invoke-Gcloud iam service-accounts add-iam-policy-binding `
    "bookwise-api@$ProjectId.iam.gserviceaccount.com" `
    "--member=serviceAccount:bookwise-api@$ProjectId.iam.gserviceaccount.com" `
    "--role=roles/iam.serviceAccountTokenCreator" `
    "--project=$ProjectId" --quiet

Bind-KubernetesIdentity "bookwise-api" "bookwise-api"
Bind-KubernetesIdentity "bookwise-worker" "bookwise-worker"
Bind-KubernetesIdentity "bookwise-migrator" "bookwise-migrator"

& gcloud iam workload-identity-pools describe $WorkloadIdentityPool `
    --location=global --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
    Invoke-Gcloud iam workload-identity-pools create $WorkloadIdentityPool `
        --location=global `
        "--display-name=GitHub Actions" `
        "--project=$ProjectId"
}

& gcloud iam workload-identity-pools providers describe $WorkloadIdentityProvider `
    "--workload-identity-pool=$WorkloadIdentityPool" `
    --location=global --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
    Invoke-Gcloud iam workload-identity-pools providers create-oidc `
        $WorkloadIdentityProvider `
        "--workload-identity-pool=$WorkloadIdentityPool" `
        --location=global `
        "--issuer-uri=https://token.actions.githubusercontent.com" `
        "--attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository" `
        "--attribute-condition=assertion.repository=='$GitHubRepository'" `
        "--project=$ProjectId"
}

$deployer = "bookwise-github-deployer@$ProjectId.iam.gserviceaccount.com"
Add-ProjectRole "serviceAccount:$deployer" "roles/artifactregistry.writer"
Add-ProjectRole "serviceAccount:$deployer" "roles/container.developer"
Add-ProjectRole "serviceAccount:$deployer" "roles/secretmanager.secretAccessor"

$principal = "principalSet://iam.googleapis.com/projects/$projectNumber/locations/global/workloadIdentityPools/$WorkloadIdentityPool/attribute.repository/$GitHubRepository"
Invoke-Gcloud iam service-accounts add-iam-policy-binding $deployer `
    "--member=$principal" `
    "--role=roles/iam.workloadIdentityUser" `
    "--project=$ProjectId" --quiet

$providerName = (
    & gcloud iam workload-identity-pools providers describe `
        $WorkloadIdentityProvider `
        "--workload-identity-pool=$WorkloadIdentityPool" `
        --location=global `
        "--project=$ProjectId" `
        --format="value(name)"
).Trim()

Write-Host ""
Write-Host "Configure these GitHub repository variables:"
Write-Host "GCP_PROJECT_ID=$ProjectId"
Write-Host "GCP_REGION=$Region"
Write-Host "GKE_CLUSTER_NAME=bookwise-autopilot"
Write-Host "GKE_NAMESPACE=$Namespace"
Write-Host "ARTIFACT_REGISTRY_REPOSITORY=bookwise"
Write-Host "GCP_WORKLOAD_IDENTITY_PROVIDER=$providerName"
Write-Host "GCP_DEPLOYER_SERVICE_ACCOUNT=$deployer"
