"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

import { isActive } from "../../lib/book-status";
import { bookwiseApi } from "../../lib/bookwise-api";
import {
  bookProcessingStatusSchema,
  libraryBookSchema,
  type BookProcessingStatus,
  type LibraryBook,
} from "../../lib/library-types";

const libraryBooksSchema = z.array(libraryBookSchema);
const pollIntervalMs = 5000;

export type LibraryState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; books: LibraryBook[] };

function mergeProcessingStatus(
  book: LibraryBook,
  status: BookProcessingStatus,
): LibraryBook {
  return {
    ...book,
    bookStatus: status.bookStatus,
    commandStatus: status.commandStatus,
    runStatus: status.runStatus,
    latestEventAt: status.latestEventAt,
  };
}

/**
 * Loads the signed-in user's books and keeps active ones fresh by polling
 * their processing status while the tab is visible.
 */
export function useLibraryBooks() {
  const { getAccessTokenSilently } = useAuth0();
  const [state, setState] = useState<LibraryState>({ kind: "loading" });

  const activeBookIdsKey =
    state.kind === "ready"
      ? state.books
          .filter(isActive)
          .map((book) => book.id)
          .sort()
          .join(",")
      : "";

  const requestLibrary = useCallback(async (): Promise<LibraryState> => {
    try {
      const books = await bookwiseApi(
        getAccessTokenSilently,
        "/v1/books",
        { method: "GET" },
        libraryBooksSchema,
      );

      return { kind: "ready", books };
    } catch {
      return { kind: "error" };
    }
  }, [getAccessTokenSilently]);

  /** Shows the loading state again; used by explicit retries. */
  const reload = useCallback(() => {
    setState({ kind: "loading" });
    void requestLibrary().then(setState);
  }, [requestLibrary]);

  /** Refetches quietly in the background, keeping current content on screen. */
  const refresh = useCallback(async () => {
    const next = await requestLibrary();

    setState((current) =>
      next.kind === "error" && current.kind === "ready" ? current : next,
    );
  }, [requestLibrary]);

  useEffect(() => {
    let active = true;

    void requestLibrary().then((next) => {
      if (active) {
        setState(next);
      }
    });

    return () => {
      active = false;
    };
  }, [requestLibrary]);

  useEffect(() => {
    if (!activeBookIdsKey) {
      return;
    }

    const bookIds = activeBookIdsKey.split(",");
    let active = true;

    const poll = () => {
      if (document.hidden) {
        return;
      }

      void Promise.all(
        bookIds.map((bookId) =>
          bookwiseApi(
            getAccessTokenSilently,
            `/v1/books/${bookId}/processing`,
            { method: "GET" },
            bookProcessingStatusSchema,
          ).catch(() => undefined),
        ),
      ).then((statuses) => {
        if (!active) {
          return;
        }

        const byBookId = new Map(
          statuses
            .filter((status): status is BookProcessingStatus => Boolean(status))
            .map((status) => [status.bookId, status]),
        );

        if (byBookId.size === 0) {
          return;
        }

        setState((current) =>
          current.kind === "ready"
            ? {
                kind: "ready",
                books: current.books.map((book) => {
                  const status = byBookId.get(book.id);

                  return status ? mergeProcessingStatus(book, status) : book;
                }),
              }
            : current,
        );
      });
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        poll();
      }
    };

    poll();
    const interval = window.setInterval(poll, pollIntervalMs);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeBookIdsKey, getAccessTokenSilently]);

  return { state, reload, refresh };
}
