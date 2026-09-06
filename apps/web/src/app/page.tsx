"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { AccountMenu } from "../components/auth/account-menu";
import { SessionSyncStatus } from "../components/auth/session-sync-status";
import { LibraryScreen } from "../components/library/library-screen";

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
      <SessionSyncStatus
        key={user?.sub ?? email}
        identityKey={user?.sub ?? email}
      />
      <LibraryScreen />
    </main>
  );
}
