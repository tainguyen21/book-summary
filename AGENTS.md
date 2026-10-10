# Project Guidance

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
