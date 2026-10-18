"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { Languages, LogOut } from "lucide-react";

import { setLocale, useLocale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { accountMessages } from "../../lib/i18n/messages/account";
import { SessionSyncStatus } from "./session-sync-status";

export function accountIdentity(
  user?: { email?: string; name?: string; sub?: string },
  signedIn = "Signed in",
) {
  const email = user?.email?.trim() || "";
  const name = user?.name && user.name !== email ? user.name.trim() : "";

  return {
    email: email || name || signedIn,
    name,
    initial: (name || email || "?").charAt(0).toUpperCase(),
    key: user?.sub ?? email,
  };
}

function signOut(logout: ReturnType<typeof useAuth0>["logout"]) {
  void logout({ logoutParams: { returnTo: window.location.origin } });
}

/** Switches the interface between English and Vietnamese. */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const t = useMessages(accountMessages);

  return (
    <button
      className={compact ? "button button-ghost icon-button button-sm" : "shell-language"}
      type="button"
      lang={locale === "en" ? "vi" : "en"}
      onClick={() => setLocale(locale === "en" ? "vi" : "en")}
      aria-label={t.switchLanguageLabel}
      title={t.switchLanguageLabel}
    >
      <Languages aria-hidden="true" size={compact ? 16 : 15} />
      {!compact && t.switchLanguage}
    </button>
  );
}

/** Sidebar account block: identity, account-sync state, and sign out. */
export function AccountMenu() {
  const { logout, user } = useAuth0();
  const t = useMessages(accountMessages);
  const identity = accountIdentity(user, t.signedIn);

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
        aria-label={t.signOut}
        title={t.signOut}
      >
        <LogOut aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

/** Compact sign-out control for the mobile top bar. */
export function CompactAccountMenu() {
  const { logout, user } = useAuth0();
  const t = useMessages(accountMessages);
  const identity = accountIdentity(user, t.signedIn);

  return (
    <button
      className="shell-avatar-button"
      type="button"
      onClick={() => signOut(logout)}
      aria-label={t.signOutAccount(identity.email)}
      title={t.signedInAs(identity.email)}
    >
      <span className="avatar" aria-hidden="true">
        {identity.initial}
      </span>
    </button>
  );
}
