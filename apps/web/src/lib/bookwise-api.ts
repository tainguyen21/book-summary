"use client";

import type { Auth0ContextInterface, User } from "@auth0/auth0-react";
import { z } from "zod";

import { publicConfig } from "./config";

const bookwisePrincipalSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  isAdmin: z.boolean(),
});

export type BookwisePrincipal = z.infer<typeof bookwisePrincipalSchema>;
export type GetAccessTokenSilently =
  Auth0ContextInterface<User>["getAccessTokenSilently"];

export class BookwiseConnectionError extends Error {
  constructor() {
    super("Bookwise could not connect. Please try again.");
    this.name = "BookwiseConnectionError";
  }
}

export async function syncBookwiseIdentity(
  getAccessTokenSilently: GetAccessTokenSilently,
): Promise<BookwisePrincipal> {
  const token = await getAccessTokenSilently();
  const response = await fetch(
    new URL("/v1/session/sync", publicConfig.NEXT_PUBLIC_API_URL),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new BookwiseConnectionError();
  }

  const principal = bookwisePrincipalSchema.safeParse(
    await response.json().catch(() => undefined),
  );

  if (!principal.success) {
    throw new BookwiseConnectionError();
  }

  return principal.data;
}
