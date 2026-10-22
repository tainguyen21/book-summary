"use client";

import { Quote } from "lucide-react";
import { useRef, useState } from "react";

import { useLocale, type Locale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { readerMessages } from "../../lib/i18n/messages/reader";
import type { PublishedSummary } from "../../lib/library-types";
import { textLanguage } from "../../lib/text-language";
import { AskPanel } from "../ask/ask-panel";
import { BookFlashcardsPanel } from "../flashcards/book-flashcards-panel";
import { CitedSummaryBody } from "./cited-summary-body";
import { HighlightControls } from "./highlight-controls";
import { HighlightsPanel } from "./highlights-panel";
import { sentenceKey, useHighlights } from "./use-highlights";
import { PassageDialog } from "./passage-dialog";
import { SummaryParts } from "./summary-parts";

/** Location keys in priority order: the first one present names the citation. */
const locationKeys = ["page_number", "spine_index", "paragraph_number", "line_start"] as const;

/** Turns a raw citation location into a short label such as "Page 12" ("Trang 12" in Vietnamese). */
export function locationLabel(location: Record<string, unknown>, locale: Locale = "en"): string {
  const messages = readerMessages[locale];

  for (const key of locationKeys) {
    const value = location[key];

    if (typeof value === "number" || typeof value === "string") {
      return `${messages.locations[key]} ${value}`;
    }
  }

  const fallback = Object.entries(location)
    .filter(([, value]) => ["string", "number"].includes(typeof value))
    .map(([key, value]) => `${key.replaceAll("_", " ")} ${String(value)}`);

  return fallback[0] ?? messages.sourcePassage;
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
  const locale = useLocale();
  const t = useMessages(readerMessages);
  const labelFor = (location: Record<string, unknown>) => locationLabel(location, locale);
  const highlights = useHighlights(bookId, summary.id);

  return (
    <>
      {/* The summary is in the book's language; mark it for screen readers. */}
      <div lang={textLanguage(summary.body)} style={{ display: "contents" }}>
      {summary.paragraphs.length > 0 ? (
        <CitedSummaryBody
          paragraphs={summary.paragraphs}
          labelFor={labelFor}
          onViewInContext={(spanId, label, opener) => {
            triggerRef.current = opener as HTMLButtonElement;
            setOpen({ spanId, label });
          }}
          highlighted={new Set(highlights.current.keys())}
          cardFooter={(paragraph, sentence) => {
            const highlight = highlights.current.get(sentenceKey(paragraph, sentence));
            return (
              // Interface text, not book text.
              <div lang={locale}>
                <HighlightControls
                  key={sentenceKey(paragraph, sentence)}
                  highlight={highlight}
                  onToggle={async () => {
                    if (highlight) {
                      await highlights.remove(highlight.id);
                    } else {
                      await highlights.save(paragraph, sentence);
                    }
                  }}
                  onSaveNote={async (note) => {
                    await highlights.save(paragraph, sentence, note);
                  }}
                />
              </div>
            );
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

      <SummaryParts
        sections={summary.sections}
        labelFor={labelFor}
        onViewInContext={(spanId, label, opener) => {
          triggerRef.current = opener as HTMLButtonElement;
          setOpen({ spanId, label });
        }}
      />

      {summary.paragraphs.length > 0 && (
        <HighlightsPanel
          highlights={highlights.highlights}
          summaryId={summary.id}
          onShow={(highlight) => {
            const marker = document.getElementById(`cite-${highlight.paragraph}-${highlight.sentence}`);
            if (marker) {
              if (marker.getAttribute("aria-expanded") !== "true") {
                marker.click();
              }
              marker.scrollIntoView({ block: "center" });
              marker.focus();
            }
          }}
          onRemove={(highlight) => highlights.remove(highlight.id)}
        />
      )}

      <AskPanel
        askPath={`/v1/books/${bookId}/ask`}
        heading={t.askHeading}
        lede={t.askLede}
        placeholder={t.askPlaceholder}
        defaultBookId={bookId}
        showBookTitles={false}
        labelFor={labelFor}
        onViewInContext={(_bookId, spanId, label, opener) => {
          triggerRef.current = opener as HTMLButtonElement;
          setOpen({ spanId, label });
        }}
      />

      <BookFlashcardsPanel bookId={bookId} />

      <section className="reader-sources" aria-labelledby="sources-title">
        <h2 id="sources-title">
          <Quote aria-hidden="true" size={16} />
          {t.sourcesTitle}
        </h2>
        {summary.citations.length > 0 ? (
          <>
            <p>{t.sourcesLede}</p>
            <ol className="reader-chips">
              {summary.citations.map((citation) => {
                const label = labelFor(citation.location);
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
          <p>{t.noSources}</p>
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
