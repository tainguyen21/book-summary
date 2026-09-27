param(
    [string]$ProjectId = "bookwise-509408",
    [string]$Region = "asia-southeast1",
    [string]$ClusterName = "bookwise-autopilot",
    [string]$Namespace = "bookwise",
    [string]$ArtifactRepository = "bookwise"
)

$ErrorActionPreference = "Stop"

foreach ($command in @("gcloud", "kubectl")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "$command is required."
    }
}

& gcloud config set project $ProjectId | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Could not select project $ProjectId." }

$services = @(
    "artifactregistry.googleapis.com",
    "container.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "aiplatform.googleapis.com",
    "secretmanager.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com"
)
& gcloud services enable $services | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Could not enable required Google APIs." }

& gcloud artifacts repositories describe $ArtifactRepository `
    --location=$Region --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
    & gcloud artifacts repositories create $ArtifactRepository `
        --repository-format=docker `
        --location=$Region `
        --description="Bookwise container images" `
        --project=$ProjectId | Out-Host
}

& gcloud container clusters describe $ClusterName `
    --region=$Region --project=$ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
    & gcloud container clusters create-auto $ClusterName `
        --region=$Region `
        --project=$ProjectId | Out-Host
}

& gcloud container clusters get-credentials $ClusterName `
    --region=$Region --project=$ProjectId | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Could not fetch GKE credentials." }

& kubectl get namespace $Namespace *> $null
if ($LASTEXITCODE -ne 0) {
    & kubectl create namespace $Namespace | Out-Host
}

$serviceAccounts = @(
    "bookwise-api",
    "bookwise-worker",
    "bookwise-migrator",
    "bookwise-github-deployer"
)
foreach ($account in $serviceAccounts) {
    & gcloud iam service-accounts describe `
        "$account@$ProjectId.iam.gserviceaccount.com" `
        --project=$ProjectId *> $null
    if ($LASTEXITCODE -ne 0) {
        & gcloud iam service-accounts create $account `
            --display-name=$account `
            --project=$ProjectId | Out-Host
    }
}

Write-Host ""
Write-Host "Bootstrap complete."
Write-Host "Next: configure Cloud SQL, IAM bindings, Secret Manager, and GitHub OIDC."
