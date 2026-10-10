param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $repoRoot ".env"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Missing .env. Create it first with: Copy-Item .env.example .env"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is required. Start Docker Desktop and try again."
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw "pnpm is required. Install dependencies before starting Bookwise."
}

Write-Host "Starting local infrastructure..."
Push-Location $repoRoot
try {
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed to start."
    }

    Write-Host "Waiting for PostgreSQL..."
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        docker compose exec -T postgres pg_isready -U bookwise -d bookwise_next *> $null
        if ($LASTEXITCODE -eq 0) {
            break
        }

        if ($attempt -eq 30) {
            throw "PostgreSQL did not become ready in time."
        }

        Start-Sleep -Seconds 2
    }

    Write-Host "Applying database migrations..."
    pnpm run migrate:local
    if ($LASTEXITCODE -ne 0) {
        throw "Database migration failed."
    }
} finally {
    Pop-Location
}

$shell = Get-Command pwsh -ErrorAction SilentlyContinue
if ($null -eq $shell) {
    $shell = Get-Command powershell -ErrorAction SilentlyContinue
}
if ($null -eq $shell) {
    throw "PowerShell is required to open service terminals."
}

function Start-ServiceTerminal {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $terminalCommand = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
Set-Location -LiteralPath '$repoRoot'
$Command
"@
    $encodedCommand = [Convert]::ToBase64String(
        [Text.Encoding]::Unicode.GetBytes($terminalCommand)
    )

    Start-Process `
        -FilePath $shell.Source `
        -ArgumentList @("-NoExit", "-EncodedCommand", $encodedCommand) `
        -WorkingDirectory $repoRoot
}

Start-ServiceTerminal `
    -Title "Bookwise API" `
    -Command "pnpm run dev:api"

Start-ServiceTerminal `
    -Title "Bookwise Web" `
    -Command "pnpm run dev:web"

$workerCommand = @'
Get-Content -LiteralPath ".env" |
    Where-Object { $_ -match "^\s*[^#][^=]*=" } |
    ForEach-Object {
        $name, $value = $_ -split "=", 2
        [Environment]::SetEnvironmentVariable(
            $name.Trim(),
            $value.Trim(),
            "Process"
        )
    }
uv run --project services/data python -m bookwise_data.workers.main
'@

Start-ServiceTerminal `
    -Title "Bookwise Worker" `
    -Command $workerCommand

Write-Host ""
Write-Host "Bookwise services are starting in separate terminals."
Write-Host "Web: http://localhost:3000"
Write-Host "API: http://localhost:3001"
