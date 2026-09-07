"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { LogOut } from "lucide-react";

export function AccountMenu({ email }: { email: string }) {
  const { logout } = useAuth0();

  return (
    <div className="account-menu">
      <span className="account-email" title={email}>
        {email}
      </span>
      <button
        className="icon-button"
        type="button"
        onClick={() =>
          logout({ logoutParams: { returnTo: window.location.origin } })
        }
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut aria-hidden="true" size={18} />
      </button>
    </div>
  );
}
