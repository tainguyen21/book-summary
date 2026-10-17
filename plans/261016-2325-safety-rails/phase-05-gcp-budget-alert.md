---
phase: 5
title: GCP billing budget alert
status: completed
effort: 0.5d
dependsOn: []
---

# Phase 5 — GCP billing budget alert

## Context
- GCP automation lives in `infrastructure/gcp/scripts/*.ps1` (PowerShell), documented in `infrastructure/gcp/runbook.md`.
- Creating a budget needs Billing Account Administrator or Billing Account Costs Manager permissions on the project's billing account. The user runs the script with their own login; it is never run in CI or by an agent.
- The worker's $1/day cap estimates spend from token counts; billing is the source of truth for everything else (GKE, Cloud SQL, storage, Vertex).

## Requirements
- **New `infrastructure/gcp/scripts/create-budget-alert.ps1`:**
  - Parameters: `-ProjectId` (default `bookwise-509408`), `-MonthlyAmountUsd` (required), `-DisplayName` (default `bookwise-monthly`).
  - Resolve the billing account with `gcloud billing projects describe`.
  - Idempotent: if a budget with the display name exists (`gcloud billing budgets list`), print it and exit.
  - Otherwise create it with `gcloud billing budgets create`, scoped to the project, with threshold rules at 0.5, 0.9, and 1.0 of current spend and email to the billing admins (the default recipients).
  - Print only the budget name and thresholds; no account IDs beyond what the user already knows.
- **Runbook section "Budget alert":** required roles, the command to run, how to verify in the Console, and how to change the amount.

## Steps
1. (Done 2026-10-17) Write the script, mirroring the parameter and error style of `configure-services.ps1`.
2. (Done 2026-10-17) Add the runbook section.
3. (Done 2026-10-17) Created `bookwise-monthly`: 260,000 VND (about $10) per month, thresholds 0.5/0.9/1.0, for `bookwise-509408`. The billing account bills in VND, so the script gained `-Currency`; a re-run reports the existing budget and changes nothing.

## Validation
- `gcloud billing budgets list --billing-account=<id>` shows the budget with three thresholds.
- Running the script twice doesn't create a duplicate.

## Open question
- Monthly amount. Suggestion: $10 for a learning project, but the real figure depends on the always-on GKE and Cloud SQL baseline. Check last month's bill first.
