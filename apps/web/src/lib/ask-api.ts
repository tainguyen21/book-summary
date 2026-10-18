"use client";

import { readEventStream } from "./event-stream";
import {
  BookwiseConnectionError,
  BookwiseRequestError,
  type GetAccessTokenSilently,
} from "./bookwise-api";

export interface AnswerSource {
  n: number;
  /** Absent only in answers cached before library answers existed. */
  bookId?: string;
  bookTitle?: string;
  sourceSpanId: string;
  location: Record<string, unknown>;
  quote?: string;
}

export type AskEvent =
  | { event: "sources"; data: { sources: AnswerSource[] } }
  | { event: "delta"; data: { text: string } }
  | { event: "done"; data: { answered: boolean; cached: boolean; markerQuotes: (string | null)[] } }
  | { event: "error"; data: { code: "budget" | "unavailable"; message: string } };

/**
 * Streams an answer from an ask endpoint (`/v1/books/:bookId/ask` or
 * `/v1/ask`) as server-sent events, calling `onEvent` for each as it arrives.
 */
export async function askQuestion(
  getAccessTokenSilently: GetAccessTokenSilently,
  askPath: string,
  question: string,
  onEvent: (event: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await getAccessTokenSilently();
  const { publicConfig } = await import("./config");

  let response: Response;
  try {
    response = await fetch(new URL(askPath, publicConfig.NEXT_PUBLIC_API_URL), {
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

  await readEventStream(response.body, (event, data) => onEvent({ event, data } as AskEvent));
}
