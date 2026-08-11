param(
    [Parameter(Mandatory = $true)]
    [string]$DatabaseUrl
)

$ErrorActionPreference = "Stop"
$migrationDirectory = Join-Path $PSScriptRoot "migrations"
$roleDirectory = Join-Path $PSScriptRoot "roles"
$psql = Get-Command psql -ErrorAction SilentlyContinue
$useDocker = $null -eq $psql

function Invoke-DatabaseQuery {
    param([string]$Query)

    if ($useDocker) {
        $result = & docker compose exec -T postgres psql "--dbname=$DatabaseUrl" -Atc $Query
    } else {
        $result = & $psql.Source "--dbname=$DatabaseUrl" -Atc $Query
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Database query failed."
    }

    return ($result -join "`n").Trim()
}

function Invoke-DatabaseScript {
    param([string]$Script)

    if ($useDocker) {
        $Script | docker compose exec -T postgres psql "--dbname=$DatabaseUrl" -v ON_ERROR_STOP=1
    } else {
        $Script | & $psql.Source "--dbname=$DatabaseUrl" -v ON_ERROR_STOP=1
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Database script failed."
    }
}

function Escape-SqlLiteral {
    param([string]$Value)

    return $Value.Replace("'", "''")
}

$migrationFiles = Get-ChildItem -Path $migrationDirectory -Filter "*.sql" |
    Sort-Object Name

if ($migrationFiles.Count -eq 0) {
    throw "No SQL migrations found in $migrationDirectory."
}

foreach ($file in $migrationFiles) {
    $version = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
    $checksum = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash
    $safeVersion = Escape-SqlLiteral $version
    $safeChecksum = Escape-SqlLiteral $checksum

    $ledgerExists = Invoke-DatabaseQuery `
        "SELECT to_regclass('public.schema_migrations') IS NOT NULL;"

    if ($ledgerExists -eq "t") {
        $recordedChecksum = Invoke-DatabaseQuery `
            "SELECT checksum FROM public.schema_migrations WHERE version = '$safeVersion';"

        if ($recordedChecksum) {
            if ($recordedChecksum -ne $checksum) {
                throw "Migration $version has changed after it was applied."
            }

            Write-Host "Skipping applied migration $version"
            continue
        }
    } elseif ($file.Name -ne "001_create_initial_schema.sql") {
        throw "The first migration must create public.schema_migrations."
    }

    Write-Host "Applying migration $version"
    $migrationScript = @"
BEGIN;
$(Get-Content -Raw $file.FullName)
INSERT INTO public.schema_migrations (version, checksum)
VALUES ('$safeVersion', '$safeChecksum');
COMMIT;
"@
    Invoke-DatabaseScript $migrationScript
}

$roleFiles = Get-ChildItem -Path $roleDirectory -Filter "*.sql" | Sort-Object Name
foreach ($file in $roleFiles) {
    Write-Host "Applying role grants $($file.Name)"
    Invoke-DatabaseScript (Get-Content -Raw $file.FullName)
}
