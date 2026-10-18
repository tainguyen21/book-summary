"use client";

import { z } from "zod";

import { bookwiseApi, bookwiseSend, type GetAccessTokenSilently } from "./bookwise-api";

const flashcardSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  bookTitle: z.string(),
  front: z.string(),
  back: z.string(),
  sourceSpanIds: z.array(z.string()),
  due: z.string(),
  state: z.number(),
  reps: z.number(),
});

export type Flashcard = z.infer<typeof flashcardSchema>;
/** FSRS ratings: Again, Hard, Good, Easy. */
export type ReviewRating = 1 | 2 | 3 | 4;

const deckSchema = z.object({ cards: z.array(flashcardSchema) });
const dueSchema = z.object({ dueCount: z.number(), cards: z.array(flashcardSchema) });

export function loadBookDeck(getToken: GetAccessTokenSilently, bookId: string) {
  return bookwiseApi(getToken, `/v1/books/${bookId}/flashcards`, { method: "GET" }, deckSchema);
}

/** Makes (or remakes) a book's deck; spends tokens under the daily budget. */
export async function makeBookDeck(getToken: GetAccessTokenSilently, bookId: string): Promise<Flashcard[]> {
  const body = await bookwiseSend(getToken, `/v1/books/${bookId}/flashcards`, { method: "POST" });
  return deckSchema.parse(body).cards;
}

export function loadDueCards(getToken: GetAccessTokenSilently) {
  return bookwiseApi(getToken, "/v1/flashcards/due", { method: "GET" }, dueSchema);
}

export async function reviewCard(getToken: GetAccessTokenSilently, cardId: string, rating: ReviewRating) {
  await bookwiseSend(getToken, `/v1/flashcards/${cardId}/review`, {
    method: "POST",
    body: JSON.stringify({ rating }),
  });
}
