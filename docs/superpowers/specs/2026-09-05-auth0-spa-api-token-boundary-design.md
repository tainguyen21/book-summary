# Auth0 SPA API Token Boundary Design

## Purpose

Establish the first authenticated browser-to-NestJS integration for the Auth0
React single-page application. A signed-in Bookwise user must obtain an Auth0
API access token in the browser, use it to call the NestJS identity-sync
endpoint, and see a compact connection state in the web app.

This delivery does not implement uploads, storage, library reads, or
processing-status views.

## Scope

The web application will:

- Add a client-only helper for authenticated requests to NestJS.
- Obtain tokens through Auth0 React SDK `getAccessTokenSilently`.
- Forward the token only in a `Bearer` authorization header to the configured
  `NEXT_PUBLIC_API_URL`.
- Synchronize the signed-in Auth0 identity with `POST /v1/session/sync`.
- Render connecting, connected, and retryable error states on the
  authenticated home page.

NestJS retains its existing `SessionController`, token verifier, identity
synchronization use case, and authenticated principal guard. The application
bootstrap adds a narrow CORS policy so the local SPA can reach that established
boundary:

- Allow only origin `http://localhost:3000`.
- Allow only `POST` and `OPTIONS` methods.
- Allow only `authorization` and `content-type` request headers.
- Do not allow credentials or use a wildcard origin.

## Architecture

`HomePage` continues to own Auth0 session presentation through `useAuth0`.
When `isAuthenticated` becomes true, it renders a focused client component
for connection status.

The connection-status component receives the Auth0 SDK
`getAccessTokenSilently` callback. It invokes the client-only Bookwise API
helper, which:

1. Obtains an access token from the Auth0 React SDK.
2. Builds a request against `publicConfig.NEXT_PUBLIC_API_URL`.
3. Adds `Authorization: Bearer <token>`.
4. Sends `POST /v1/session/sync`.
5. Returns the parsed application principal on a successful response.

The access token remains in the Auth0 SDK and request headers only. It is not
rendered, logged, stored, included in state, or sent to a Next.js route
handler.

Because the local SPA and API use different origins, the browser preflights
the bearer-token request. The NestJS CORS policy permits that preflight without
weakening the API to arbitrary origins or headers.

## User Experience

After authentication, the account area displays one small state:

- `Connecting Bookwise...` while identity synchronization is in flight.
- `Connected as <email>` after NestJS verifies the token and returns the
  application principal.
- A concise connection failure message and a `Retry` command when token
  acquisition, network access, or the API request fails.

The component synchronizes once per authenticated identity and retries only
when the user explicitly selects `Retry`. Signing out unmounts the component
and clears its local state.

## Error Handling

Token-acquisition errors and HTTP or network failures are handled as
connection failures. The UI does not expose raw authorization headers, token
values, exception stacks, or unknown API response bodies.

The API helper accepts only successful JSON responses as principals. Failed,
empty, malformed, or non-JSON responses produce a safe generic error unless
the API supplies a suitable public error message.

## Verification

No automated tests are added or changed, following the project guidance.

Verification consists of:

1. Web lint and production build.
2. API lint, build, and formatting check.
3. A manual local sign-in with the configured Auth0 SPA and API audience,
   confirming that the authenticated home page reaches `Connected as <email>`.
4. A manual retry check after a deliberately unavailable API service,
   confirming a safe error state with no token disclosure.
