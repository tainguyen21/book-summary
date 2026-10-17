"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { RefreshCw, Search, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { categoryLabels, isActive, presentStatus } from "../../lib/book-status";
import { greeting } from "../../lib/format";
import type { LibraryBook } from "../../lib/library-types";
import { AppShell, libraryViewHref, type LibraryView } from "../app-shell/app-shell";
import { useUpload } from "../app-shell/upload-context";
import { StateCallout } from "../layout/state-callout";
import { BookCollection } from "./book-collection";
import { LibraryDashboardSkeleton } from "./library-skeleton";
import { LibraryStats } from "./library-stats";
import { ProcessingNowPanel } from "./processing-now-panel";
import { useLibraryBooks } from "./use-library-books";
import "./library.css";

export function LibraryScreen({ view }: { view: LibraryView }) {
  const { state, reload, refresh } = useLibraryBooks();

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
            title="We couldn’t load your library"
            body="Check your connection, then try again."
            action={
              <button className="button button-line button-sm" type="button" onClick={reload}>
                <RefreshCw aria-hidden="true" size={15} />
                Try again
              </button>
            }
          />
        </div>
      )}

      {state.kind === "ready" && <LibraryDashboard view={view} books={state.books} />}
    </AppShell>
  );
}

function LibraryDashboard({
  view,
  books,
}: {
  view: LibraryView;
  books: LibraryBook[];
}) {
  const { user } = useAuth0();
  const router = useRouter();
  const [query, setQuery] = useState("");
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
            {greeting()}
            {firstName ? (
              <>
                , <span className="display-italic">{firstName}</span>
              </>
            ) : null}
          </h1>
          <p>
            {books.length === 0
              ? "Your private library is ready for its first book."
              : "Here’s what’s happening in your library."}
          </p>
        </div>
        {activeCount > 0 && (
          <span className="lib-live" role="status">
            <span className="lib-live-dot" aria-hidden="true" />
            {activeCount} {activeCount === 1 ? "book" : "books"} processing ·
            updates live
          </span>
        )}
      </header>

      {books.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <>
          <LibraryStats books={books} />
          <ProcessingNowPanel books={books} />

          <div className="lib-search">
            <Search aria-hidden="true" size={16} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title or file name"
              aria-label="Search books"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X aria-hidden="true" size={14} />
              </button>
            )}
          </div>

          <BookCollection
            title={view === "all" ? "All books" : categoryLabels[view]}
            books={visibleBooks}
            totalCount={books.length}
            onClearFilters={() => {
              setQuery("");
              router.push(libraryViewHref("all"));
            }}
          />
        </>
      )}
    </div>
  );
}

function EmptyLibrary() {
  const { openUpload } = useUpload();

  return (
    <section className="lib-empty" aria-labelledby="empty-title">
      <div className="lib-empty-stack" aria-hidden="true">
        <span className="book-cover cover-2" />
        <span className="book-cover cover-1" />
        <span className="book-cover cover-3" />
      </div>
      <h2 id="empty-title">Add your first book</h2>
      <p>
        Upload a book and Bookwise will read it privately and write a summary
        with sources you can check.
      </p>
      <button className="button button-ink button-lg" type="button" onClick={openUpload}>
        <Upload aria-hidden="true" size={18} />
        Upload a book
      </button>
      <ul className="lib-empty-formats" aria-label="Supported formats">
        <li>PDF</li>
        <li>EPUB</li>
        <li>DOCX</li>
        <li>TXT</li>
      </ul>
      <small>Up to 100 MB per file</small>
    </section>
  );
}
