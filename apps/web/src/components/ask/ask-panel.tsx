"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { BookOpenText, MessageCircleQuestion, Quote, Send, X } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { askQuestion, type AnswerSource } from "../../lib/ask-api";
import { BookwiseConnectionError, BookwiseRequestError } from "../../lib/bookwise-api";
import { useMessages } from "../../lib/i18n/messages";
import { askMessages, type AskFailure } from "../../lib/i18n/messages/ask";
import { Spinner } from "../ui/loading";
import "../book/reader.css";

interface AnswerItem {
  id: number;
  question: string;
  status: "streaming" | "done" | "error";
  text: string;
  sources: AnswerSource[];
  answered?: boolean;
  cached?: boolean;
  /** Supporting sentence per rendered marker, in text order (after `done`). */
  markerQuotes?: (string | null)[];
  /** Why it failed; the text is chosen at render so it follows the interface language. */
  failure?: AskFailure;
}

/** Where a quote card's "View in context" leads. */
export type ViewInContext = (bookId: string, spanId: string, label: string, opener: HTMLElement) => void;

interface AnswerContext {
  /** Book of the page, for answers cached before sources named their book. */
  defaultBookId?: string;
  showBookTitles: boolean;
  labelFor(location: Record<string, unknown>): string;
  onViewInContext: ViewInContext;
}

const MAX_QUESTION = 500;

/** Classifies a rejected ask request (before streaming started). */
function failureOf(error: unknown): AskFailure {
  if (error instanceof BookwiseConnectionError) {
    return "connection";
  }
  if (error instanceof BookwiseRequestError) {
    if (error.status === 422) {
      return "invalid";
    }
    if (error.status === 404) {
      return "notFound";
    }
  }
  return "generic";
}

/**
 * Ask a question of one book or the whole library: the answer streams in from
 * retrieved passages, with [n] markers that open the sentence behind each claim.
 */
export function AskPanel({
  askPath,
  heading,
  lede,
  placeholder,
  initialQuestion = "",
  ...context
}: {
  askPath: string;
  /** Prefilled (not sent) question, focused so Enter asks it. */
  initialQuestion?: string;
  heading: string;
  lede: string;
  placeholder: string;
} & AnswerContext) {
  const { getAccessTokenSilently } = useAuth0();
  const t = useMessages(askMessages);
  const [question, setQuestion] = useState(initialQuestion.slice(0, MAX_QUESTION));
  const [answers, setAnswers] = useState<AnswerItem[]>([]);
  const nextId = useRef(1);
  const busy = answers.some((answer) => answer.status === "streaming");
  const trimmed = question.trim();

  function update(id: number, change: (answer: AnswerItem) => AnswerItem) {
    setAnswers((current) => current.map((answer) => (answer.id === id ? change(answer) : answer)));
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || trimmed.length < 3) {
      return;
    }
    const id = nextId.current++;
    setAnswers((current) => [
      { id, question: trimmed, status: "streaming", text: "", sources: [] },
      ...current,
    ]);
    setQuestion("");

    try {
      await askQuestion(getAccessTokenSilently, askPath, trimmed, (streamed) => {
        if (streamed.event === "sources") {
          update(id, (answer) => ({ ...answer, sources: streamed.data.sources }));
        } else if (streamed.event === "delta") {
          update(id, (answer) => ({ ...answer, text: answer.text + streamed.data.text }));
        } else if (streamed.event === "done") {
          update(id, (answer) => ({ ...answer, status: "done", ...streamed.data }));
        } else {
          update(id, (answer) => ({ ...answer, status: "error", failure: streamed.data.code }));
        }
      });
      update(id, (answer) => (answer.status === "streaming" ? { ...answer, status: "done" } : answer));
    } catch (failure) {
      update(id, (answer) => ({
        ...answer,
        status: "error",
        failure: failureOf(failure),
      }));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <section className="ask-panel" aria-labelledby="ask-title">
      <h2 id="ask-title">
        <MessageCircleQuestion aria-hidden="true" size={17} />
        {heading}
      </h2>
      <p className="ask-lede">{lede}</p>
      <form className="ask-form" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="ask-question">
          {heading}
        </label>
        <textarea
          id="ask-question"
          rows={2}
          value={question}
          maxLength={MAX_QUESTION}
          placeholder={placeholder}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={onKeyDown}
          autoFocus={Boolean(initialQuestion)}
        />
        <button className="button button-ink button-sm" type="submit" disabled={busy || trimmed.length < 3}>
          {busy ? <Spinner size="sm" /> : <Send aria-hidden="true" size={15} />}
          {t.ask}
        </button>
      </form>

      <ol className="ask-answers">
        {answers.map((answer) => (
          <li key={answer.id} className="ask-answer">
            <p className="ask-question">{answer.question}</p>
            <AnswerBody answer={answer} {...context} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function AnswerBody({
  answer,
  defaultBookId,
  showBookTitles,
  labelFor,
  onViewInContext,
}: { answer: AnswerItem } & AnswerContext) {
  // The open marker is tracked by its position, since one source can be cited twice.
  const [openMarker, setOpenMarker] = useState<{ key: string; n: number; ordinal: number }>();
  const markerRefs = useRef(new Map<string, HTMLButtonElement>());
  const t = useMessages(askMessages);
  const byNumber = new Map(answer.sources.map((source) => [source.n, source]));
  const source = openMarker ? byNumber.get(openMarker.n) : undefined;
  // The sentence matched to this claim, else the passage's evidence quote.
  const quote = openMarker ? (answer.markerQuotes?.[openMarker.ordinal] ?? source?.quote) : undefined;
  const sourceLabel = (cited: AnswerSource) =>
    showBookTitles && cited.bookTitle
      ? `${cited.bookTitle} · ${labelFor(cited.location)}`
      : labelFor(cited.location);

  function close() {
    const key = openMarker?.key;
    setOpenMarker(undefined);
    if (key) {
      markerRefs.current.get(key)?.focus();
    }
  }

  if (answer.status === "error") {
    return (
      <p className="ask-error" role="alert">
        {t.failures[answer.failure ?? "generic"] ?? t.failures.generic}
      </p>
    );
  }
  if (answer.status === "done" && answer.answered === false) {
    return (
      <p className="ask-not-found" role="status">
        {showBookTitles ? t.notFoundLibrary : t.notFound}
      </p>
    );
  }

  // Split "text [2][3] more" into text and citation buttons; unknown numbers are dropped.
  const parts: ReactNode[] = [];
  const pattern = /\[(\d+)\]/g;
  let last = 0;
  let ordinal = 0;
  for (const match of answer.text.matchAll(pattern)) {
    parts.push(answer.text.slice(last, match.index));
    const n = Number(match[1]);
    const cited = byNumber.get(n);
    if (cited) {
      const key = `${match.index}-${n}`;
      const markerOrdinal = ordinal++;
      parts.push(
        <button
          key={key}
          ref={(element) => {
            if (element) {
              markerRefs.current.set(key, element);
            }
          }}
          type="button"
          className="reader-cite"
          aria-expanded={openMarker?.key === key}
          aria-label={t.showSource(n, sourceLabel(cited))}
          onClick={() =>
            setOpenMarker(openMarker?.key === key ? undefined : { key, n, ordinal: markerOrdinal })
          }
        >
          {n}
        </button>,
      );
    }
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(answer.text.slice(last));

  return (
    <div
      className="ask-body"
      aria-busy={answer.status === "streaming"}
      onKeyDown={(event) => {
        if (event.key === "Escape" && openMarker) {
          event.stopPropagation();
          close();
        }
      }}
    >
      {answer.text ? (
        <p className="ask-text">{parts}</p>
      ) : (
        <p className="ask-thinking">
          <Spinner size="sm" /> {t.thinking}
        </p>
      )}
      {answer.status === "done" && (
        <p className="ask-meta" role="status">
          {answer.cached ? t.answeredEarlier : t.answerReady}
        </p>
      )}
      {source && (
        <section className="quote-card" role="region" aria-label={t.source(source.n)}>
          <header className="quote-card-header">
            <span>
              <Quote aria-hidden="true" size={14} />
              {t.source(source.n)}
            </span>
            <button type="button" className="button button-ghost icon-button button-sm" aria-label={t.closeSource} onClick={close}>
              <X aria-hidden="true" size={16} />
            </button>
          </header>
          {quote ? (
            <blockquote>“{quote}”</blockquote>
          ) : (
            <p className="quote-card-empty">{t.noQuote}</p>
          )}
          <div className="quote-card-meta">
            <span>{sourceLabel(source)}</span>
            <button
              type="button"
              className="button button-line button-sm"
              onClick={(event) => {
                const bookId = source.bookId ?? defaultBookId;
                if (bookId) {
                  onViewInContext(bookId, source.sourceSpanId, sourceLabel(source), event.currentTarget);
                }
              }}
            >
              <BookOpenText aria-hidden="true" size={14} />
              {t.viewInContext}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
