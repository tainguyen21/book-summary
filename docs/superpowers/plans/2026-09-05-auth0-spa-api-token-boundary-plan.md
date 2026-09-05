# Auth0 SPA API Token Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in Auth0 SPA user synchronize their identity with NestJS
through a bearer API token and see a compact connection state.

**Architecture:** The NestJS bootstrap permits narrowly scoped local CORS for
the SPA origin. A client-only web helper obtains an access token from Auth0
React and sends it directly to the existing NestJS identity-sync endpoint.
A focused client component uses that helper and renders connecting, connected,
and retryable error states on the authenticated home page.

**Tech Stack:** Next.js 16, React 19, TypeScript, `@auth0/auth0-react@2.x`,
NestJS 11, Fastify, Zod.

**Spec:** `docs/superpowers/specs/2026-09-05-auth0-spa-api-token-boundary-design.md`

## Global Constraints

- Scope is limited to the SPA-to-NestJS token boundary; do not implement
  uploads, storage, library reads, or processing-status views.
- Obtain the API access token through Auth0 React SDK
  `getAccessTokenSilently`.
- Send the token only in the browser request's `Authorization: Bearer` header
  to `NEXT_PUBLIC_API_URL`; do not render, log, persist, or proxy it.
- Use the existing `POST /v1/session/sync` endpoint and its existing NestJS
  identity verification and provisioning behavior.
- Allow CORS only from `http://localhost:3000`, only for `POST` and `OPTIONS`,
  and only for `authorization` and `content-type` headers. Do not enable
  credentials or a wildcard origin.
- Do not create or modify automated tests, fixtures, mocks, or test
  infrastructure.
- Verify with lint, production builds, formatting, and manual local checks.
- Leave unrelated existing worktree changes untouched.

---

## File Structure

```text
apps/web/
  src/
    components/
      auth/
        session-sync-status.tsx       # Authenticated connection state and retry UI
    lib/
      bookwise-api.ts                 # Client-only token acquisition and API request helper
    app/
      page.tsx                        # Renders session synchronization for signed-in users

services/api/
  src/
    main.ts                           # Local SPA CORS policy
```

### Task 1: Permit The Local SPA Origin At The API Boundary

**Files:**
- Modify: `services/api/src/main.ts`

**Interfaces:**
- Consumes: NestJS `NestFastifyApplication` created by `bootstrap()`.
- Produces: browser preflight and `POST` access to the API only from
  `http://localhost:3000`, with the bearer-token request headers required by
  the session-sync call.

- [ ] **Step 1: Add the scoped CORS policy during application bootstrap**

In `services/api/src/main.ts`, call `app.enableCors()` immediately after
`NestFactory.create()` and before global pipes:

```ts
  app.enableCors({
    origin: "http://localhost:3000",
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type"],
    credentials: false,
  });
```

Keep the existing Fastify adapter, validation-pipe setup, and listen behavior
unchanged. Do not enable wildcard origins, methods, or request headers.

- [ ] **Step 2: Run the API static checks**

Run:

```powershell
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
```

Expected: all three commands exit with code zero.

- [ ] **Step 3: Commit the API boundary**

```powershell
git add services/api/src/main.ts
git commit -m "feat(api): allow local SPA token requests"
```

### Task 2: Add A Client-Only Authenticated Bookwise API Helper

**Files:**
- Create: `apps/web/src/lib/bookwise-api.ts`

**Interfaces:**
- Consumes: `Auth0ContextInterface<User>["getAccessTokenSilently"]` from
  `@auth0/auth0-react` and `publicConfig.NEXT_PUBLIC_API_URL`.
- Produces: `BookwisePrincipal`,
  `GetAccessTokenSilently`, `BookwiseConnectionError`, and
  `syncBookwiseIdentity(getAccessTokenSilently)`.

- [ ] **Step 1: Create the typed client-only API module**

Create `apps/web/src/lib/bookwise-api.ts`:

```ts
"use client";

import type { Auth0ContextInterface, User } from "@auth0/auth0-react";
import { z } from "zod";

import { publicConfig } from "./config";

const bookwisePrincipalSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  isAdmin: z.boolean(),
});

export type BookwisePrincipal = z.infer<typeof bookwisePrincipalSchema>;
export type GetAccessTokenSilently =
  Auth0ContextInterface<User>["getAccessTokenSilently"];

export class BookwiseConnectionError extends Error {
  constructor() {
    super("Bookwise could not connect. Please try again.");
    this.name = "BookwiseConnectionError";
  }
}

export async function syncBookwiseIdentity(
  getAccessTokenSilently: GetAccessTokenSilently,
): Promise<BookwisePrincipal> {
  const token = await getAccessTokenSilently();
  const response = await fetch(
    new URL("/v1/session/sync", publicConfig.NEXT_PUBLIC_API_URL),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new BookwiseConnectionError();
  }

  const principal = bookwisePrincipalSchema.safeParse(
    await response.json().catch(() => undefined),
  );

  if (!principal.success) {
    throw new BookwiseConnectionError();
  }

  return principal.data;
}
```

Do not add a `content-type` header because the request has no body. Do not
catch or log the Auth0 token-acquisition exception in this module; the UI
owns translating all failures to the safe connection state.

- [ ] **Step 2: Run the web static checks**

Run:

```powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
```

Expected: both commands exit with code zero. No test files are changed.

- [ ] **Step 3: Commit the authenticated client helper**

```powershell
git add apps/web/src/lib/bookwise-api.ts
git commit -m "feat(web): add authenticated Bookwise API client"
```

### Task 3: Render The Identity Synchronization State

**Files:**
- Create: `apps/web/src/components/auth/session-sync-status.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `useAuth0().getAccessTokenSilently`,
  `syncBookwiseIdentity(getAccessTokenSilently)`, and an authenticated user's
  stable identity key.
- Produces: compact connecting, connected, and retryable error UI. The
  component synchronizes once per identity key and exposes retry only after a
  failed synchronization.

- [ ] **Step 1: Create the focused session-sync status component**

Create `apps/web/src/components/auth/session-sync-status.tsx`:

```tsx
"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";

import {
  syncBookwiseIdentity,
  type BookwisePrincipal,
} from "../../lib/bookwise-api";

type ConnectionState =
  | { kind: "connecting" }
  | { kind: "connected"; principal: BookwisePrincipal }
  | { kind: "error" };

export function SessionSyncStatus({ identityKey }: { identityKey: string }) {
  const { getAccessTokenSilently } = useAuth0();
  const [state, setState] = useState<ConnectionState>({
    kind: "connecting",
  });

  const synchronize = useCallback(async () => {
    setState({ kind: "connecting" });

    try {
      const principal = await syncBookwiseIdentity(getAccessTokenSilently);
      setState({ kind: "connected", principal });
    } catch {
      setState({ kind: "error" });
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    void synchronize();
  }, [identityKey, synchronize]);

  if (state.kind === "connecting") {
    return <p role="status">Connecting Bookwise...</p>;
  }

  if (state.kind === "connected") {
    return <p role="status">Connected as {state.principal.email}</p>;
  }

  return (
    <div>
      <p role="alert">Bookwise could not connect. Please try again.</p>
      <button type="button" onClick={() => void synchronize()}>
        Retry
      </button>
    </div>
  );
}
```

The component must not include tokens or caught error values in React state,
logs, or JSX. The `identityKey` dependency causes a newly authenticated user
to receive a fresh synchronization attempt while the retry command keeps the
same narrow flow.

- [ ] **Step 2: Render the status only for authenticated users**

In `apps/web/src/app/page.tsx`, add this import:

```ts
import { SessionSyncStatus } from "../components/auth/session-sync-status";
```

Immediately after rendering the account menu in the authenticated branch,
render the status component:

```tsx
      <AccountMenu email={email} />
      <SessionSyncStatus identityKey={user?.sub ?? email} />
      <p>Private uploads and saved books will appear here soon.</p>
```

Keep the signed-out, loading, sign-in, sign-up, and sign-out behavior
unchanged. Do not make the page or the new component fetch library data.

- [ ] **Step 3: Run the web static checks**

Run:

```powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
```

Expected: both commands exit with code zero. No test files are added or
modified.

- [ ] **Step 4: Commit the visible token-boundary checkpoint**

```powershell
git add apps/web/src/components/auth/session-sync-status.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): show API identity connection state"
```

### Task 4: Verify The Complete Local Boundary

**Files:**
- Verify only; no files are created or modified.

**Interfaces:**
- Consumes: the API CORS policy, the Auth0 React provider, the authenticated
  client helper, and `POST /v1/session/sync`.
- Produces: lint, build, format, CORS, and manual Auth0 sign-in evidence for
  the direct browser-to-NestJS boundary.

- [ ] **Step 1: Run the complete static verification**

Run:

```powershell
pnpm --dir apps/web lint
pnpm --dir apps/web build
pnpm --dir services/api lint
pnpm --dir services/api build
pnpm --dir services/api format:check
git diff --check
```

Expected: every command exits with code zero.

- [ ] **Step 2: Start the required local services**

Run each command in its own terminal after the Auth0, database, and API
environment values in `.env` are configured:

```powershell
docker compose up -d postgres
pnpm run dev:api
pnpm run dev:web
```

Expected: NestJS listens on `http://localhost:3001`; Next.js listens on
`http://localhost:3000`.

- [ ] **Step 3: Verify a successful signed-in boundary call**

In a browser, open `http://localhost:3000`, sign in through Auth0, and wait
for the authenticated page to show `Connected as <email>`. In the browser
network tools, inspect the `POST http://localhost:3001/v1/session/sync`
request and confirm:

```text
Request method: POST
Request header: authorization: Bearer [redacted by the browser tools]
Response status: 201 or 200
```

Confirm that the request is not blocked by CORS and that no token is visible
in the application page, console logs, or React-rendered UI.

- [ ] **Step 4: Verify the retryable failure state**

Stop the API development service, reload `http://localhost:3000` while still
signed in, and confirm the page displays:

```text
Bookwise could not connect. Please try again.
Retry
```

Restart `pnpm run dev:api`, select `Retry`, and confirm the state changes to
`Connected as <email>` without another Auth0 sign-in.

- [ ] **Step 5: Inspect the final worktree**

Run:

```powershell
git status --short
git diff --check
```

Expected: no whitespace errors. Do not stage or alter the pre-existing
unrelated `README.md`, `apps/web/next-env.d.ts`,
`docs/project-timeline.md`,
`docs/superpowers/plans/2026-08-14-private-uploads-library-auth0-plan.md`,
or `.vscode/` changes.
