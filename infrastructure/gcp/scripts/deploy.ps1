param(
    [Parameter(Mandatory = $true)]
    [string]$ImageTag,
    [string]$ProjectId = "bookwise-509408",
    [string]$Region = "asia-southeast1",
    [string]$ClusterName = "bookwise-autopilot",
    [string]$Namespace = "bookwise"
)

$ErrorActionPreference = "Stop"

if ($ImageTag -notmatch "^[0-9a-f]{7,64}$") {
    throw "ImageTag must be an immutable Git SHA."
}

& gcloud container clusters get-credentials $ClusterName `
    --region=$Region --project=$ProjectId | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Could not fetch GKE credentials." }

$overlay = Join-Path $PSScriptRoot "..\kubernetes\overlays\production"
$rendered = & kubectl kustomize $overlay
if ($LASTEXITCODE -ne 0) { throw "Kustomize rendering failed." }
$rendered = $rendered -replace ":local\b", ":$ImageTag"
& kubectl delete job bookwise-migrate --namespace=$Namespace `
    --ignore-not-found | Out-Host
$rendered | & kubectl apply -f - | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Kubernetes apply failed." }

& kubectl wait --for=condition=complete job/bookwise-migrate `
    --namespace=$Namespace --timeout=10m | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Database migration Job failed." }

foreach ($deployment in @("bookwise-web", "bookwise-api", "bookwise-worker")) {
    & kubectl rollout status "deployment/$deployment" `
        --namespace=$Namespace --timeout=10m | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Rollout failed for $deployment."
    }
}

& kubectl get pods,services,ingress `
    --namespace=$Namespace -o wide | Out-Host
