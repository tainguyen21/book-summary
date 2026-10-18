param(
    [string]$ProjectId = "bookwise-509408",
    [Parameter(Mandatory = $true)][string]$NotificationEmail,
    [string]$WebHost = "tai-dev-web.cloud"
)

# Creates Cloud Monitoring alerts that email $NotificationEmail when:
#   1. the public site (/) or the API's readiness check (/v1/ready) fails its
#      uptime check from several regions for 5 minutes;
#   2. the worker reports a permanent command failure (a book that will not
#      summarize without an owner retry);
#   3. the worker container restarts (its liveness heartbeat went stale, or it
#      crashed).
# Uses the Monitoring and Logging REST APIs with your gcloud credentials, so it
# works with any gcloud version. Run it yourself; it is never run from CI.
# Re-running it skips anything that already exists (matched by display name).

$ErrorActionPreference = "Stop"

if ($NotificationEmail -notmatch "^[^@\s]+@[^@\s]+\.[^@\s]+$") {
    throw "NotificationEmail must be an email address."
}

$token = (& gcloud auth print-access-token).Trim()
if ($LASTEXITCODE -ne 0 -or -not $token) {
    throw "Could not get an access token. Run 'gcloud auth login' first."
}
$headers = @{
    Authorization         = "Bearer $token"
    "x-goog-user-project" = $ProjectId
}
$monitoring = "https://monitoring.googleapis.com/v3/projects/$ProjectId"

& gcloud services enable monitoring.googleapis.com logging.googleapis.com "--project=$ProjectId" | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Could not enable the Monitoring and Logging APIs." }

function Invoke-Api {
    param([string]$Method, [string]$Uri, [object]$Body)
    $arguments = @{ Method = $Method; Uri = $Uri; Headers = $headers }
    if ($Body) {
        $arguments.Body = ($Body | ConvertTo-Json -Depth 20)
        $arguments.ContentType = "application/json"
    }
    Invoke-RestMethod @arguments
}

function Find-ByDisplayName {
    param([string]$Uri, [string]$Collection, [string]$DisplayName)
    $page = Invoke-Api GET $Uri
    @($page.$Collection) | Where-Object { $_.displayName -eq $DisplayName } | Select-Object -First 1
}

# --- Notification channel -------------------------------------------------
$channelName = "Bookwise alerts ($NotificationEmail)"
$channel = Find-ByDisplayName "$monitoring/notificationChannels" "notificationChannels" $channelName
if (-not $channel) {
    $channel = Invoke-Api POST "$monitoring/notificationChannels" @{
        type        = "email"
        displayName = $channelName
        labels      = @{ email_address = $NotificationEmail }
    }
    Write-Host "Created notification channel $channelName."
} else {
    Write-Host "Notification channel $channelName already exists."
}

# --- Uptime checks ---------------------------------------------------------
function Get-UptimeCheck {
    param([string]$DisplayName, [string]$Path)
    $existing = Find-ByDisplayName "$monitoring/uptimeCheckConfigs" "uptimeCheckConfigs" $DisplayName
    if ($existing) {
        Write-Host "Uptime check $DisplayName already exists."
        return $existing
    }
    Write-Host "Creating uptime check $DisplayName."
    Invoke-Api POST "$monitoring/uptimeCheckConfigs" @{
        displayName       = $DisplayName
        monitoredResource = @{
            type   = "uptime_url"
            labels = @{ project_id = $ProjectId; host = $WebHost }
        }
        httpCheck         = @{ path = $Path; port = 443; useSsl = $true; validateSsl = $true }
        period            = "300s"
        timeout           = "10s"
    }
}

$webCheck = Get-UptimeCheck "Bookwise site" "/"
$apiCheck = Get-UptimeCheck "Bookwise API ready" "/v1/ready"

# --- Log-based metric for permanent failures ---------------------------------
$metricName = "bookwise_command_failed_permanent"
try {
    Invoke-Api GET "https://logging.googleapis.com/v2/projects/$ProjectId/metrics/$metricName" | Out-Null
    Write-Host "Log metric $metricName already exists."
} catch {
    Write-Host "Creating log metric $metricName."
    Invoke-Api POST "https://logging.googleapis.com/v2/projects/$ProjectId/metrics" @{
        name        = $metricName
        description = "Worker commands that failed permanently (owner retry needed)."
        filter      = 'resource.type="k8s_container" AND resource.labels.container_name="worker" AND jsonPayload.event="command_failed" AND jsonPayload.outcome="permanent"'
    } | Out-Null
}

# --- Alert policies --------------------------------------------------------
function New-Policy {
    param([string]$DisplayName, [hashtable]$Condition, [string]$Documentation)
    if (Find-ByDisplayName "$monitoring/alertPolicies" "alertPolicies" $DisplayName) {
        Write-Host "Alert policy $DisplayName already exists."
        return
    }
    Write-Host "Creating alert policy $DisplayName."
    Invoke-Api POST "$monitoring/alertPolicies" @{
        displayName          = $DisplayName
        combiner             = "OR"
        conditions           = @($Condition)
        notificationChannels = @($channel.name)
        documentation        = @{ content = $Documentation; mimeType = "text/markdown" }
    } | Out-Null
}

function Get-UptimeCondition {
    param([object]$Check)
    $checkId = ($Check.name -split "/")[-1]
    @{
        displayName        = "$($Check.displayName) failing"
        conditionThreshold = @{
            filter         = "metric.type=""monitoring.googleapis.com/uptime_check/check_passed"" AND resource.type=""uptime_url"" AND metric.label.check_id=""$checkId"""
            aggregations   = @(@{
                alignmentPeriod    = "300s"
                perSeriesAligner   = "ALIGN_NEXT_OLDER"
                crossSeriesReducer = "REDUCE_COUNT_FALSE"
                groupByFields      = @("resource.label.host")
            })
            comparison     = "COMPARISON_GT"
            thresholdValue = 1
            duration       = "300s"
            trigger        = @{ count = 1 }
        }
    }
}

New-Policy "Bookwise site down" (Get-UptimeCondition $webCheck) `
    "The site at https://$WebHost/ failed uptime checks from more than one region for 5 minutes. Check the web pods and the ingress."
New-Policy "Bookwise API not ready" (Get-UptimeCondition $apiCheck) `
    "/v1/ready failed from more than one region for 5 minutes: Postgres (Cloud SQL proxy) or object storage is unreachable from the API."
New-Policy "Bookwise permanent processing failure" @{
    displayName        = "Permanent command failure"
    conditionThreshold = @{
        filter         = "metric.type=""logging.googleapis.com/user/$metricName"" AND resource.type=""k8s_container"""
        aggregations   = @(@{ alignmentPeriod = "300s"; perSeriesAligner = "ALIGN_SUM" })
        comparison     = "COMPARISON_GT"
        thresholdValue = 0
        duration       = "0s"
        trigger        = @{ count = 1 }
    }
} "A book failed permanently. The worker log line 'command_failed' carries the book and command ids; the owner can retry from the book page."
New-Policy "Bookwise worker restarted" @{
    displayName        = "Worker container restarts"
    conditionThreshold = @{
        filter         = 'metric.type="kubernetes.io/container/restart_count" AND resource.type="k8s_container" AND resource.label.container_name="worker"'
        aggregations   = @(@{ alignmentPeriod = "600s"; perSeriesAligner = "ALIGN_DELTA" })
        comparison     = "COMPARISON_GT"
        thresholdValue = 0
        duration       = "0s"
        trigger        = @{ count = 1 }
    }
} "The worker restarted: its liveness heartbeat went stale (stuck for 10 minutes) or it crashed. Check the worker logs before the restart."

Write-Host "Alerts are in place. They email $NotificationEmail."
