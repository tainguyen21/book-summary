"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { LogOut } from "lucide-react";

import { SessionSyncStatus } from "./session-sync-status";

export function accountIdentity(user?: { email?: string; name?: string; sub?: string }) {
  const email = user?.email?.trim() || "";
  const name = user?.name && user.name !== email ? user.name.trim() : "";

  return {
    email: email || name || "Signed in",
    name,
    initial: (name || email || "?").charAt(0).toUpperCase(),
    key: user?.sub ?? email,
  };
}

function signOut(logout: ReturnType<typeof useAuth0>["logout"]) {
  void logout({ logoutParams: { returnTo: window.location.origin } });
}

/** Sidebar account block: identity, account-sync state, and sign out. */
export function AccountMenu() {
  const { logout, user } = useAuth0();
  const identity = accountIdentity(user);

  return (
    <div className="shell-account">
      <span className="avatar" aria-hidden="true">
        {identity.initial}
      </span>
      <div className="shell-account-text">
        <b>{identity.name || identity.email}</b>
        <SessionSyncStatus key={identity.key} identityKey={identity.key} />
      </div>
      <button
        className="button button-ghost icon-button button-sm"
        type="button"
        onClick={() => signOut(logout)}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

/** Compact sign-out control for the mobile top bar. */
export function CompactAccountMenu() {
  const { logout, user } = useAuth0();
  const identity = accountIdentity(user);

  return (
    <button
      className="shell-avatar-button"
      type="button"
      onClick={() => signOut(logout)}
      aria-label={`Sign out ${identity.email}`}
      title={`Signed in as ${identity.email} — sign out`}
    >
      <span className="avatar" aria-hidden="true">
        {identity.initial}
      </span>
    </button>
  );
}
