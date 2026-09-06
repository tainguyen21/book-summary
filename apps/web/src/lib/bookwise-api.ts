"use client";

import type { Auth0ContextInterface, User } from "@auth0/auth0-react";
import { z } from "zod";

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

export async function bookwiseApi<T>(
  getAccessTokenSilently: GetAccessTokenSilently,
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const token = await getAccessTokenSilently();
  const { publicConfig } = await import("./config");
  const headers = new Headers(init.headers);

  headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(
    new URL(path, publicConfig.NEXT_PUBLIC_API_URL),
    {
      ...init,
      headers,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new BookwiseConnectionError();
  }

  const result = schema.safeParse(
    await response.json().catch(() => undefined),
  );

  if (!result.success) {
    throw new BookwiseConnectionError();
  }

  return result.data;
}

export async function syncBookwiseIdentity(
  getAccessTokenSilently: GetAccessTokenSilently,
): Promise<BookwisePrincipal> {
  return bookwiseApi(
    getAccessTokenSilently,
    "/v1/session/sync",
    { method: "POST" },
    bookwisePrincipalSchema,
  );
}
