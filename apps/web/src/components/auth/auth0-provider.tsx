"use client";

import { Auth0Provider } from "@auth0/auth0-react";
import type { ReactNode } from "react";

import { publicAuth0Config } from "../../lib/auth0-config";

export function BookwiseAuth0Provider({ children }: { children: ReactNode }) {
  return (
    <Auth0Provider
      domain={publicAuth0Config.NEXT_PUBLIC_AUTH0_DOMAIN}
      clientId={publicAuth0Config.NEXT_PUBLIC_AUTH0_CLIENT_ID}
      authorizationParams={{
        audience: publicAuth0Config.NEXT_PUBLIC_AUTH0_AUDIENCE,
        redirect_uri: publicAuth0Config.NEXT_PUBLIC_AUTH0_REDIRECT_URI,
      }}
    >
      {children}
    </Auth0Provider>
  );
}
