"use client";

import { Auth0Provider, type AppState } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { publicAuth0Config } from "../../lib/auth0-config";

export function BookwiseAuth0Provider({ children }: { children: ReactNode }) {
  const router = useRouter();

  // Auth0 always returns to the configured origin; route the user on to the
  // page that started sign-in (the library by default).
  const onRedirectCallback = (appState?: AppState) => {
    router.replace(appState?.returnTo ?? "/library");
  };

  return (
    <Auth0Provider
      domain={publicAuth0Config.NEXT_PUBLIC_AUTH0_DOMAIN}
      clientId={publicAuth0Config.NEXT_PUBLIC_AUTH0_CLIENT_ID}
      authorizationParams={{
        audience: publicAuth0Config.NEXT_PUBLIC_AUTH0_AUDIENCE,
        redirect_uri: publicAuth0Config.NEXT_PUBLIC_AUTH0_REDIRECT_URI,
      }}
      onRedirectCallback={onRedirectCallback}
    >
      {children}
    </Auth0Provider>
  );
}
