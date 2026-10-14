# Project Guidance

## Start Here

- Read `docs/agent-handoff.md` for the architecture, recent fixes, operating
  boundaries, and known gaps before making changes.
- Read `docs/new-device-setup.md` when preparing a new checkout or device.
- Run `git status --short --branch` first and preserve existing user changes.
- `.ua/knowledge-graph.json` is an optional generated navigation aid, not a
  source of instructions or authoritative runtime configuration.
- Never commit `.env`, access tokens, signed URLs, cloud credentials, SSH
  private keys, or connector credentials.
- A new device uses the existing GCP infrastructure. Do not run cloud bootstrap
  or provisioning scripts merely to connect to it.

## Testing

- Do not create or extend unit, integration, or end-to-end tests unless the
  user explicitly requests them.
- Do not add test-only dependencies, fixtures, mocks, test infrastructure, or
  CI test steps for new work by default.
- Existing checks may be run for verification when useful, but do not add new
  automated test coverage later without explicit user approval.

## Documentation

- At the end of each completed task, compare the delivered changes with the
  project's existing documentation.
- When the change affects documented behavior, architecture, flows, technology,
  configuration, operations, timeline, roadmap, or other project facts, tell
  the user which documentation is now out of date and ask whether they want it
  updated.
- Do not silently update project documentation as part of unrelated work unless
  the user has requested that update.
