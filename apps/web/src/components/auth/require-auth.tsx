"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { BookOpen, CircleAlert, LogIn } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import "../app-shell/app-shell.css";

/**
 * Renders children only for signed-in users. While Auth0 resolves, it shows
 * the caller's skeleton in the final layout, so nothing jumps on load.
 */
export function RequireAuth({
  skeleton,
  children,
}: {
  skeleton: ReactNode;
  children: ReactNode;
}) {
  const { error, isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  if (isLoading) {
    return skeleton;
  }

  if (isAuthenticated) {
    return children;
  }

  return (
    <main id="main" className="auth-gate">
      <div className="auth-gate-card">
        <Link className="shell-brand" href="/">
          <span className="shell-mark" aria-hidden="true">
            <BookOpen size={15} strokeWidth={2.2} />
          </span>
          Bookwise
        </Link>
        <h1>Sign in to your library</h1>
        <p>Your books and summaries are private to your account.</p>
        {error && (
          <p className="auth-gate-error" role="alert">
            <CircleAlert aria-hidden="true" size={16} />
            Sign-in couldn’t be completed. Please try again.
          </p>
        )}
        <button
          className="button button-ink button-lg"
          type="button"
          onClick={() =>
            loginWithRedirect({
              appState: {
                returnTo: window.location.pathname + window.location.search,
              },
            })
          }
        >
          <LogIn aria-hidden="true" size={18} />
          Sign in
        </button>
        <Link className="auth-gate-back" href="/">
          Learn about Bookwise
        </Link>
      </div>
    </main>
  );
}
