"use client";

import {
  BookwiseConnectionError,
  BookwiseRequestError,
  type GetAccessTokenSilently,
} from "./bookwise-api";

export interface AnswerSource {
  n: number;
  sourceSpanId: string;
  location: Record<string, unknown>;
  quote?: string;
}

export type AskEvent =
  | { event: "sources"; data: { sources: AnswerSource[] } }
  | { event: "delta"; data: { text: string } }
  | { event: "done"; data: { answered: boolean; cached: boolean } }
  | { event: "error"; data: { code: "budget" | "unavailable"; message: string } };

/**
 * Streams an answer from `POST /v1/books/:bookId/ask` (server-sent events),
 * calling `onEvent` for each event as it arrives.
 */
export async function askBook(
  getAccessTokenSilently: GetAccessTokenSilently,
  bookId: string,
  question: string,
  onEvent: (event: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await getAccessTokenSilently();
  const { publicConfig } = await import("./config");

  let response: Response;
  try {
    response = await fetch(new URL(`/v1/books/${bookId}/ask`, publicConfig.NEXT_PUBLIC_API_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ question }),
      cache: "no-store",
      signal,
    });
  } catch {
    throw new BookwiseConnectionError();
  }

  if (!response.ok || !response.body) {
    const body: unknown = await response.json().catch(() => undefined);
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : "Something went wrong. Please try again.";
    throw new BookwiseRequestError(response.status, message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (event && data) {
        onEvent({ event, data: JSON.parse(data) } as AskEvent);
      }
    }
  }
}
