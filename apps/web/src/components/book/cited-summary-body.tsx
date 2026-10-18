"use client";

import { BookOpenText, Quote, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { useMessages } from "../../lib/i18n/messages";
import { readerMessages } from "../../lib/i18n/messages/reader";
import type { SummarySentence } from "../../lib/library-types";

type Open = { paragraph: number; sentence: number };

/**
 * The summary with numbered source markers after each cited sentence.
 * Activating a marker expands a quote card after its paragraph showing the
 * verbatim words from the book (progressive disclosure: no floating layer,
 * same behaviour on touch and keyboard, natural tab order).
 */
export function CitedSummaryBody({
  paragraphs,
  labelFor,
  onViewInContext,
}: {
  paragraphs: SummarySentence[][];
  labelFor(location: Record<string, unknown>): string;
  onViewInContext(spanId: string, label: string, opener: HTMLElement): void;
}) {
  const [open, setOpen] = useState<Open>();
  const [hovered, setHovered] = useState<string>();
  const markerRefs = useRef(new Map<string, HTMLButtonElement>());
  const t = useMessages(readerMessages);

  const key = (paragraph: number, sentence: number) => `${paragraph}:${sentence}`;

  function close(returnFocus: boolean) {
    const current = open;
    setOpen(undefined);
    if (returnFocus && current) {
      markerRefs.current.get(key(current.paragraph, current.sentence))?.focus();
    }
  }

  function onEscape(event: KeyboardEvent) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      close(true);
    }
  }

  return (
    <div className="reader-body" onKeyDown={onEscape}>
      {paragraphs.map((sentences, paragraphIndex) => {
        const openSentence =
          open?.paragraph === paragraphIndex ? sentences[open.sentence] : undefined;
        const cardId = `quote-card-${paragraphIndex}`;

        return (
          <div className="reader-paragraph" key={paragraphIndex}>
            <p>
              {sentences.map((sentence, sentenceIndex) => {
                const id = key(paragraphIndex, sentenceIndex);
                const isOpen =
                  open?.paragraph === paragraphIndex && open.sentence === sentenceIndex;
                return (
                  <span key={id}>
                    <span
                      className="reader-sentence"
                      data-active={isOpen || hovered === id || undefined}
                    >
                      {sentence.text}
                    </span>
                    {sentence.citations.length > 0 && (
                      <button
                        ref={(element) => {
                          if (element) {
                            markerRefs.current.set(id, element);
                          } else {
                            markerRefs.current.delete(id);
                          }
                        }}
                        type="button"
                        className="reader-cite"
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? cardId : undefined}
                        aria-label={t.showSourceQuotes(
                          sentence.citations.length,
                          sentence.citations
                            .map((citation) => t.sourceItem(citation.order, labelFor(citation.location)))
                            .join("; "),
                        )}
                        onClick={() =>
                          isOpen
                            ? close(false)
                            : setOpen({ paragraph: paragraphIndex, sentence: sentenceIndex })
                        }
                        onMouseEnter={() => setHovered(id)}
                        onMouseLeave={() => setHovered(undefined)}
                        onFocus={() => setHovered(id)}
                        onBlur={() => setHovered(undefined)}
                      >
                        {sentence.citations.map((citation) => citation.order).join(",")}
                      </button>
                    )}{" "}
                  </span>
                );
              })}
            </p>

            {openSentence && (
              <section
                className="quote-card"
                id={cardId}
                role="region"
                aria-label={t.quoteCardLabel}
              >
                <header className="quote-card-header">
                  <span>
                    <Quote aria-hidden="true" size={14} />
                    {t.fromTheBook}
                  </span>
                  <button
                    type="button"
                    className="button button-ghost icon-button button-sm"
                    aria-label={t.closeQuotes}
                    onClick={() => close(true)}
                  >
                    <X aria-hidden="true" size={16} />
                  </button>
                </header>
                <ol className="quote-card-list">
                  {openSentence.citations.map((citation) => {
                    const label = labelFor(citation.location);
                    return (
                      <li key={citation.sourceSpanId}>
                        <span className="quote-card-number" aria-hidden="true">
                          {citation.order}
                        </span>
                        <div>
                          {citation.quote ? (
                            <blockquote>“{citation.quote}”</blockquote>
                          ) : (
                            <p className="quote-card-empty">{t.noQuote}</p>
                          )}
                          <div className="quote-card-meta">
                            <span>{label}</span>
                            <button
                              type="button"
                              className="button button-line button-sm"
                              onClick={(event) =>
                                onViewInContext(citation.sourceSpanId, label, event.currentTarget)
                              }
                            >
                              <BookOpenText aria-hidden="true" size={14} />
                              {t.viewInContext}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
          </div>
        );
      })}
    </div>
  );
}
