import { Auth0Client } from "@auth0/nextjs-auth0/server";

const audience = process.env.AUTH0_AUDIENCE;

if (!audience) {
  throw new Error("AUTH0_AUDIENCE must be configured.");
}

export const auth0 = new Auth0Client({
  authorizationParameters: { audience },
  enableAccessTokenEndpoint: false,
});
