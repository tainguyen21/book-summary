"use client";

import { useAuth0 } from "@auth0/auth0-react";

export function AccountMenu({ email }: { email: string }) {
  const { logout } = useAuth0();

  return (
    <div>
      <span>{email}</span>
      <button
        type="button"
        onClick={() =>
          logout({ logoutParams: { returnTo: "http://localhost:3000" } })
        }
      >
        Sign out
      </button>
    </div>
  );
}
