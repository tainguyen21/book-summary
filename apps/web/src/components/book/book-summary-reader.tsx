"use client";

import { Quote } from "lucide-react";
import { useRef, useState } from "react";

import type { PublishedSummary } from "../../lib/library-types";
import { textLanguage } from "../../lib/text-language";
import { AskPanel } from "../ask/ask-panel";
import { CitedSummaryBody } from "./cited-summary-body";
import { PassageDialog } from "./passage-dialog";

const locationLabels: Record<string, string> = {
  page_number: "Page",
  spine_index: "Chapter",
  paragraph_number: "Paragraph",
  line_start: "Line",
};

/** Turns a raw citation location into a short label such as "Page 12". */
export function locationLabel(location: Record<string, unknown>): string {
  for (const [key, label] of Object.entries(locationLabels)) {
    const value = location[key];

    if (typeof value === "number" || typeof value === "string") {
      return `${label} ${value}`;
    }
  }

  const fallback = Object.entries(location)
    .filter(([, value]) => ["string", "number"].includes(typeof value))
    .map(([key, value]) => `${key.replaceAll("_", " ")} ${String(value)}`);

  return fallback[0] ?? "Source passage";
}

export function summaryParagraphs(body: string): string[] {
  return body.split(/\n\s*\n/).filter((paragraph) => paragraph.trim());
}

export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.split(/\s+/).length / 225));
}

/** The summary as a long-form article, followed by its cited sources. */
export function BookSummaryReader({
  bookId,
  summary,
}: {
  bookId: string;
  summary: PublishedSummary;
}) {
  const [open, setOpen] = useState<{ spanId: string; label: string }>();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      {/* The summary is in the book's language; mark it for screen readers. */}
      <div lang={textLanguage(summary.body)} style={{ display: "contents" }}>
      {summary.paragraphs.length > 0 ? (
        <CitedSummaryBody
          paragraphs={summary.paragraphs}
          labelFor={locationLabel}
          onViewInContext={(spanId, label, opener) => {
            triggerRef.current = opener as HTMLButtonElement;
            setOpen({ spanId, label });
          }}
        />
      ) : (
        <div className="reader-body">
          {summaryParagraphs(summary.body).map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
          ))}
        </div>
      )}
      </div>

      <AskPanel
        askPath={`/v1/books/${bookId}/ask`}
        heading="Ask this book"
        lede="Answers come only from this book, with the sentence behind each claim."
        placeholder="e.g. Why did the first trees die?"
        defaultBookId={bookId}
        showBookTitles={false}
        labelFor={locationLabel}
        onViewInContext={(_bookId, spanId, label, opener) => {
          triggerRef.current = opener as HTMLButtonElement;
          setOpen({ spanId, label });
        }}
      />

      <section className="reader-sources" aria-labelledby="sources-title">
        <h2 id="sources-title">
          <Quote aria-hidden="true" size={16} />
          Where this comes from
        </h2>
        {summary.citations.length > 0 ? (
          <>
            <p>The summary is grounded in these parts of the book. Select one to read it.</p>
            <ol className="reader-chips">
              {summary.citations.map((citation) => {
                const label = locationLabel(citation.location);
                return (
                  <li key={citation.sourceSpanId}>
                    <button
                      type="button"
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setOpen({ spanId: citation.sourceSpanId, label });
                      }}
                    >
                      <b>{citation.order}</b>
                      {label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p>No source locations are available for this summary.</p>
        )}
      </section>

      {open && (
        <PassageDialog
          bookId={bookId}
          sourceSpanId={open.spanId}
          label={open.label}
          onClose={() => {
            setOpen(undefined);
            // Refocus after the modal is removed; removing it resets focus to <body>.
            const trigger = triggerRef.current;
            requestAnimationFrame(() => trigger?.focus());
          }}
        />
      )}
    </>
  );
}
