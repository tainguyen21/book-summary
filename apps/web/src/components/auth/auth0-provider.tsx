"use client";

import { Auth0Provider } from "@auth0/auth0-react";
import type { ReactNode } from "react";

export function BookwiseAuth0Provider({ children }: { children: ReactNode }) {
  return (
    <Auth0Provider
      domain="dev-p8c5tpe1ghv8qtxf.us.auth0.com"
      clientId="U3USwzKKexcx7Y2FkWVTRznXrK7dTdaq"
      authorizationParams={{
        audience: "https://api.bookwise.local",
        redirect_uri: "http://localhost:3000",
      }}
    >
      {children}
    </Auth0Provider>
  );
}
