"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";

import { bookwiseApi } from "../../lib/bookwise-api";
import { searchResponseSchema, type SearchResponse } from "../../lib/search-types";

export const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; query: string; response: SearchResponse };

type Settled =
  | { query: string; kind: "ready"; response: SearchResponse }
  | { query: string; kind: "error" };

/**
 * Debounced search. Idle and loading are derived from the current query, so
 * the effect only stores settled responses (and only for the latest query).
 */
export function useBookSearch(query: string): SearchState {
  const { getAccessTokenSilently } = useAuth0();
  const [settled, setSettled] = useState<Settled>();
  const trimmed = query.trim();
  const searchable = trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!searchable) {
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      bookwiseApi(
        getAccessTokenSilently,
        `/v1/search?q=${encodeURIComponent(trimmed)}`,
        { method: "GET" },
        searchResponseSchema,
      )
        .then((response) => active && setSettled({ query: trimmed, kind: "ready", response }))
        .catch(() => active && setSettled({ query: trimmed, kind: "error" }));
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [getAccessTokenSilently, searchable, trimmed]);

  if (!searchable) {
    return { kind: "idle" };
  }
  if (settled?.query !== trimmed) {
    return { kind: "loading" };
  }
  return settled.kind === "ready"
    ? { kind: "ready", query: trimmed, response: settled.response }
    : { kind: "error" };
}
