"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

import { bookwiseApi } from "../../lib/bookwise-api";
import {
  bookProcessingStatusSchema,
  libraryBookSchema,
  type BookProcessingStatus,
  type LibraryBook,
} from "../../lib/library-types";
import { UploadDialog } from "./upload-dialog";

const libraryBooksSchema = z.array(libraryBookSchema);

const statusLabels: Record<string, string> = {
  pending_upload: "Ready to upload",
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  running: "Processing",
  retryable_failed: "Failed",
  permanent_failed: "Failed",
  needs_review: "Needs review",
};

type LibraryState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; books: LibraryBook[] };

function isPollingBook(book: LibraryBook): boolean {
  return ["queued", "processing", "running"].includes(
    book.commandStatus ?? book.bookStatus,
  );
}

function statusLabel(book: LibraryBook): string {
  const status = book.commandStatus ?? book.bookStatus;

  return statusLabels[status] ?? status;
}

function createdAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function mergeProcessingStatus(
  book: LibraryBook,
  status: BookProcessingStatus,
): LibraryBook {
  return {
    ...book,
    bookStatus: status.bookStatus,
    ...(status.commandStatus !== undefined
      ? { commandStatus: status.commandStatus }
      : {}),
  };
}

export function LibraryScreen() {
  const { getAccessTokenSilently } = useAuth0();
  const [state, setState] = useState<LibraryState>({ kind: "loading" });
  const [uploadOpen, setUploadOpen] = useState(false);

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

  const refreshLibrary = useCallback(() => {
    setState({ kind: "loading" });
    void requestLibrary().then(setState);
  }, [requestLibrary]);

  useEffect(() => {
    let active = true;

    void requestLibrary().then((nextState) => {
      if (active) {
        setState(nextState);
      }
    });

    return () => {
      active = false;
    };
  }, [requestLibrary]);

  useEffect(() => {
    if (state.kind !== "ready") {
      return;
    }

    const bookIds = state.books.filter(isPollingBook).map((book) => book.id);

    if (bookIds.length === 0) {
      return;
    }

    let active = true;

    const poll = () => {
      if (document.hidden) {
        return;
      }

      void Promise.all(
        bookIds.map(async (bookId) => {
          try {
            return await bookwiseApi(
              getAccessTokenSilently,
              `/v1/books/${bookId}/processing`,
              { method: "GET" },
              bookProcessingStatusSchema,
            );
          } catch {
            return undefined;
          }
        }),
      ).then((statuses) => {
        if (!active) {
          return;
        }

        const byBookId = new Map(
          statuses
            .filter(
              (status): status is BookProcessingStatus => status !== undefined,
            )
            .map((status) => [status.bookId, status]),
        );

        if (byBookId.size === 0) {
          return;
        }

        setState((current) => {
          if (current.kind !== "ready") {
            return current;
          }

          return {
            kind: "ready",
            books: current.books.map((book) => {
              const status = byBookId.get(book.id);

              return status ? mergeProcessingStatus(book, status) : book;
            }),
          };
        });
      });
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        poll();
      }
    };

    poll();
    const interval = window.setInterval(poll, 5000);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [getAccessTokenSilently, state]);

  async function refreshAfterUpload(): Promise<void> {
    setState(await requestLibrary());
  }

  return (
    <section className="library" aria-labelledby="library-title">
      <div className="library-toolbar">
        <div>
          <p className="eyebrow">Private library</p>
          <h2 id="library-title">Books</h2>
        </div>
        <div className="library-actions">
          <button
            className="icon-button"
            type="button"
            onClick={refreshLibrary}
            title="Refresh library"
            aria-label="Refresh library"
          >
            <RefreshCw aria-hidden="true" size={18} />
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => setUploadOpen(true)}
          >
            <Upload aria-hidden="true" size={18} />
            Upload book
          </button>
        </div>
      </div>

      {state.kind === "loading" && (
        <p className="library-message" role="status">
          Loading your library...
        </p>
      )}

      {state.kind === "error" && (
        <div className="library-message library-error" role="alert">
          <p>Bookwise could not load your library.</p>
          <button className="secondary-button" type="button" onClick={refreshLibrary}>
            Retry
          </button>
        </div>
      )}

      {state.kind === "ready" && state.books.length === 0 && (
        <div className="library-empty">
          <p>Your library is empty.</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => setUploadOpen(true)}
          >
            <Upload aria-hidden="true" size={18} />
            Upload book
          </button>
        </div>
      )}

      {state.kind === "ready" && state.books.length > 0 && (
        <ul className="book-list" aria-label="Your books">
          {state.books.map((book) => (
            <li className="book-row" key={book.id}>
              <div className="book-details">
                <strong>{book.title}</strong>
                <span>{book.filename}</span>
              </div>
              <div className="book-meta">
                <span>{createdAt(book.createdAt)}</span>
                <span className={`status status-${book.commandStatus ?? book.bookStatus}`}>
                  {statusLabel(book)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onComplete={refreshAfterUpload}
        />
      )}
    </section>
  );
}
