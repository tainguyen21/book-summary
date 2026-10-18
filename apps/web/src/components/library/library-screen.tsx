"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { RefreshCw, Search, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { categoryLabelsByLocale, isActive, presentStatus } from "../../lib/book-status";
import { greeting } from "../../lib/format";
import type { LibraryBook } from "../../lib/library-types";
import { useLocale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { commonMessages } from "../../lib/i18n/messages/common";
import { libraryMessages } from "../../lib/i18n/messages/library";
import { shellMessages } from "../../lib/i18n/messages/shell";
import { AppShell, libraryViewHref, type LibraryView } from "../app-shell/app-shell";
import { useUpload } from "../app-shell/upload-context";
import { StateCallout } from "../layout/state-callout";
import { BookCollection } from "./book-collection";
import { ClearIncompleteButton } from "./clear-incomplete-button";
import { DailyBudgetCard } from "./daily-budget-card";
import { LibraryDashboardSkeleton } from "./library-skeleton";
import { LibraryStats } from "./library-stats";
import { ProcessingNowPanel } from "./processing-now-panel";
import { useDailyUsage } from "./use-daily-usage";
import { useLibraryBooks } from "./use-library-books";
import "./library.css";

export function LibraryScreen({ view }: { view: LibraryView }) {
  const { state, reload, refresh } = useLibraryBooks();
  const t = useMessages(libraryMessages);
  const common = useMessages(commonMessages);

  return (
    <AppShell
      books={state.kind === "ready" ? state.books : undefined}
      activeView={view}
      onUploaded={refresh}
    >
      {state.kind === "loading" && <LibraryDashboardSkeleton />}

      {state.kind === "error" && (
        <div className="shell-content">
          <StateCallout
            tone="danger"
            title={t.loadErrorTitle}
            body={t.loadErrorBody}
            action={
              <button className="button button-line button-sm" type="button" onClick={reload}>
                <RefreshCw aria-hidden="true" size={15} />
                {common.tryAgain}
              </button>
            }
          />
        </div>
      )}

      {state.kind === "ready" && (
        <LibraryDashboard view={view} books={state.books} onChanged={refresh} />
      )}
    </AppShell>
  );
}

function LibraryDashboard({
  view,
  books,
  onChanged,
}: {
  view: LibraryView;
  books: LibraryBook[];
  onChanged(): void;
}) {
  const { user } = useAuth0();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const usage = useDailyUsage();
  const locale = useLocale();
  const t = useMessages(libraryMessages);
  const shell = useMessages(shellMessages);
  const activeCount = books.filter(isActive).length;
  const firstName =
    user?.given_name ||
    (user?.name && user.name !== user.email ? user.name.split(" ")[0] : "");

  const normalizedQuery = query.trim().toLowerCase();
  const visibleBooks = books.filter(
    (book) =>
      (view === "all" || presentStatus(book).category === view) &&
      (!normalizedQuery ||
        book.title.toLowerCase().includes(normalizedQuery) ||
        book.filename.toLowerCase().includes(normalizedQuery)),
  );

  return (
    <div className="shell-content">
      <header className="lib-heading">
        <div>
          <h1>
            {greeting(undefined, locale)}
            {firstName ? (
              <>
                , <span className="display-italic">{firstName}</span>
              </>
            ) : null}
          </h1>
          <p>
            {books.length === 0
              ? t.introEmpty
              : t.intro}
          </p>
        </div>
        {activeCount > 0 && (
          <span className="lib-live" role="status">
            <span className="lib-live-dot" aria-hidden="true" />
            {t.liveProcessing(activeCount)}
          </span>
        )}
      </header>

      {books.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <>
          <LibraryStats books={books} />
          {usage && <DailyBudgetCard usage={usage} />}
          <ProcessingNowPanel books={books} />

          <div className="lib-search-row">
            <div className="lib-search">
              <Search aria-hidden="true" size={16} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.searchLabel}
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label={t.clearSearch}>
                  <X aria-hidden="true" size={14} />
                </button>
              )}
            </div>
            <ClearIncompleteButton
              count={books.filter((book) => book.bookStatus === "pending_upload").length}
              onCleared={onChanged}
            />
          </div>

          <BookCollection
            title={view === "all" ? shell.allBooks : categoryLabelsByLocale[locale][view]}
            books={visibleBooks}
            totalCount={books.length}
            onClearFilters={() => {
              setQuery("");
              router.push(libraryViewHref("all"));
            }}
            onChanged={onChanged}
          />
        </>
      )}
    </div>
  );
}

function EmptyLibrary() {
  const { openUpload } = useUpload();
  const t = useMessages(libraryMessages);

  return (
    <section className="lib-empty" aria-labelledby="empty-title">
      <div className="lib-empty-stack" aria-hidden="true">
        <span className="book-cover cover-2" />
        <span className="book-cover cover-1" />
        <span className="book-cover cover-3" />
      </div>
      <h2 id="empty-title">{t.emptyTitle}</h2>
      <p>{t.emptyBody}</p>
      <button className="button button-ink button-lg" type="button" onClick={openUpload}>
        <Upload aria-hidden="true" size={18} />
        {t.emptyUpload}
      </button>
      <ul className="lib-empty-formats" aria-label={t.supportedFormats}>
        <li>PDF</li>
        <li>EPUB</li>
        <li>DOCX</li>
        <li>TXT</li>
      </ul>
      <small>{t.sizeLimit}</small>
    </section>
  );
}
