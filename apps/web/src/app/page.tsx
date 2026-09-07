"use client";

import { useAuth0 } from "@auth0/auth0-react";
import {
  ArrowRight,
  BookOpen,
  CircleAlert,
  LoaderCircle,
  LogIn,
  UserPlus,
} from "lucide-react";
import { AccountMenu } from "../components/auth/account-menu";
import { SessionSyncStatus } from "../components/auth/session-sync-status";
import { LibraryScreen } from "../components/library/library-screen";

export default function HomePage() {
  const { error, isAuthenticated, isLoading, loginWithRedirect, user } =
    useAuth0();

  if (isLoading) {
    return (
      <main className="app-shell auth-shell">
        <p className="auth-loading" role="status">
          <LoaderCircle className="spin" aria-hidden="true" size={20} />
          Opening your library
        </p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="app-shell auth-shell">
        <header className="app-header">
          <div className="brand-lockup">
            <BookOpen aria-hidden="true" size={22} />
            <span>Bookwise</span>
          </div>
          <span className="app-context">Private library</span>
        </header>

        <section className="auth-content" aria-labelledby="welcome-title">
          <p className="eyebrow">Your reading workspace</p>
          <h1 id="welcome-title">A private place for your books.</h1>
          <p className="auth-lede">
            Sign in to upload, organize, and follow the processing status of
            your library.
          </p>

          <div className="auth-actions">
            <button
              className="primary-button auth-primary-action"
              type="button"
              onClick={() => loginWithRedirect()}
            >
              <LogIn aria-hidden="true" size={18} />
              Sign in
              <ArrowRight aria-hidden="true" size={17} />
            </button>
            <button
              className="secondary-button auth-secondary-action"
              type="button"
              onClick={() =>
                loginWithRedirect({
                  authorizationParams: { screen_hint: "signup" },
                })
              }
            >
              <UserPlus aria-hidden="true" size={18} />
              Create account
            </button>
          </div>

          {error && (
            <div className="auth-error" role="alert">
              <CircleAlert aria-hidden="true" size={18} />
              <div>
                <strong>Sign-in could not be completed.</strong>
                <span>Check your account access and try again.</span>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  const email = user?.email?.trim() || user?.name || "Signed in user";

  return (
    <main className="app-shell library-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <BookOpen aria-hidden="true" size={22} />
          <span>Bookwise</span>
        </div>
        <AccountMenu email={email} />
      </header>
      <div className="library-page-heading">
        <h1>Your library</h1>
        <SessionSyncStatus
          key={user?.sub ?? email}
          identityKey={user?.sub ?? email}
        />
      </div>
      <LibraryScreen />
    </main>
  );
}
