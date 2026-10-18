"use client";

import { Highlighter, Trash2 } from "lucide-react";

import type { Highlight } from "../../lib/highlights-api";
import { useMessages } from "../../lib/i18n/messages";
import { highlightMessages } from "../../lib/i18n/messages/highlights";
import { textLanguage } from "../../lib/text-language";

/** The book's highlights with notes; older-version highlights stay readable. */
export function HighlightsPanel({
  highlights,
  summaryId,
  onShow,
  onRemove,
}: {
  highlights: Highlight[];
  summaryId: string;
  onShow(highlight: Highlight): void;
  onRemove(highlight: Highlight): Promise<void>;
}) {
  const t = useMessages(highlightMessages);
  const ordered = [...highlights].sort(
    (a, b) =>
      Number(b.summaryId === summaryId) - Number(a.summaryId === summaryId) ||
      a.paragraph - b.paragraph ||
      a.sentence - b.sentence,
  );

  return (
    <section className="highlights-panel" aria-labelledby="highlights-title">
      <h2 id="highlights-title">
        <Highlighter aria-hidden="true" size={17} />
        {t.panelTitle}
        {highlights.length > 0 && <span className="highlights-count">{t.count(highlights.length)}</span>}
      </h2>
      {ordered.length === 0 ? (
        <p className="highlights-empty">{t.panelEmpty}</p>
      ) : (
        <ol className="highlights-list">
          {ordered.map((highlight) => {
            const current = highlight.summaryId === summaryId;
            return (
              <li key={highlight.id}>
                <blockquote lang={textLanguage(highlight.text)}>{highlight.text}</blockquote>
                {highlight.note && <p className="highlight-note">{highlight.note}</p>}
                <div className="highlights-item-actions">
                  {current ? (
                    <button type="button" className="button button-ghost button-sm" onClick={() => onShow(highlight)}>
                      {t.showInSummary}
                    </button>
                  ) : (
                    <span className="highlights-stale">{t.earlierVersion}</span>
                  )}
                  <button
                    type="button"
                    className="button button-ghost icon-button button-sm"
                    aria-label={t.removeLabel(highlight.text.slice(0, 60))}
                    title={t.remove}
                    onClick={() => void onRemove(highlight).catch(() => undefined)}
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
