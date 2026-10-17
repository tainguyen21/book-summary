param(
    [string]$ProjectId = "bookwise-509408",
    [Parameter(Mandatory = $true)][double]$MonthlyAmount,
    # Must be the billing account's own currency (bookwise-509408 bills in VND).
    [string]$Currency = "USD",
    [string]$DisplayName = "bookwise-monthly"
)

# Creates a monthly Cloud Billing budget for the project with email alerts at
# 50%, 90%, and 100% of actual spend. Alerts go to the billing account's
# default recipients (billing admins). Run it yourself with an account that
# has Billing Account Administrator or Billing Account Costs Manager; it is
# never run from CI. Re-running it with the same display name changes nothing.

$ErrorActionPreference = "Stop"

if ($MonthlyAmount -le 0) {
    throw "MonthlyAmount must be greater than zero."
}
if ($Currency -notmatch "^[A-Z]{3}$") {
    throw "Currency must be a three-letter ISO code such as USD or VND."
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

# The explicit currency makes gcloud reject a mismatch with the billing account
# instead of silently creating a budget in the account's currency.
$amount = "{0}{1}" -f $MonthlyAmount.ToString([System.Globalization.CultureInfo]::InvariantCulture), $Currency
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
