"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { BookOpen, CircleAlert, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AccountMenu } from "../auth/account-menu";
import { bookwiseApi } from "../../lib/bookwise-api";
import {
  bookProcessingStatusSchema,
  bookSummarySchema,
  type BookProcessingStatus,
  type BookSummary,
} from "../../lib/library-types";

type DetailState =
  | { kind: "loading" }
  | { kind: "processing"; status: BookProcessingStatus }
  | { kind: "ready"; summary: BookSummary }
  | { kind: "failed"; status: BookProcessingStatus }
  | { kind: "unavailable" }
  | { kind: "error" };

interface BookDetailScreenProps {
  bookId: string;
}

function statusLabel(status: BookProcessingStatus): string {
  if (status.runStatus === "running") {
    return "Processing";
  }

  if (status.runStatus === "retryable_failed") {
    return "Processing will retry";
  }

  if (status.runStatus === "permanent_failed") {
    return "Processing failed";
  }

  return "Waiting to process";
}

function locationLabel(location: Record<string, unknown>): string {
  const parts = Object.entries(location)
    .filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === "string" ||
        typeof entry[1] === "number" ||
        typeof entry[1] === "boolean",
    )
    .map(([key, value]) => `${key}: ${value}`);

  return parts.join(" | ") || "Source location available";
}

function summaryParagraphs(body: string): string[] {
  return body.split(/\n\s*\n/).filter((paragraph) => paragraph.trim());
}

export function BookDetailScreen({ bookId }: BookDetailScreenProps) {
  const { getAccessTokenSilently, isAuthenticated, isLoading, user } =
    useAuth0();
  const [state, setState] = useState<DetailState>({ kind: "loading" });

  const requestDetail = useCallback(async (): Promise<DetailState> => {
    let status: BookProcessingStatus;

    try {
      status = await bookwiseApi(
        getAccessTokenSilently,
        `/v1/books/${bookId}/processing`,
        { method: "GET" },
        bookProcessingStatusSchema,
      );
    } catch {
      return { kind: "error" };
    }

    if (status.runStatus === "permanent_failed") {
      return { kind: "failed", status };
    }

    if (status.runStatus !== "completed") {
      return { kind: "processing", status };
    }

    try {
      const summary = await bookwiseApi(
        getAccessTokenSilently,
        `/v1/books/${bookId}/summary`,
        { method: "GET" },
        bookSummarySchema,
      );

      return { kind: "ready", summary };
    } catch {
      return { kind: "unavailable" };
    }
  }, [bookId, getAccessTokenSilently]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let active = true;
    let interval: number | undefined;

    const poll = () => {
      if (document.hidden) {
        return;
      }

      void requestDetail().then((nextState) => {
        if (!active) {
          return;
        }

        setState(nextState);
        if (nextState.kind === "processing" && interval === undefined) {
          interval = window.setInterval(poll, 5000);
        }
        if (nextState.kind !== "processing" && interval !== undefined) {
          window.clearInterval(interval);
          interval = undefined;
        }
      });
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        poll();
      }
    };

    poll();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isAuthenticated, requestDetail]);

  if (isLoading) {
    return (
      <main className="app-shell auth-shell">
        <p className="auth-loading" role="status">
          <LoaderCircle className="spin" aria-hidden="true" size={20} />
          Opening your book
        </p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="app-shell auth-shell">
        <header className="app-header">
          <div className="brand-lockup">
            <BookOpen aria-hidden="true" size={22} />
            <span>Bookwise</span>
          </div>
        </header>
        <p className="book-detail-state" role="alert">
          Sign in to view this private book.
        </p>
      </main>
    );
  }

  const email = user?.email?.trim() || user?.name || "Signed in user";

  return (
    <main className="app-shell library-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <BookOpen aria-hidden="true" size={22} />
          <span>Bookwise</span>
        </div>
        <AccountMenu email={email} />
      </header>

      <section className="book-detail" aria-labelledby="book-summary-title">
        <Link className="back-link" href="/">
          Library
        </Link>
        <p className="eyebrow">Private book</p>
        <h1 id="book-summary-title">Book summary</h1>

        {state.kind === "loading" && (
          <p className="book-detail-state" role="status">
            <LoaderCircle className="spin" aria-hidden="true" size={18} />
            Loading book status...
          </p>
        )}

        {state.kind === "processing" && (
          <p className="book-detail-state" role="status">
            <LoaderCircle className="spin" aria-hidden="true" size={18} />
            {statusLabel(state.status)}
          </p>
        )}

        {state.kind === "failed" && (
          <div className="book-detail-state book-detail-error" role="alert">
            <CircleAlert aria-hidden="true" size={18} />
            <p>This book could not be processed into a summary.</p>
          </div>
        )}

        {state.kind === "unavailable" && (
          <div className="book-detail-state book-detail-error" role="alert">
            <CircleAlert aria-hidden="true" size={18} />
            <p>The summary is not available yet. Check the processing status again shortly.</p>
          </div>
        )}

        {state.kind === "error" && (
          <div className="book-detail-state book-detail-error" role="alert">
            <CircleAlert aria-hidden="true" size={18} />
            <p>Bookwise could not load this book.</p>
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <article className="book-summary">
              {summaryParagraphs(state.summary.summary.body).map(
                (paragraph, index) => (
                  <p key={`${index}-${paragraph}`}>{paragraph}</p>
                ),
              )}
            </article>

            <section className="citation-list" aria-labelledby="citations-title">
              <h2 id="citations-title">Source locations</h2>
              {state.summary.summary.citations.length > 0 ? (
                <ol>
                  {state.summary.summary.citations.map((citation) => (
                    <li key={citation.sourceSpanId}>
                      {locationLabel(citation.location)}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No source locations are available for this summary.</p>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
