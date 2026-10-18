"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { BookOpenText, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadDueCards, reviewCard, type Flashcard, type ReviewRating } from "../../lib/flashcards-api";
import { useMessages } from "../../lib/i18n/messages";
import { textLanguage } from "../../lib/text-language";
import { flashcardMessages } from "../../lib/i18n/messages/flashcards";
import { AppShell } from "../app-shell/app-shell";
import { PassageDialog } from "../book/passage-dialog";
import { StateCallout } from "../layout/state-callout";
import { useLibraryBooks } from "../library/use-library-books";
import { Spinner } from "../ui/loading";
import "./flashcards.css";

type ReviewState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; cards: Flashcard[]; index: number; revealed: boolean };

const RATINGS: { rating: ReviewRating; key: "again" | "hard" | "good" | "easy" }[] = [
  { rating: 1, key: "again" },
  { rating: 2, key: "hard" },
  { rating: 3, key: "good" },
  { rating: 4, key: "easy" },
];

/** Reviews due flashcards one at a time: reveal the answer, then rate recall (FSRS). */
export function ReviewScreen() {
  const library = useLibraryBooks();
  const { getAccessTokenSilently } = useAuth0();
  const t = useMessages(flashcardMessages);
  const [state, setState] = useState<ReviewState>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<{ bookId: string; spanId: string; label: string }>();
  const sourceOpener = useRef<HTMLElement | null>(null);
  const answerRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(() => {
    loadDueCards(getAccessTokenSilently)
      .then(({ cards }) => setState({ kind: "ready", cards, index: 0, revealed: false }))
      .catch(() => setState({ kind: "error" }));
  }, [getAccessTokenSilently]);

  useEffect(() => {
    load();
  }, [load]);

  const card = state.kind === "ready" ? state.cards[state.index] : undefined;
  const revealed = state.kind === "ready" && state.revealed;

  const reveal = useCallback(() => {
    setState((current) => (current.kind === "ready" ? { ...current, revealed: true } : current));
  }, []);

  const rate = useCallback(
    async (rating: ReviewRating) => {
      if (!card || saving) {
        return;
      }
      setSaving(true);
      try {
        await reviewCard(getAccessTokenSilently, card.id, rating);
        setState((current) =>
          current.kind === "ready" ? { ...current, index: current.index + 1, revealed: false } : current,
        );
      } catch {
        setState({ kind: "error" });
      } finally {
        setSaving(false);
      }
    },
    [card, getAccessTokenSilently, saving],
  );

  // Space or Enter reveals; 1–4 rate. Ignored while typing or with a dialog open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        !card ||
        source ||
        event.metaKey ||
        event.ctrlKey ||
        target?.closest("input, textarea, select, dialog")
      ) {
        return;
      }
      // Buttons and links handle Space and Enter themselves.
      const onControl = Boolean(target?.closest("button, a"));
      if (!revealed && !onControl && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        reveal();
      } else if (revealed && ["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        void rate(Number(event.key) as ReviewRating);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [card, rate, reveal, revealed, source]);

  // Keep keyboard focus on the card's main control as cards change.
  useEffect(() => {
    if (card && !revealed) {
      answerRef.current?.focus();
    }
  }, [card, revealed]);

  return (
    <AppShell
      books={library.state.kind === "ready" ? library.state.books : undefined}
      onUploaded={library.refresh}
      reviewActive
    >
      <div className="shell-content review-page">
        <header className="review-heading">
          <h1>{t.reviewTitle}</h1>
          <p>{t.reviewLede}</p>
        </header>

        {state.kind === "loading" && (
          <p className="review-loading" role="status">
            <Spinner size="sm" /> {t.loading}
          </p>
        )}
        {state.kind === "error" && (
          <StateCallout
            tone="danger"
            title={t.loadError}
            body=""
            action={
              <button
                className="button button-line button-sm"
                type="button"
                onClick={() => {
                  setState({ kind: "loading" });
                  load();
                }}
              >
                {t.tryAgain}
              </button>
            }
          />
        )}

        {state.kind === "ready" && !card && (
          <div className="review-done" role="status">
            <PartyPopper aria-hidden="true" size={28} />
            <h2>{t.caughtUpTitle}</h2>
            <p>{state.index > 0 ? t.reviewedCount(state.index) : t.caughtUpBody}</p>
            <Link className="button button-line button-sm" href="/library">
              {t.backToLibrary}
            </Link>
          </div>
        )}

        {state.kind === "ready" && card && (
          <section className="review-card" aria-labelledby="review-question" aria-busy={saving}>
            <p className="review-progress">
              <span>{t.progress(state.index + 1, state.cards.length)}</span>
              <span>{t.fromBook(card.bookTitle)}</span>
            </p>
            <p className="review-label">{t.question}</p>
            <h2 id="review-question" className="review-front" lang={textLanguage(card.front)}>
              {card.front}
            </h2>

            {revealed ? (
              <>
                <p className="review-label">{t.answer}</p>
                <p className="review-back" aria-live="polite" lang={textLanguage(card.back)}>
                  {card.back}
                </p>
                {card.sourceSpanIds[0] && (
                  <button
                    className="button button-ghost button-sm review-source"
                    type="button"
                    onClick={(event) => {
                      sourceOpener.current = event.currentTarget;
                      setSource({ bookId: card.bookId, spanId: card.sourceSpanIds[0], label: card.bookTitle });
                    }}
                  >
                    <BookOpenText aria-hidden="true" size={14} />
                    {t.viewSource}
                  </button>
                )}
                <fieldset className="review-ratings">
                  <legend>{t.rateLabel}</legend>
                  {RATINGS.map(({ rating, key }) => (
                    <button
                      key={rating}
                      className={`button button-line review-rate rate-${key}`}
                      type="button"
                      disabled={saving}
                      aria-keyshortcuts={String(rating)}
                      onClick={() => void rate(rating)}
                    >
                      <kbd aria-hidden="true">{rating}</kbd>
                      {t[key]}
                    </button>
                  ))}
                </fieldset>
              </>
            ) : (
              <button ref={answerRef} className="button button-ink review-reveal" type="button" onClick={reveal}>
                {t.showAnswer}
              </button>
            )}
            <p className="review-hint">{t.keyboardHint}</p>
          </section>
        )}
      </div>

      {source && (
        <PassageDialog
          bookId={source.bookId}
          sourceSpanId={source.spanId}
          label={source.label}
          onClose={() => {
            setSource(undefined);
            const opener = sourceOpener.current;
            requestAnimationFrame(() => opener?.focus());
          }}
        />
      )}
    </AppShell>
  );
}
