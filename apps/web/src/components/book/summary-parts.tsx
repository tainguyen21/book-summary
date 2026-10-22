"use client";

import { ChevronDown, ListOrdered } from "lucide-react";

import { useMessages } from "../../lib/i18n/messages";
import { readerMessages } from "../../lib/i18n/messages/reader";
import type { SummarySection } from "../../lib/library-types";
import { textLanguage } from "../../lib/text-language";
import { CitedSummaryBody } from "./cited-summary-body";

/**
 * A long book's part-by-part summaries under the overall summary. Each part
 * is collapsed by default so the page stays scannable; citation markers work
 * as they do in the overall summary.
 */
export function SummaryParts({
  sections,
  labelFor,
  onViewInContext,
}: {
  sections: SummarySection[];
  labelFor(location: Record<string, unknown>): string;
  onViewInContext(spanId: string, label: string, opener: HTMLElement): void;
}) {
  const t = useMessages(readerMessages);
  const parts = sections.filter((section) => section.paragraphs.length > 0);

  if (parts.length === 0) {
    return null;
  }

  function range(section: SummarySection): string {
    const start = section.locationStart.page_number;
    const end = section.locationEnd.page_number;
    if (typeof start === "number" && typeof end === "number" && start !== end) {
      return t.pageRange(start, end);
    }
    const first = labelFor(section.locationStart);
    const last = labelFor(section.locationEnd);
    return first === last ? first : `${first} – ${last}`;
  }

  return (
    <section className="reader-parts" aria-labelledby="parts-title">
      <h2 id="parts-title">
        <ListOrdered aria-hidden="true" size={16} />
        {t.partsTitle}
      </h2>
      <p>{t.partsLede(parts.length)}</p>
      <div className="reader-part-list">
        {parts.map((section) => (
          <details className="reader-part" key={section.position}>
            <summary>
              <span className="reader-part-heading">
                {section.title ? (
                  <>
                    <span className="reader-part-meta">
                      {t.partLabel(section.position)} · {range(section)}
                    </span>
                    {/* Titles are in the book's language. */}
                    <span className="reader-part-title" lang={textLanguage(section.title)}>
                      {section.title}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="reader-part-meta">{range(section)}</span>
                    <span className="reader-part-title">{t.partLabel(section.position)}</span>
                  </>
                )}
              </span>
              <ChevronDown aria-hidden="true" size={16} className="reader-part-chevron" />
            </summary>
            {/* Part text is in the book's language; mark it for screen readers. */}
            <div
              lang={textLanguage(
                section.paragraphs
                  .flat()
                  .map((sentence) => sentence.text)
                  .join(" "),
              )}
            >
              <CitedSummaryBody
                paragraphs={section.paragraphs}
                labelFor={labelFor}
                onViewInContext={onViewInContext}
                idPrefix={`part-${section.position}-`}
              />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
