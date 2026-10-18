---
title: "CI security"
description: "Secret scanning, dependency and image vulnerability scanning, and security headers on the web app."
status: completed
priority: P2
effort: 1d
branch: master
tags: [ci, security, web]
created: 2026-10-18
---

# CI security (roadmap B9)

## What changed

- **Verify (CI, every PR and deploy):**
  - gitleaks `v8.30.1` scans the full history (redacted) and fails on a finding.
  - Trivy `0.76.0` scans the lockfiles and fails on fixable CRITICAL
    vulnerabilities.
  - Checkout uses full history (`fetch-depth: 0`).
- **Weekly security scan** (`security-scan.yml`, Mondays 01:00 UTC, also run on
  demand):
  - gitleaks again;
  - fixable HIGH and CRITICAL in the lockfiles;
  - the base images `python:3.12-slim` and `node:24-bookworm-slim`.
  - A failure emails the owner without blocking deploys.
- **`.gitleaksignore`:** one reviewed false positive, the public Auth0 SPA client
  ID in `docs/new-device-setup.md`.
- **Dependency fixes:** the first scan found fixable HIGH/CRITICAL issues, now
  0.
  - `next` 16.3.0 → 16.3.8 (CRITICAL), pinned to the patch release.
  - `@nestjs/platform-fastify` → 11.2.7, `fastify` → 5.12.7 (with a workspace
    override, because the Nest adapter pins 5.11.3).
  - `fast-uri`, `find-my-way`, `sharp`, `source-map-js`, and `urllib3` 2.8.0.
- **Web security headers** (`next.config.ts`, fixed when the web image is
  compiled, from the public config):
  - A CSP that allows Auth0 (redirect, silent-renew iframe, token calls), the
    API, and GCS signed uploads. In development it also allows `unsafe-eval`
    and localhost for hot reload and MinIO.
  - `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`,
    `Referrer-Policy`, `Permissions-Policy`, and HSTS in production.
  - Scripts still need `'unsafe-inline'`, because Next inlines its bootstrap
    and the reading-settings script. Nonces would need middleware (not done).

## Results (2026-10-18, local)

- gitleaks: 152 commits, 1 finding, the public client ID, now ignored, so it
  exits 0.
- Trivy: 0 fixable HIGH/CRITICAL in `pnpm-lock.yaml` and `uv.lock` after the
  upgrades.
- **Checks:** API lint, typecheck, and Prettier pass; web lint, typecheck, the
  3 tests, and the production compile pass; worker ruff and compile pass.
- **Runtime:** Ask streaming still works on the upgraded Fastify.
- **Production `next start` with the strict CSP:** signed in, the library and
  book page load (summary, flashcards, highlights), a cached answer streams,
  and there are no CSP violations. The development server is also clean.
- **Not verifiable locally:** Auth0 silent token renewal (the iframe on the
  Auth0 domain) only runs once the cached token expires. `frame-src` allows it.
