# Task 3 Report: Migrate The Authentication UI To `useAuth0`

## Implementation

- Converted `apps/web/src/app/page.tsx` to a client component that consumes
  `useAuth0()` for loading, error, authentication, sign-in, sign-up, and user
  display state.
- Replaced legacy server-session access and `/auth/login` navigation with
  `loginWithRedirect()`.
- Added sign-up behavior through
  `loginWithRedirect({ authorizationParams: { screen_hint: "signup" } })`.
- Converted `apps/web/src/components/auth/account-menu.tsx` to a client
  component that calls Auth0 SDK `logout()` with the required literal
  `http://localhost:3000` logout return URL.

## Commands And Results

- `git status --short; git branch --show-current; git log -3 --oneline`
  - Confirmed the requested checkout is on `master`; existing untracked
    `.vscode/` and plan files were left untouched.
- `pnpm --dir apps/web lint`
  - Passed (`eslint .`, exit code 0).
- `pnpm --dir apps/web build`
  - Failed before compiling the migrated UI because
    `apps/web/src/lib/auth0.ts` imports the unavailable
    `@auth0/nextjs-auth0/server` package through `apps/web/src/proxy.ts`.
    That server-side plumbing is outside this task's permitted scope and was
    not modified.

## Changed Files

- `apps/web/src/app/page.tsx`
- `apps/web/src/components/auth/account-menu.tsx`
- `.superpowers/sdd/2026-09-03-auth0-react-spa-migration-plan/task-3-report.md`

## Self-Review

- Both implementation files are client components and access browser-side Auth0
  state only through `@auth0/auth0-react`.
- No manual OAuth/OIDC flow was added.
- The callback and logout URL behavior uses the literal
  `http://localhost:3000`; there is no `window` access.
- No automated tests were added or changed, per project guidance.
- No provider, server Auth0 plumbing, configuration, unrelated documentation,
  or `.vscode/` files were modified. This report is the requested exception.
