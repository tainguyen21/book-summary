"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";

import { loadHighlights, removeHighlight, saveHighlight, type Highlight } from "../../lib/highlights-api";

export const sentenceKey = (paragraph: number, sentence: number) => `${paragraph}:${sentence}`;

/** The owner's highlights for a book, with save and remove that update in place. */
export function useHighlights(bookId: string, summaryId: string) {
  const { getAccessTokenSilently } = useAuth0();
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    let active = true;
    loadHighlights(getAccessTokenSilently, bookId)
      .then((loaded) => active && setHighlights(loaded))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [bookId, getAccessTokenSilently]);

  /** Current-summary highlights by sentence position. */
  const current = new Map(
    highlights
      .filter((highlight) => highlight.summaryId === summaryId)
      .map((highlight) => [sentenceKey(highlight.paragraph, highlight.sentence), highlight]),
  );

  const save = useCallback(
    async (paragraph: number, sentence: number, note?: string) => {
      const saved = await saveHighlight(getAccessTokenSilently, bookId, { summaryId, paragraph, sentence, note });
      setHighlights((list) => [...list.filter((item) => item.id !== saved.id), saved]);
      return saved;
    },
    [bookId, getAccessTokenSilently, summaryId],
  );

  const remove = useCallback(
    async (highlightId: string) => {
      await removeHighlight(getAccessTokenSilently, highlightId);
      setHighlights((list) => list.filter((item) => item.id !== highlightId));
    },
    [getAccessTokenSilently],
  );

  return { highlights, current, save, remove };
}
