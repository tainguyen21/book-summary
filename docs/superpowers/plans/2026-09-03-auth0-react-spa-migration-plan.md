# Auth0 React SPA Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the official Auth0 React SDK so Bookwise authenticates
users through the configured Auth0 SPA application at `http://localhost:3000`.

**Architecture:** The root server layout renders a focused client provider that
configures the Auth0 React SDK with the fixed local development origin and API
audience. The home page becomes a client component that reads authentication
state from `useAuth0`; the incompatible server-session SDK, server Auth0
client, and Proxy are removed.

**Tech Stack:** Next.js 16, React 19, TypeScript, `@auth0/auth0-react@2.x`,
pnpm.

**Spec:** `docs/superpowers/specs/2026-09-03-auth0-react-spa-migration-design.md`

## Global Constraints

- Use `@auth0/auth0-react@2.x`; do not implement OAuth or OIDC flows manually.
- Configure domain `dev-p8c5tpe1ghv8qtxf.us.auth0.com`.
- Configure client ID `U3USwzKKexcx7Y2FkWVTRznXrK7dTdaq`.
- Use the literal redirect and logout return URL `http://localhost:3000`.
- Keep API audience `https://api.bookwise.local` in Auth0 authorization
  parameters.
- No server component or server module may access browser globals.
- The Next.js development command must explicitly use port `3000`.
- Do not create or modify automated tests without explicit user approval.
- Leave unrelated untracked `.vscode/` content untouched.

---

### Task 1: Replace The Server Auth0 Dependency

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: the workspace package name `@bookwise/web`.
- Produces: `@auth0/auth0-react` import availability for client components.

- [ ] **Step 1: Replace the web package dependency**

Run:

```powershell
pnpm --filter @bookwise/web remove @auth0/nextjs-auth0
pnpm --filter @bookwise/web add @auth0/auth0-react@2
```

Expected: `apps/web/package.json` lists `@auth0/auth0-react` and no longer
lists `@auth0/nextjs-auth0`; `pnpm-lock.yaml` reflects the same graph.

- [ ] **Step 2: Verify the installed package**

Run:

```powershell
pnpm --filter @bookwise/web exec node -e "require.resolve('@auth0/auth0-react')"
```

Expected: the command prints the resolved SDK module path and exits with code
zero.

### Task 2: Add The Client-Side Auth0 Provider

**Files:**
- Create: `apps/web/src/components/auth/auth0-provider.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Consumes: `Auth0Provider` from `@auth0/auth0-react` and `ReactNode`.
- Produces: `Auth0Provider` context around every route with the configured
  domain, client ID, redirect URI, and API audience.

- [ ] **Step 1: Create the provider component**

Create `apps/web/src/components/auth/auth0-provider.tsx`:

```tsx
"use client";

import { Auth0Provider } from "@auth0/auth0-react";
import type { ReactNode } from "react";

export function BookwiseAuth0Provider({ children }: { children: ReactNode }) {
  return (
    <Auth0Provider
      domain="dev-p8c5tpe1ghv8qtxf.us.auth0.com"
      clientId="U3USwzKKexcx7Y2FkWVTRznXrK7dTdaq"
      authorizationParams={{
        audience: "https://api.bookwise.local",
        redirect_uri: "http://localhost:3000",
      }}
    >
      {children}
    </Auth0Provider>
  );
}
```

- [ ] **Step 2: Wrap the root layout children**

Update `apps/web/src/app/layout.tsx`:

```tsx
import { BookwiseAuth0Provider } from "../components/auth/auth0-provider";

// Keep the existing metadata and RootLayout signature.
// Replace <body>{children}</body> with:
<body>
  <BookwiseAuth0Provider>{children}</BookwiseAuth0Provider>
</body>
```

Expected: `layout.tsx` remains a server component, while the new provider
forms the client boundary for the Auth0 SDK.

### Task 3: Migrate The Authentication UI To `useAuth0`

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/auth/account-menu.tsx`

**Interfaces:**
- Consumes: `useAuth0()` from `@auth0/auth0-react`.
- Produces: client-side loading, error, sign-in, sign-up, authenticated user,
  and sign-out UI.

- [ ] **Step 1: Convert the account menu to client-side sign-out**

Replace `apps/web/src/components/auth/account-menu.tsx` with:

```tsx
"use client";

import { useAuth0 } from "@auth0/auth0-react";

export function AccountMenu({ email }: { email: string }) {
  const { logout } = useAuth0();

  return (
    <div>
      <span>{email}</span>
      <button
        type="button"
        onClick={() =>
          logout({ logoutParams: { returnTo: "http://localhost:3000" } })
        }
      >
        Sign out
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Replace server session rendering with SDK state**

Replace `apps/web/src/app/page.tsx` with:

```tsx
"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { AccountMenu } from "../components/auth/account-menu";

export default function HomePage() {
  const { error, isAuthenticated, isLoading, loginWithRedirect, user } =
    useAuth0();

  if (isLoading) {
    return <main>Loading...</main>;
  }

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Bookwise</h1>
        <p>Your private library is one sign-in away.</p>
        {error && <p>Error: {error.message}</p>}
        <button type="button" onClick={() => loginWithRedirect()}>
          Sign in
        </button>
        <button
          type="button"
          onClick={() =>
            loginWithRedirect({
              authorizationParams: { screen_hint: "signup" },
            })
          }
        >
          Sign up
        </button>
      </main>
    );
  }

  const email = user?.email?.trim() || user?.name || "Signed in user";

  return (
    <main>
      <h1>Your library</h1>
      <AccountMenu email={email} />
      <p>Private uploads and saved books will appear here soon.</p>
    </main>
  );
}
```

Expected: Auth0 Universal Login starts only through SDK methods, and the
page accesses no server session.

### Task 4: Remove Server Auth0 Session Plumbing And Pin The Port

**Files:**
- Delete: `apps/web/src/lib/auth0.ts`
- Delete: `apps/web/src/proxy.ts`
- Modify: `apps/web/package.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: the client Auth0 provider from Task 2.
- Produces: no server SDK imports or confidential-client configuration in the
  web application; a development server bound to port `3000`.

- [ ] **Step 1: Remove obsolete server Auth0 modules**

Delete:

```text
apps/web/src/lib/auth0.ts
apps/web/src/proxy.ts
```

Expected: no `@auth0/nextjs-auth0`, `Auth0Client`, `auth0.getSession`, or
`auth0.middleware` references remain under `apps/web/src`.

- [ ] **Step 2: Fix the development command**

In `apps/web/package.json`, replace:

```json
"dev": "next dev"
```

with:

```json
"dev": "next dev --port 3000"
```

- [ ] **Step 3: Remove obsolete server-only example settings**

In `.env.example`, remove these web-only Auth0 variables:

```dotenv
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_SECRET=
AUTH0_AUDIENCE=https://api.bookwise.local
```

Keep the `OIDC_ISSUER` and `OIDC_AUDIENCE` values because the API service uses
them to verify bearer access tokens.

### Task 5: Verify The Production Build

**Files:**
- Verify only; no test files are created or changed.

**Interfaces:**
- Consumes: the completed client Auth0 migration.
- Produces: lint and build evidence that imports and Next.js client/server
  boundaries compile.

- [ ] **Step 1: Check the migration references**

Run:

```powershell
rg -n "@auth0/nextjs-auth0|Auth0Client|auth0\.getSession|auth0\.middleware" apps/web
```

Expected: no matches.

- [ ] **Step 2: Run the web linter**

Run:

```powershell
pnpm --dir apps/web lint
```

Expected: exit code zero.

- [ ] **Step 3: Run the production build**

Run:

```powershell
pnpm --dir apps/web build
```

Expected: exit code zero.

- [ ] **Step 4: Inspect the final change set**

Run:

```powershell
git diff --check
git status --short
git diff -- apps/web .env.example pnpm-lock.yaml
```

Expected: no whitespace errors; only migration files and the pre-existing
untracked `.vscode/` directory are present.

- [ ] **Step 5: Commit the implementation**

Run:

```powershell
git add apps/web/package.json apps/web/src .env.example pnpm-lock.yaml
git commit -m "feat: add Auth0 React SDK integration"
```

Expected: the code migration is committed without adding `.vscode/`.
