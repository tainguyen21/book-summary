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

$publicWebConfig = [ordered]@{
    NEXT_PUBLIC_API_URL = $env:NEXT_PUBLIC_API_URL
    NEXT_PUBLIC_AUTH0_DOMAIN = $env:NEXT_PUBLIC_AUTH0_DOMAIN
    NEXT_PUBLIC_AUTH0_CLIENT_ID = $env:NEXT_PUBLIC_AUTH0_CLIENT_ID
    NEXT_PUBLIC_AUTH0_AUDIENCE = $env:NEXT_PUBLIC_AUTH0_AUDIENCE
    NEXT_PUBLIC_AUTH0_REDIRECT_URI = $env:NEXT_PUBLIC_AUTH0_REDIRECT_URI
}
foreach ($entry in $publicWebConfig.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace($entry.Value)) {
        throw "$($entry.Key) must be configured before deployment."
    }
}

$configMapArguments = @(
    "create",
    "configmap",
    "bookwise-web",
    "--namespace=$Namespace"
)
foreach ($entry in $publicWebConfig.GetEnumerator()) {
    $configMapArguments += "--from-literal=$($entry.Key)=$($entry.Value)"
}
$configMapArguments += @("--dry-run=client", "-o", "yaml")
$renderedWebConfig = & kubectl @configMapArguments
if ($LASTEXITCODE -ne 0) { throw "Could not render the web ConfigMap." }
$renderedWebConfig | & kubectl apply -f - | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Could not apply the web ConfigMap." }

$overlay = Join-Path $PSScriptRoot "..\kubernetes\overlays\production"
$rendered = & kubectl kustomize $overlay
if ($LASTEXITCODE -ne 0) { throw "Kustomize rendering failed." }
$rendered = $rendered -replace ":local\b", ":$ImageTag"
& (Join-Path $PSScriptRoot "apply-resources.ps1") `
    -Manifest $rendered -Namespace $Namespace

foreach ($deployment in @("bookwise-web", "bookwise-api", "bookwise-worker")) {
    & kubectl rollout status "deployment/$deployment" `
        --namespace=$Namespace --timeout=10m | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Rollout failed for $deployment."
    }
}

& kubectl get pods,services,ingress `
    --namespace=$Namespace -o wide | Out-Host
