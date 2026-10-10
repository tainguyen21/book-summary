param(
    [Parameter(Mandatory = $true)]
    [string[]]$Manifest,
    [string]$Namespace = "bookwise"
)

$ErrorActionPreference = "Stop"

$json = $Manifest | & kubectl create --dry-run=client --validate=false -f - -o json
if ($LASTEXITCODE -ne 0) { throw "Could not parse the rendered Kubernetes resources." }

# kubectl prints one JSON document per resource rather than a single List.
$reader = [Newtonsoft.Json.JsonTextReader]::new(
    [System.IO.StringReader]::new(($json -join "`n"))
)
$reader.SupportMultipleContent = $true
try {
    $resources = @(while ($reader.Read()) {
        $document = [Newtonsoft.Json.Linq.JObject]::Load($reader).ToString() |
            ConvertFrom-Json
        if ($document.kind -eq "List") { $document.items } else { $document }
    })
} finally {
    $reader.Close()
}

$prerequisiteKinds = @("Namespace", "ServiceAccount", "ConfigMap", "Secret")
$prerequisites = @($resources | Where-Object { $_.kind -in $prerequisiteKinds })
$migration = @($resources | Where-Object {
    $_.kind -eq "Job" -and $_.metadata.name -eq "bookwise-migrate"
})
if ($migration.Count -ne 1) {
    throw "The manifest must contain exactly one bookwise-migrate Job."
}
$applications = @($resources | Where-Object {
    $_.kind -notin $prerequisiteKinds -and
    -not ($_.kind -eq "Job" -and $_.metadata.name -eq "bookwise-migrate")
})

function Apply-Resources {
    param([object[]]$Items)

    if ($Items.Count -eq 0) { return }
    @{
        apiVersion = "v1"
        kind = "List"
        items = @($Items)
    } | ConvertTo-Json -Depth 100 |
        & kubectl apply --namespace=$Namespace -f - | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Kubernetes apply failed." }
}

Write-Host "Applying migration prerequisites..."
Apply-Resources $prerequisites

# Keep existing application Deployments untouched until the migration succeeds.
& kubectl delete job bookwise-migrate --namespace=$Namespace --ignore-not-found | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Could not replace the database migration Job." }
Apply-Resources $migration

& kubectl wait --for=condition=complete job/bookwise-migrate `
    --namespace=$Namespace --timeout=10m | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Database migration Job failed; applications were not applied." }

Write-Host "Migration complete. Applying application resources..."
Apply-Resources $applications
