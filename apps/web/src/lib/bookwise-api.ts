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

/** A rejected request, with the API's user-facing message when it sent one. */
export class BookwiseRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BookwiseRequestError";
  }
}

/**
 * Sends a request that may return no body (for example 204 No Content).
 * Errors carry the API's message so actions can explain a 409.
 */
export async function bookwiseSend(
  getAccessTokenSilently: GetAccessTokenSilently,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const token = await getAccessTokenSilently();
  const { publicConfig } = await import("./config");
  const headers = new Headers(init.headers);

  headers.set("authorization", `Bearer ${token}`);
  if (init.body) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, publicConfig.NEXT_PUBLIC_API_URL), {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new BookwiseConnectionError();
  }

  const body: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : "Something went wrong. Please try again.";
    throw new BookwiseRequestError(response.status, message);
  }

  return body;
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
