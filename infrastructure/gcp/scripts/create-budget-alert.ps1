param(
    [string]$ProjectId = "bookwise-509408",
    [Parameter(Mandatory = $true)][double]$MonthlyAmountUsd,
    [string]$DisplayName = "bookwise-monthly"
)

# Creates a monthly Cloud Billing budget for the project with email alerts at
# 50%, 90%, and 100% of actual spend. Alerts go to the billing account's
# default recipients (billing admins). Run it yourself with an account that
# has Billing Account Administrator or Billing Account Costs Manager; it is
# never run from CI. Re-running it with the same display name changes nothing.

$ErrorActionPreference = "Stop"

if ($MonthlyAmountUsd -le 0) {
    throw "MonthlyAmountUsd must be greater than zero."
}

function Invoke-Gcloud {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & gcloud @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "gcloud command failed: gcloud $($Arguments -join ' ')"
    }
}

$billingAccountName = (
    & gcloud billing projects describe $ProjectId --format="value(billingAccountName)"
).Trim()
if ($LASTEXITCODE -ne 0 -or -not $billingAccountName) {
    throw "Could not resolve the billing account for $ProjectId."
}
# gcloud returns "billingAccounts/<id>"; the budgets commands take the bare id.
$billingAccount = $billingAccountName -replace "^billingAccounts/", ""

Invoke-Gcloud services enable billingbudgets.googleapis.com "--project=$ProjectId"

$existing = (
    & gcloud billing budgets list "--billing-account=$billingAccount" `
        "--filter=displayName=$DisplayName" `
        --format="value(displayName)"
)
if ($LASTEXITCODE -ne 0) {
    throw "Could not list budgets. Check that your account has billing budget permissions."
}
if ($existing) {
    Write-Host "Budget '$DisplayName' already exists; nothing changed."
    Write-Host "Change its amount in the Console under Billing > Budgets & alerts."
    exit 0
}

# The explicit USD currency makes gcloud reject a billing account in another
# currency instead of silently creating a budget in that currency.
$amount = "{0}USD" -f $MonthlyAmountUsd.ToString([System.Globalization.CultureInfo]::InvariantCulture)
Invoke-Gcloud billing budgets create `
    "--billing-account=$billingAccount" `
    "--display-name=$DisplayName" `
    "--budget-amount=$amount" `
    "--filter-projects=projects/$ProjectId" `
    "--calendar-period=month" `
    "--threshold-rule=percent=0.5" `
    "--threshold-rule=percent=0.9" `
    "--threshold-rule=percent=1.0" `
    --format="none"

Write-Host ""
Write-Host "Created budget '$DisplayName' for $ProjectId."
Write-Host "Monthly amount: $amount"
Write-Host "Email alerts at 50%, 90%, and 100% of actual spend."
