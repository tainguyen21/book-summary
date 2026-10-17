import Link from "next/link";

import {
  isActive,
  pipelineIndex,
  pipelineSteps,
} from "../../lib/book-status";
import { formatRelative } from "../../lib/format";
import type { LibraryBook } from "../../lib/library-types";
import { BookCover, fileFormat } from "./book-cover";

/** Live pipeline for every queued or summarizing book. Hidden when idle. */
export function ProcessingNowPanel({ books }: { books: LibraryBook[] }) {
  const active = books.filter(isActive);

  if (active.length === 0) {
    return null;
  }

  return (
    <section className="panel lib-processing" aria-labelledby="processing-title">
      <div className="panel-header">
        <h2 id="processing-title">
          Processing now
          <span className="badge tone-info">{active.length} active</span>
        </h2>
        <span>Refreshes every few seconds</span>
      </div>
      <ul className="lib-jobs">
        {active.map((book) => {
          const current = pipelineIndex(book);

          return (
            <li className="lib-job" key={book.id}>
              <BookCover id={book.id} title={book.title} filename={book.filename} size="sm" />
              <div className="lib-job-text">
                <b>{book.title}</b>
                <small>
                  {fileFormat(book.filename)} ·{" "}
                  {book.latestEventAt
                    ? `updated ${formatRelative(book.latestEventAt)}`
                    : `added ${formatRelative(book.createdAt)}`}
                </small>
              </div>
              <ol className="lib-pipeline" aria-label={`Progress: ${pipelineSteps[current]}`}>
                {pipelineSteps.map((step, index) => (
                  <li
                    key={step}
                    data-state={index < current ? "done" : index === current ? "active" : "pending"}
                  >
                    <i />
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <Link className="button button-line button-sm" href={`/books/${book.id}`}>
                View
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
