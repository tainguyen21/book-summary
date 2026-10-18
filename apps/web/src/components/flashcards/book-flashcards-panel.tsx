"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { Layers } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BookwiseRequestError } from "../../lib/bookwise-api";
import { loadBookDeck, makeBookDeck, type Flashcard } from "../../lib/flashcards-api";
import { useMessages } from "../../lib/i18n/messages";
import { textLanguage } from "../../lib/text-language";
import { flashcardMessages } from "../../lib/i18n/messages/flashcards";
import { Spinner } from "../ui/loading";
import "./flashcards.css";

type DeckState =
  | { kind: "loading" }
  | { kind: "ready"; cards: Flashcard[] }
  | { kind: "making"; cards: Flashcard[] }
  | { kind: "error"; cards: Flashcard[]; reason: "budget" | "unavailable" | "generic" };

/** The book's flashcard deck: make it from the summary, then review it on /review. */
export function BookFlashcardsPanel({ bookId }: { bookId: string }) {
  const { getAccessTokenSilently } = useAuth0();
  const t = useMessages(flashcardMessages);
  const [state, setState] = useState<DeckState>({ kind: "loading" });
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    loadBookDeck(getAccessTokenSilently, bookId)
      .then(({ cards }) => active && setState({ kind: "ready", cards }))
      .catch(() => active && setState({ kind: "ready", cards: [] }));
    return () => {
      active = false;
    };
  }, [bookId, getAccessTokenSilently]);

  const cards = state.kind === "loading" ? [] : state.cards;
  const due = cards.filter((card) => new Date(card.due) <= new Date()).length;

  async function make() {
    setConfirming(false);
    setState({ kind: "making", cards });
    try {
      setState({ kind: "ready", cards: await makeBookDeck(getAccessTokenSilently, bookId) });
    } catch (error) {
      const reason =
        error instanceof BookwiseRequestError && error.status === 429
          ? "budget"
          : error instanceof BookwiseRequestError && error.status === 503
            ? "unavailable"
            : "generic";
      setState({ kind: "error", cards, reason });
    }
  }

  return (
    <section className="deck-panel" aria-labelledby="deck-title" aria-busy={state.kind === "making"}>
      <h2 id="deck-title">
        <Layers aria-hidden="true" size={17} />
        {t.deckHeading}
      </h2>
      <p className="deck-lede">{t.deckLede}</p>

      {state.kind === "loading" ? null : cards.length === 0 ? (
        <button className="button button-ink button-sm" type="button" onClick={make} disabled={state.kind === "making"}>
          {state.kind === "making" ? <Spinner size="sm" /> : <Layers aria-hidden="true" size={15} />}
          {state.kind === "making" ? t.making : t.makeDeck}
        </button>
      ) : (
        <>
          <p className="deck-summary" role="status">
            {t.deckCount(cards.length)} · {t.dueNow(due)}
          </p>
          <div className="deck-actions">
            <Link className="button button-ink button-sm" href="/review">
              {t.reviewNow}
            </Link>
            {confirming ? (
              <span className="deck-confirm">
                <span>{t.remakeConfirm}</span>
                <button className="button button-line button-sm" type="button" onClick={make}>
                  {t.remakeYes}
                </button>
                <button className="button button-ghost button-sm" type="button" onClick={() => setConfirming(false)}>
                  {t.cancel}
                </button>
              </span>
            ) : (
              <button
                className="button button-ghost button-sm"
                type="button"
                onClick={() => setConfirming(true)}
                disabled={state.kind === "making"}
              >
                {state.kind === "making" ? <Spinner size="sm" /> : null}
                {state.kind === "making" ? t.making : t.remake}
              </button>
            )}
          </div>
          <details className="deck-list">
            <summary>{t.showCards}</summary>
            <ol>
              {cards.map((card) => (
                <li key={card.id} lang={textLanguage(`${card.front} ${card.back}`)}>
                  <b>{card.front}</b>
                  <span>{card.back}</span>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}

      {state.kind === "error" && (
        <p className="deck-error" role="alert">
          {state.reason === "budget"
            ? t.errorBudget
            : state.reason === "unavailable"
              ? t.errorUnavailable
              : t.errorGeneric}
        </p>
      )}
    </section>
  );
}
