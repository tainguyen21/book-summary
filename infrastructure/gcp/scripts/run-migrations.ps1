$ErrorActionPreference = "Stop"

$databaseUrl = $env:MIGRATION_DATABASE_URL
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    throw "MIGRATION_DATABASE_URL must be configured."
}
$cloudSqlInstance = $env:CLOUD_SQL_INSTANCE
if ([string]::IsNullOrWhiteSpace($cloudSqlInstance)) {
    throw "CLOUD_SQL_INSTANCE must be configured."
}

$migrationDirectory = "/app/infrastructure/database/migrations"
$roleDirectory = "/app/infrastructure/database/roles"
$migrationTable = "public.schema_migrations"
$proxy = Start-Process `
    -FilePath "/usr/local/bin/cloud-sql-proxy" `
    -ArgumentList @("--structured-logs", $cloudSqlInstance) `
    -PassThru `
    -NoNewWindow

try {
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        & pg_isready -h 127.0.0.1 -p 5432 *> $null
        if ($LASTEXITCODE -eq 0) { break }
        if ($attempt -eq 30) { throw "Cloud SQL proxy did not become ready." }
        Start-Sleep -Seconds 2
    }

function Invoke-Query {
    param([string]$Query)
    $result = & psql "--dbname=$databaseUrl" -Atc $Query
    if ($LASTEXITCODE -ne 0) { throw "Database query failed." }
    return ($result -join "`n").Trim()
}

function Invoke-Script {
    param([string]$Script)
    $Script | & psql "--dbname=$databaseUrl" -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "Database script failed." }
}

function Escape-SqlLiteral {
    param([string]$Value)
    return $Value.Replace("'", "''")
}

$files = Get-ChildItem -Path $migrationDirectory -Filter "*.sql" | Sort-Object Name
if ($files.Count -eq 0) { throw "No SQL migrations found." }

foreach ($file in $files) {
    $version = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
    $checksum = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash
    $safeVersion = Escape-SqlLiteral $version
    $safeChecksum = Escape-SqlLiteral $checksum
    $ledgerExists = Invoke-Query "SELECT to_regclass('$migrationTable') IS NOT NULL;"

    if ($ledgerExists -eq "t") {
        $recorded = Invoke-Query "SELECT checksum FROM $migrationTable WHERE version = '$safeVersion';"
        if ($recorded) {
            if ($recorded -ne $checksum) { throw "Migration $version checksum changed." }
            continue
        }
    } elseif ($file.Name -ne "001_create_initial_schema.sql") {
        throw "The first migration must create schema_migrations."
    }

    $script = @"
BEGIN;
$(Get-Content -Raw $file.FullName)
INSERT INTO public.schema_migrations (version, checksum)
VALUES ('$safeVersion', '$safeChecksum');
COMMIT;
"@
    Invoke-Script $script
}

    Get-ChildItem -Path $roleDirectory -Filter "*.sql" |
        Sort-Object Name |
        ForEach-Object { Invoke-Script (Get-Content -Raw $_.FullName) }
} finally {
    if (-not $proxy.HasExited) {
        Stop-Process -Id $proxy.Id
        $proxy.WaitForExit()
    }
}
