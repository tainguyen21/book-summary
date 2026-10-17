"use client";

import { bookwiseSend, type GetAccessTokenSilently } from "./bookwise-api";

/** Owner actions on an existing book; each resolves once the API accepted it. */
export async function renameBook(
  getToken: GetAccessTokenSilently,
  bookId: string,
  title: string,
): Promise<void> {
  await bookwiseSend(getToken, `/v1/books/${bookId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteBook(
  getToken: GetAccessTokenSilently,
  bookId: string,
): Promise<void> {
  await bookwiseSend(getToken, `/v1/books/${bookId}`, { method: "DELETE" });
}

export async function retryBook(
  getToken: GetAccessTokenSilently,
  bookId: string,
): Promise<void> {
  await bookwiseSend(getToken, `/v1/books/${bookId}/retry`, { method: "POST" });
}

export async function clearIncompleteUploads(
  getToken: GetAccessTokenSilently,
): Promise<number> {
  const result = await bookwiseSend(getToken, "/v1/books/incomplete", {
    method: "DELETE",
  });

  return result && typeof result === "object" && "deleted" in result && typeof result.deleted === "number"
    ? result.deleted
    : 0;
}

export const MAX_TITLE_LENGTH = 500;
