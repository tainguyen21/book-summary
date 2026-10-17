"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

type Placement = "nav" | "hero" | "cta";

/**
 * Sign-in calls to action that switch to "Open library" for signed-in users.
 * Server-rendered as the signed-out variant so crawlers see real links.
 */
export function LandingAuthActions({ placement }: { placement: Placement }) {
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const signIn = () =>
    loginWithRedirect({ appState: { returnTo: "/library" } });
  const signUp = () =>
    loginWithRedirect({
      appState: { returnTo: "/library" },
      authorizationParams: { screen_hint: "signup" },
    });

  if (isAuthenticated) {
    return (
      <Link
        className={
          placement === "nav"
            ? "lp-btn lp-btn-light lp-btn-sm"
            : "lp-btn lp-btn-light lp-btn-lg"
        }
        href="/library"
      >
        Open your library
        <ArrowRight aria-hidden="true" size={16} />
      </Link>
    );
  }

  if (placement === "nav") {
    return (
      <div className="lp-nav-actions">
        <button className="lp-btn lp-btn-ghost lp-btn-sm" type="button" onClick={signIn}>
          Sign in
        </button>
        <button className="lp-btn lp-btn-light lp-btn-sm" type="button" onClick={signUp}>
          Get started
        </button>
      </div>
    );
  }

  if (placement === "cta") {
    return (
      <button className="lp-btn lp-btn-light lp-btn-lg" type="button" onClick={signUp}>
        Get started — it’s free
      </button>
    );
  }

  return (
    <div className="lp-ctas">
      <button className="lp-btn lp-btn-light lp-btn-lg" type="button" onClick={signUp}>
        Start your library
        <ArrowRight aria-hidden="true" size={16} />
      </button>
      <a className="lp-btn lp-btn-glass lp-btn-lg" href="#how-it-works">
        See how it works
      </a>
    </div>
  );
}
