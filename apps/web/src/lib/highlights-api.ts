"use client";

import { z } from "zod";

import { bookwiseApi, bookwiseSend, type GetAccessTokenSilently } from "./bookwise-api";

const highlightSchema = z.object({
  id: z.string(),
  summaryId: z.string(),
  paragraph: z.number(),
  sentence: z.number(),
  text: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Highlight = z.infer<typeof highlightSchema>;

export async function loadHighlights(getToken: GetAccessTokenSilently, bookId: string) {
  const { highlights } = await bookwiseApi(
    getToken,
    `/v1/books/${bookId}/highlights`,
    { method: "GET" },
    z.object({ highlights: z.array(highlightSchema) }),
  );
  return highlights;
}

/** Highlights a sentence of the current summary, or updates its note. */
export async function saveHighlight(
  getToken: GetAccessTokenSilently,
  bookId: string,
  input: { summaryId: string; paragraph: number; sentence: number; note?: string },
): Promise<Highlight> {
  const body = await bookwiseSend(getToken, `/v1/books/${bookId}/highlights`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return highlightSchema.parse(body);
}

export async function removeHighlight(getToken: GetAccessTokenSilently, highlightId: string) {
  await bookwiseSend(getToken, `/v1/highlights/${highlightId}`, { method: "DELETE" });
}
