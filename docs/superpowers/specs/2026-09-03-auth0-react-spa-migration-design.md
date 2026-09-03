# Auth0 React SPA Migration Design

## Purpose

Replace the web application's server-session Auth0 integration with the
official Auth0 React SDK. The current Auth0 application is configured as a
single-page application, so authentication must run in the browser rather than
through the server-oriented `@auth0/nextjs-auth0` SDK.

## Architecture

- Install `@auth0/auth0-react@2.x` in `apps/web` and remove
  `@auth0/nextjs-auth0`.
- Add a small client-side provider component that configures `Auth0Provider`
  with:
  - domain `dev-p8c5tpe1ghv8qtxf.us.auth0.com`
  - client ID `U3USwzKKexcx7Y2FkWVTRznXrK7dTdaq`
  - redirect URI `http://localhost:3000`
  - existing API audience `https://api.bookwise.local`
- Render the provider from the server root layout. The provider itself forms
  the client boundary, so browser-only Auth0 state and APIs stay out of
  server-rendered modules.
- Convert the home page and account menu to client components using
  `useAuth0`.
- Use the SDK's `loginWithRedirect` for sign-in and sign-up, and its `logout`
  method with `http://localhost:3000` as the return URL.
- Remove the server Auth0 client and Next.js Proxy because they depend on
  server-managed sessions and a confidential-client configuration.

## User Experience

The page presents a loading state while the SDK restores authentication state.
Unauthenticated visitors can sign in or sign up through Auth0 Universal Login.
Authenticated visitors see their email and can sign out.

## Configuration And Runtime

The web development script will explicitly use port `3000`, matching the
configured Auth0 callback URL, logout URL, and web origin. This is a Next.js
application rather than Vite, so Vite's `--strictPort` option does not apply.

No server component or server module will access `window` or other browser
objects. The configured redirect and logout return URLs are static strings.

## Verification

Run the web lint and production build after the migration. No new automated
tests will be created or modified because the repository guidance prohibits
new test work unless explicitly requested.
