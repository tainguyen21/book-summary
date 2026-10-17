"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { BookOpenText, MessageCircleQuestion, Quote, Send, X } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { askBook, type AnswerSource } from "../../lib/ask-api";
import { Spinner } from "../ui/loading";

interface AnswerItem {
  id: number;
  question: string;
  status: "streaming" | "done" | "error";
  text: string;
  sources: AnswerSource[];
  answered?: boolean;
  cached?: boolean;
  error?: string;
}

const MAX_QUESTION = 500;

/**
 * "Ask this book": answers stream in from the book's own passages, with [n]
 * markers that open the verbatim quote behind each claim.
 */
export function AskBookPanel({
  bookId,
  labelFor,
  onViewInContext,
}: {
  bookId: string;
  labelFor(location: Record<string, unknown>): string;
  onViewInContext(spanId: string, label: string, opener: HTMLElement): void;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const [question, setQuestion] = useState("");
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
      await askBook(getAccessTokenSilently, bookId, trimmed, (streamed) => {
        if (streamed.event === "sources") {
          update(id, (answer) => ({ ...answer, sources: streamed.data.sources }));
        } else if (streamed.event === "delta") {
          update(id, (answer) => ({ ...answer, text: answer.text + streamed.data.text }));
        } else if (streamed.event === "done") {
          update(id, (answer) => ({ ...answer, status: "done", ...streamed.data }));
        } else {
          update(id, (answer) => ({ ...answer, status: "error", error: streamed.data.message }));
        }
      });
      update(id, (answer) => (answer.status === "streaming" ? { ...answer, status: "done" } : answer));
    } catch (failure) {
      update(id, (answer) => ({
        ...answer,
        status: "error",
        error: failure instanceof Error ? failure.message : "Something went wrong.",
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
        Ask this book
      </h2>
      <p className="ask-lede">Answers come only from this book, with the quotes they rely on.</p>
      <form className="ask-form" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="ask-question">
          Your question about this book
        </label>
        <textarea
          id="ask-question"
          rows={2}
          value={question}
          maxLength={MAX_QUESTION}
          placeholder="e.g. Why did the first trees die?"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="button button-ink button-sm" type="submit" disabled={busy || trimmed.length < 3}>
          {busy ? <Spinner size="sm" /> : <Send aria-hidden="true" size={15} />}
          Ask
        </button>
      </form>

      <ol className="ask-answers">
        {answers.map((answer) => (
          <li key={answer.id} className="ask-answer">
            <p className="ask-question">{answer.question}</p>
            <AnswerBody answer={answer} labelFor={labelFor} onViewInContext={onViewInContext} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function AnswerBody({
  answer,
  labelFor,
  onViewInContext,
}: {
  answer: AnswerItem;
  labelFor(location: Record<string, unknown>): string;
  onViewInContext(spanId: string, label: string, opener: HTMLElement): void;
}) {
  // The open marker is tracked by its position, since one source can be cited twice.
  const [openMarker, setOpenMarker] = useState<{ key: string; n: number }>();
  const markerRefs = useRef(new Map<string, HTMLButtonElement>());
  const byNumber = new Map(answer.sources.map((source) => [source.n, source]));
  const source = openMarker ? byNumber.get(openMarker.n) : undefined;

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
        {answer.error}
      </p>
    );
  }
  if (answer.status === "done" && answer.answered === false) {
    return (
      <p className="ask-not-found" role="status">
        This book doesn’t seem to answer that. Try asking about something it covers.
      </p>
    );
  }

  // Split "text [2][3] more" into text and citation buttons; unknown numbers are dropped.
  const parts: ReactNode[] = [];
  const pattern = /\[(\d+)\]/g;
  let last = 0;
  for (const match of answer.text.matchAll(pattern)) {
    parts.push(answer.text.slice(last, match.index));
    const n = Number(match[1]);
    const cited = byNumber.get(n);
    if (cited) {
      const key = `${match.index}-${n}`;
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
          aria-label={`Show source ${n}: ${labelFor(cited.location)}`}
          onClick={() => setOpenMarker(openMarker?.key === key ? undefined : { key, n })}
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
          <Spinner size="sm" /> Reading the book…
        </p>
      )}
      {answer.status === "done" && (
        <p className="ask-meta" role="status">
          {answer.cached ? "Answered earlier · instant" : "Answer ready"}
        </p>
      )}
      {source && (
        <section className="quote-card" role="region" aria-label={`Source ${source.n}`}>
          <header className="quote-card-header">
            <span>
              <Quote aria-hidden="true" size={14} />
              Source {source.n}
            </span>
            <button type="button" className="button button-ghost icon-button button-sm" aria-label="Close source" onClick={close}>
              <X aria-hidden="true" size={16} />
            </button>
          </header>
          {source.quote ? (
            <blockquote>“{source.quote}”</blockquote>
          ) : (
            <p className="quote-card-empty">No short quote was recorded for this passage.</p>
          )}
          <div className="quote-card-meta">
            <span>{labelFor(source.location)}</span>
            <button
              type="button"
              className="button button-line button-sm"
              onClick={(event) => onViewInContext(source.sourceSpanId, labelFor(source.location), event.currentTarget)}
            >
              <BookOpenText aria-hidden="true" size={14} />
              View in context
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
