# Project Guidance

## Testing

- Do not create or extend unit, integration, or end-to-end tests unless the
  user explicitly requests them.
- Do not add test-only dependencies, fixtures, mocks, test infrastructure, or
  CI test steps for new work by default.
- Existing checks may be run for verification when useful, but do not add new
  automated test coverage later without explicit user approval.
