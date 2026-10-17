"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatDate } from "../../lib/format";
import { effectiveStatus, type BookStatusSource } from "../../lib/book-status";
import type { LibraryBook } from "../../lib/library-types";
import { AppShell } from "../app-shell/app-shell";
import { useUpload } from "../app-shell/upload-context";
import { StateCallout } from "../layout/state-callout";
import { BookCover } from "../library/book-cover";
import { BookStatusBadge } from "../library/book-status-badge";
import { useLibraryBooks } from "../library/use-library-books";
import { Skeleton } from "../ui/loading";
import { BookProcessingSteps } from "./book-processing-steps";
import { BookSummaryReader, readingMinutes } from "./book-summary-reader";
import { useBookDetail, type DetailState } from "./use-book-detail";
import "./reader.css";

function statusSourceFor(state: DetailState): BookStatusSource | undefined {
  switch (state.kind) {
    case "processing":
    case "failed":
      return state.status;
    case "ready":
      return { bookStatus: "completed", runStatus: "completed" };
    case "upload-incomplete":
      return { bookStatus: "pending_upload" };
    case "needs-review":
      return { bookStatus: "needs_review" };
    default:
      return undefined;
  }
}

export function BookDetailScreen({ bookId }: { bookId: string }) {
  const library = useLibraryBooks();
  const { state, reload } = useBookDetail(bookId);
  const books = library.state.kind === "ready" ? library.state.books : undefined;
  const book = books?.find((candidate) => candidate.id === bookId);

  return (
    <AppShell books={books} onUploaded={library.refresh}>
      <div className="shell-content">
        <Link className="reader-back" href="/library">
          <ArrowLeft aria-hidden="true" size={16} />
          Library
        </Link>

        <div className="reader-layout">
          <BookAside bookId={bookId} book={book} state={state} libraryLoading={library.state.kind === "loading"} />

          <article className="reader-main" aria-labelledby="book-title">
            <p className="reader-eyebrow">
              {state.kind === "ready" ? "Summary" : "Book"}
            </p>
            <h1 id="book-title">
              {book?.title ??
                (library.state.kind === "loading" ? (
                  <Skeleton width="60%" height={40} />
                ) : (
                  "Book summary"
                ))}
            </h1>
            {state.kind === "ready" && (
              <p className="reader-meta">
                <span>{readingMinutes(state.summary.summary.body)} min read</span>
                <span>
                  {state.summary.summary.citations.length}{" "}
                  {state.summary.summary.citations.length === 1 ? "source" : "sources"}
                </span>
                <span>Generated {formatDate(state.summary.summary.createdAt)}</span>
              </p>
            )}

            <DetailBody state={state} reload={reload} />
          </article>
        </div>
      </div>
    </AppShell>
  );
}

function BookAside({
  bookId,
  book,
  state,
  libraryLoading,
}: {
  bookId: string;
  book?: LibraryBook;
  state: DetailState;
  libraryLoading: boolean;
}) {
  const statusSource = statusSourceFor(state);

  return (
    <aside className="reader-aside">
      {book ? (
        <BookCover
          id={book.id}
          title={book.title}
          filename={book.filename}
          size="lg"
          muted={state.kind === "failed" || state.kind === "upload-incomplete"}
        />
      ) : libraryLoading ? (
        <Skeleton width={180} height={240} radius="4px 12px 12px 4px" />
      ) : (
        <BookCover id={bookId} title="" filename="" size="lg" />
      )}
      <dl className="reader-facts">
        <div>
          <dt>Status</dt>
          <dd>{statusSource ? <BookStatusBadge source={statusSource} /> : <Skeleton width={70} height={22} radius={999} />}</dd>
        </div>
        {book && (
          <>
            <div>
              <dt>File</dt>
              <dd title={book.filename}>{book.filename}</dd>
            </div>
            <div>
              <dt>Added</dt>
              <dd>{formatDate(book.createdAt)}</dd>
            </div>
          </>
        )}
        {state.kind === "ready" && (
          <div>
            <dt>Reading time</dt>
            <dd>{readingMinutes(state.summary.summary.body)} min</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}

function DetailBody({ state, reload }: { state: DetailState; reload(): void }) {
  const { openUpload } = useUpload();
  const retryButton: ReactNode = (
    <button className="button button-line button-sm" type="button" onClick={reload}>
      <RefreshCw aria-hidden="true" size={15} />
      Try again
    </button>
  );

  switch (state.kind) {
    case "loading":
      return (
        <div className="reader-skeleton" aria-busy="true">
          <span className="visually-hidden" role="status">
            Loading book…
          </span>
          <Skeleton width="92%" height={16} />
          <Skeleton width="86%" height={16} />
          <Skeleton width="90%" height={16} />
          <Skeleton width="60%" height={16} />
        </div>
      );
    case "ready":
      return <BookSummaryReader summary={state.summary.summary} />;
    case "processing":
      return (
        <section className="panel reader-panel" aria-labelledby="processing-title">
          <h2 id="processing-title">Your summary is on its way</h2>
          <p className="reader-panel-lede">
            {effectiveStatus(state.status) === "budget_paused"
              ? "Paused until today’s AI budget resets at midnight; no action needed."
              : "Usually a few minutes, depending on the book’s length."}
          </p>
          <BookProcessingSteps status={state.status} />
          <p className="reader-panel-foot" role="status">
            <span className="reader-live-dot" aria-hidden="true" />
            Updates automatically — you can leave this page.
          </p>
        </section>
      );
    case "failed":
      return (
        <section className="panel reader-panel" aria-labelledby="failed-title">
          <h2 id="failed-title">We couldn’t summarize this book</h2>
          <p className="reader-panel-lede">
            Something went wrong while reading the file. Scanned, image-only
            PDFs and protected EPUBs often can’t be read.
          </p>
          <BookProcessingSteps status={state.status} failed />
          <div className="callout-actions">
            <button className="button button-ink button-sm" type="button" onClick={openUpload}>
              Upload another file
            </button>
          </div>
        </section>
      );
    case "upload-incomplete":
      return (
        <StateCallout
          tone="warning"
          title="This upload didn’t finish"
          body="The file never fully reached Bookwise, so processing hasn’t started. Upload it again to continue."
          action={
            <button className="button button-ink button-sm" type="button" onClick={openUpload}>
              Upload again
            </button>
          }
        />
      );
    case "needs-review":
      return (
        <StateCallout
          tone="warning"
          title="This summary needs a review"
          body="Bookwise wasn’t confident enough in the result to publish it automatically. It will appear here once it passes review."
        />
      );
    case "unavailable":
      return (
        <StateCallout
          tone="warning"
          title="Almost there"
          body="Processing finished, but the summary isn’t available yet. Check again in a moment."
          action={retryButton}
        />
      );
    case "error":
      return (
        <StateCallout
          tone="danger"
          title="We couldn’t load this book"
          body="It may have been removed, or the connection dropped. Try again, or go back to your library."
          action={
            <>
              {retryButton}
              <Link className="button button-ghost button-sm" href="/library">
                Back to library
              </Link>
            </>
          }
        />
      );
  }
}
