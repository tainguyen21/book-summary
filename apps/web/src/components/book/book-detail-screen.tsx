"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { formatDate } from "../../lib/format";
import { readerMessages } from "../../lib/i18n/messages/reader";
import { highlightMessages } from "../../lib/i18n/messages/highlights";
import { loadHighlights } from "../../lib/highlights-api";
import { downloadMarkdown, summaryMarkdown } from "../../lib/summary-markdown";
import { effectiveStatus, type BookStatusSource } from "../../lib/book-status";
import { useLocale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { bookMessages } from "../../lib/i18n/messages/book";
import type { LibraryBook } from "../../lib/library-types";
import { AppShell } from "../app-shell/app-shell";
import { useUpload } from "../app-shell/upload-context";
import { StateCallout } from "../layout/state-callout";
import { BookActionsMenu } from "../library/book-actions-menu";
import { BookCover } from "../library/book-cover";
import { BookStatusBadge } from "../library/book-status-badge";
import { useLibraryBooks } from "../library/use-library-books";
import { Skeleton } from "../ui/loading";
import { BookProcessingSteps } from "./book-processing-steps";
import { BookSummaryReader, locationLabel, readingMinutes } from "./book-summary-reader";
import { RetrySummaryButton } from "./retry-summary-button";
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
  const router = useRouter();
  const t = useMessages(bookMessages);
  const locale = useLocale();
  const { getAccessTokenSilently } = useAuth0();
  const books = library.state.kind === "ready" ? library.state.books : undefined;
  const listed = books?.find((candidate) => candidate.id === bookId);
  // The detail poll knows the run state even when the library list does not.
  const book =
    listed && (state.kind === "processing" || state.kind === "failed")
      ? { ...listed, runStatus: state.status.runStatus }
      : listed;
  const refreshAll = () => {
    library.refresh();
    reload();
  };

  return (
    <AppShell books={books} onUploaded={library.refresh}>
      <div className="shell-content">
        <Link className="reader-back" href="/library">
          <ArrowLeft aria-hidden="true" size={16} />
          {t.library}
        </Link>

        <div className="reader-layout">
          <BookAside
            bookId={bookId}
            book={book}
            state={state}
            libraryLoading={library.state.kind === "loading"}
            onChanged={refreshAll}
            onDeleted={() => router.push("/library")}
          />

          <article className="reader-main" aria-labelledby="book-title">
            <p className="reader-eyebrow">
              {state.kind === "ready" ? t.eyebrowSummary : t.eyebrowBook}
            </p>
            <h1 id="book-title">
              {book?.title ??
                (library.state.kind === "loading" ? (
                  <Skeleton width="60%" height={40} />
                ) : (
                  t.fallbackTitle
                ))}
            </h1>
            {state.kind === "ready" && (
              <p className="reader-meta">
                <span>{t.minutesRead(readingMinutes(state.summary.summary.body))}</span>
                <span>{t.sourceCount(state.summary.summary.citations.length)}</span>
                <span>{t.generated(formatDate(state.summary.summary.createdAt, locale))}</span>
                <button
                  className="reader-export"
                  type="button"
                  aria-label={t.exportMarkdownLabel}
                  title={t.exportMarkdownLabel}
                  onClick={async () => {
                    const title = book?.title || t.fallbackTitle;
                    // Highlights are optional in the file; export without them if they fail to load.
                    const highlights = await loadHighlights(getAccessTokenSilently, bookId).catch(() => []);
                    downloadMarkdown(
                      title,
                      summaryMarkdown({
                        title,
                        filename: book?.filename ?? "",
                        summary: state.summary.summary,
                        labelFor: (location) => locationLabel(location, locale),
                        sourcesHeading: readerMessages[locale].sourcesTitle,
                        highlights,
                        highlightsHeading: highlightMessages[locale].exportHeading,
                      }),
                    );
                  }}
                >
                  <Download aria-hidden="true" size={13} />
                  {t.exportMarkdown}
                </button>
              </p>
            )}

            <DetailBody bookId={bookId} state={state} reload={reload} onRetried={refreshAll} />
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
  onChanged,
  onDeleted,
}: {
  bookId: string;
  book?: LibraryBook;
  state: DetailState;
  libraryLoading: boolean;
  onChanged(): void;
  onDeleted(): void;
}) {
  const statusSource = statusSourceFor(state);
  const t = useMessages(bookMessages);
  const locale = useLocale();

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
          <dt>{t.factStatus}</dt>
          <dd>{statusSource ? <BookStatusBadge source={statusSource} /> : <Skeleton width={70} height={22} radius={999} />}</dd>
        </div>
        {book && (
          <>
            <div>
              <dt>{t.factFile}</dt>
              <dd title={book.filename}>{book.filename}</dd>
            </div>
            <div>
              <dt>{t.factAdded}</dt>
              <dd>{formatDate(book.createdAt, locale)}</dd>
            </div>
          </>
        )}
        {state.kind === "ready" && (
          <div>
            <dt>{t.factReadingTime}</dt>
            <dd>{t.minutes(readingMinutes(state.summary.summary.body))}</dd>
          </div>
        )}
        {book && (
          <div>
            <dt>{t.factActions}</dt>
            <dd>
              <BookActionsMenu book={book} onChanged={onChanged} onDeleted={onDeleted} />
            </dd>
          </div>
        )}
      </dl>
    </aside>
  );
}

function DetailBody({
  bookId,
  state,
  reload,
  onRetried,
}: {
  bookId: string;
  state: DetailState;
  reload(): void;
  onRetried(): void;
}) {
  const { openUpload } = useUpload();
  const t = useMessages(bookMessages);
  const retryButton: ReactNode = (
    <button className="button button-line button-sm" type="button" onClick={reload}>
      <RefreshCw aria-hidden="true" size={15} />
      {t.tryAgain}
    </button>
  );

  switch (state.kind) {
    case "loading":
      return (
        <div className="reader-skeleton" aria-busy="true">
          <span className="visually-hidden" role="status">
            {t.loading}
          </span>
          <Skeleton width="92%" height={16} />
          <Skeleton width="86%" height={16} />
          <Skeleton width="90%" height={16} />
          <Skeleton width="60%" height={16} />
        </div>
      );
    case "ready":
      return <BookSummaryReader bookId={bookId} summary={state.summary.summary} />;
    case "processing":
      return (
        <section className="panel reader-panel" aria-labelledby="processing-title">
          <h2 id="processing-title">{t.processingTitle}</h2>
          <p className="reader-panel-lede">
            {effectiveStatus(state.status) === "budget_paused"
              ? t.processingPaused
              : t.processingLede}
          </p>
          <BookProcessingSteps status={state.status} />
          <p className="reader-panel-foot" role="status">
            <span className="reader-live-dot" aria-hidden="true" />
            {t.processingLive}
          </p>
        </section>
      );
    case "failed":
      return (
        <section className="panel reader-panel" aria-labelledby="failed-title">
          <h2 id="failed-title">{t.failedTitle}</h2>
          <p className="reader-panel-lede">{t.failedBody}</p>
          <BookProcessingSteps status={state.status} failed />
          <div className="callout-actions">
            {state.status.runStatus === "permanent_failed" && (
              <RetrySummaryButton bookId={bookId} onRetried={onRetried} />
            )}
            <button className="button button-line button-sm" type="button" onClick={openUpload}>
              {t.uploadAnother}
            </button>
          </div>
        </section>
      );
    case "upload-incomplete":
      return (
        <StateCallout
          tone="warning"
          title={t.uploadIncompleteTitle}
          body={t.uploadIncompleteBody}
          action={
            <button className="button button-ink button-sm" type="button" onClick={openUpload}>
              {t.uploadAgain}
            </button>
          }
        />
      );
    case "needs-review":
      return (
        <StateCallout
          tone="warning"
          title={t.needsReviewTitle}
          body={t.needsReviewBody}
        />
      );
    case "unavailable":
      return (
        <StateCallout
          tone="warning"
          title={t.unavailableTitle}
          body={t.unavailableBody}
          action={retryButton}
        />
      );
    case "error":
      return (
        <StateCallout
          tone="danger"
          title={t.errorTitle}
          body={t.errorBody}
          action={
            <>
              {retryButton}
              <Link className="button button-ghost button-sm" href="/library">
                {t.backToLibrary}
              </Link>
            </>
          }
        />
      );
  }
}
