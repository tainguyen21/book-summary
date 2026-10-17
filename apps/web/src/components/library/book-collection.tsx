"use client";

import { ChevronDown, LayoutGrid, List, SearchX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { presentStatus } from "../../lib/book-status";
import { formatDay, formatTime } from "../../lib/format";
import type { LibraryBook } from "../../lib/library-types";
import { useUpload } from "../app-shell/upload-context";
import { BookActionsMenu } from "./book-actions-menu";
import { BookCover, fileFormat } from "./book-cover";
import { BookStatusBadge } from "./book-status-badge";

type Layout = "list" | "grid";
type SortOrder = "newest" | "oldest" | "title";

const layoutStorageKey = "bookwise.library.layout";

const sortLabels: Record<SortOrder, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  title: "Title A–Z",
};

function sortBooks(books: LibraryBook[], order: SortOrder): LibraryBook[] {
  return [...books].sort((a, b) =>
    order === "title"
      ? a.title.localeCompare(b.title)
      : order === "newest"
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
  );
}

function readSavedLayout(): Layout {
  try {
    return window.localStorage.getItem(layoutStorageKey) === "grid" ? "grid" : "list";
  } catch {
    // Storage can be unavailable (private mode); the default layout is fine.
    return "list";
  }
}

/** Per-row primary action that matches what the user can do next. */
function BookAction({ book }: { book: LibraryBook }) {
  const { openUpload } = useUpload();
  const { category } = presentStatus(book);
  const href = `/books/${book.id}`;

  if (category === "ready") {
    return (
      <Link className="button button-ink button-sm" href={href}>
        Read summary
      </Link>
    );
  }

  if (book.bookStatus === "pending_upload") {
    return (
      <button className="button button-line button-sm" type="button" onClick={openUpload}>
        Upload again
      </button>
    );
  }

  return (
    <Link className="button button-line button-sm" href={href}>
      {category === "attention" ? "View details" : "View progress"}
    </Link>
  );
}

/** Books as a table or a cover grid, with sorting and a remembered layout. */
export function BookCollection({
  title,
  books,
  totalCount,
  onClearFilters,
  onChanged,
}: {
  title: string;
  books: LibraryBook[];
  totalCount: number;
  onClearFilters(): void;
  /** Refreshes the library after a rename, retry, or delete. */
  onChanged(): void;
}) {
  // Rendered only on the client (after sign-in), so storage is safe to read.
  const [layout, setLayout] = useState<Layout>(readSavedLayout);
  const [order, setOrder] = useState<SortOrder>("newest");
  const sorted = sortBooks(books, order);

  function chooseLayout(next: Layout) {
    setLayout(next);
    try {
      window.localStorage.setItem(layoutStorageKey, next);
    } catch {
      // Ignore: the preference simply won't persist.
    }
  }

  return (
    <section className="panel lib-collection" aria-labelledby="collection-title">
      <div className="panel-header">
        <h2 id="collection-title">
          {title}
          <span className="badge tone-neutral">{books.length}</span>
        </h2>
        <div className="lib-tools">
          <label className="lib-sort">
            <span className="visually-hidden">Sort books</span>
            <select value={order} onChange={(event) => setOrder(event.target.value as SortOrder)}>
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" size={14} />
          </label>
          <div className="lib-segment" role="group" aria-label="Layout">
            <button
              type="button"
              aria-pressed={layout === "list"}
              aria-label="List view"
              onClick={() => chooseLayout("list")}
            >
              <List aria-hidden="true" size={15} />
            </button>
            <button
              type="button"
              aria-pressed={layout === "grid"}
              aria-label="Grid view"
              onClick={() => chooseLayout("grid")}
            >
              <LayoutGrid aria-hidden="true" size={15} />
            </button>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="lib-no-results">
          <SearchX aria-hidden="true" size={22} />
          <p>
            <b>No books match</b>
            {totalCount > 0 ? "Try a different search or filter." : ""}
          </p>
          <button className="button button-line button-sm" type="button" onClick={onClearFilters}>
            Show all books
          </button>
        </div>
      ) : layout === "list" ? (
        <div className="lib-table-wrap">
          <table className="lib-table">
            <thead>
              <tr>
                <th scope="col">Book</th>
                <th scope="col" className="lib-col-format">Format</th>
                <th scope="col" className="lib-col-added">Added</th>
                <th scope="col">Status</th>
                <th scope="col" className="lib-col-action">
                  <span className="visually-hidden">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((book) => (
                <tr key={book.id}>
                  <td>
                    <div className="lib-book-cell">
                      <BookCover
                        id={book.id}
                        title={book.title}
                        filename={book.filename}
                        size="sm"
                        muted={presentStatus(book).category === "attention"}
                      />
                      <div>
                        <Link className="lib-book-title" href={`/books/${book.id}`}>
                          {book.title}
                        </Link>
                        <small>{book.filename}</small>
                      </div>
                    </div>
                  </td>
                  <td className="lib-col-format">
                    <span className="lib-format">{fileFormat(book.filename)}</span>
                  </td>
                  <td className="lib-col-added">
                    <span className="lib-when">
                      {formatDay(book.createdAt)}
                      <small>{formatTime(book.createdAt)}</small>
                    </span>
                  </td>
                  <td>
                    <BookStatusBadge source={book} />
                  </td>
                  <td className="lib-col-action">
                    <div className="lib-actions">
                      <BookAction book={book} />
                      <BookActionsMenu book={book} onChanged={onChanged} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="lib-grid">
          {sorted.map((book) => (
            <li key={book.id}>
              <Link className="lib-grid-item" href={`/books/${book.id}`}>
                <BookCover
                  id={book.id}
                  title={book.title}
                  filename={book.filename}
                  size="md"
                  muted={presentStatus(book).category === "attention"}
                />
                <b>{book.title}</b>
                <span className="lib-grid-meta">
                  {formatDay(book.createdAt)}
                  <BookStatusBadge source={book} />
                </span>
              </Link>
              <BookActionsMenu book={book} onChanged={onChanged} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
