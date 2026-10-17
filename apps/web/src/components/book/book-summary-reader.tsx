import { Quote } from "lucide-react";

import type { PublishedSummary } from "../../lib/library-types";

const locationLabels: Record<string, string> = {
  page_number: "Page",
  spine_index: "Chapter",
  paragraph_number: "Paragraph",
  line_start: "Line",
};

/** Turns a raw citation location into a short label such as "Page 12". */
function locationLabel(location: Record<string, unknown>): string {
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
export function BookSummaryReader({ summary }: { summary: PublishedSummary }) {
  return (
    <>
      <div className="reader-body">
        {summaryParagraphs(summary.body).map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
        ))}
      </div>

      <section className="reader-sources" aria-labelledby="sources-title">
        <h2 id="sources-title">
          <Quote aria-hidden="true" size={16} />
          Where this comes from
        </h2>
        {summary.citations.length > 0 ? (
          <>
            <p>The summary is grounded in these parts of the book.</p>
            <ol className="reader-chips">
              {summary.citations.map((citation) => (
                <li key={citation.sourceSpanId}>
                  <b>{citation.order}</b>
                  {locationLabel(citation.location)}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p>No source locations are available for this summary.</p>
        )}
      </section>
    </>
  );
}
