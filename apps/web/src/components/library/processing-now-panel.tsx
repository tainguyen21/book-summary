"use client";

import Link from "next/link";

import {
  isActive,
  pipelineIndex,
  pipelineStepLabels,
} from "../../lib/book-status";
import { formatRelative } from "../../lib/format";
import type { LibraryBook } from "../../lib/library-types";
import { useLocale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { libraryMessages } from "../../lib/i18n/messages/library";
import { BookCover, fileFormat } from "./book-cover";

/** Live pipeline for every queued or summarizing book. Hidden when idle. */
export function ProcessingNowPanel({ books }: { books: LibraryBook[] }) {
  const locale = useLocale();
  const t = useMessages(libraryMessages);
  const pipelineSteps = pipelineStepLabels[locale];
  const active = books.filter(isActive);

  if (active.length === 0) {
    return null;
  }

  return (
    <section className="panel lib-processing" aria-labelledby="processing-title">
      <div className="panel-header">
        <h2 id="processing-title">
          {t.processingNow}
          <span className="badge tone-info">{t.activeCount(active.length)}</span>
        </h2>
        <span>{t.refreshes}</span>
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
                    ? t.updatedAgo(formatRelative(book.latestEventAt, locale))
                    : t.addedAgo(formatRelative(book.createdAt, locale))}
                </small>
              </div>
              <ol className="lib-pipeline" aria-label={t.progressStep(pipelineSteps[current])}>
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
                {t.view}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
