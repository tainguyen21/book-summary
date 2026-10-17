"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";

import { bookwiseApi } from "../../lib/bookwise-api";
import {
  bookProcessingStatusSchema,
  bookSummarySchema,
  type BookProcessingStatus,
  type BookSummary,
} from "../../lib/library-types";

export type DetailState =
  | { kind: "loading" }
  | { kind: "upload-incomplete" }
  | { kind: "processing"; status: BookProcessingStatus }
  | { kind: "needs-review" }
  | { kind: "ready"; summary: BookSummary }
  | { kind: "failed"; status: BookProcessingStatus }
  | { kind: "unavailable" }
  | { kind: "error" };

/**
 * Loads a book's processing state and, once complete, its accepted summary.
 * Polls every 5s only while processing; incomplete uploads stop polling.
 */
export function useBookDetail(bookId: string) {
  const { getAccessTokenSilently } = useAuth0();
  const [state, setState] = useState<DetailState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  const requestDetail = useCallback(async (): Promise<DetailState> => {
    let status: BookProcessingStatus;

    try {
      status = await bookwiseApi(
        getAccessTokenSilently,
        `/v1/books/${bookId}/processing`,
        { method: "GET" },
        bookProcessingStatusSchema,
      );
    } catch {
      return { kind: "error" };
    }

    if (status.bookStatus === "pending_upload") {
      return { kind: "upload-incomplete" };
    }

    if (status.runStatus === "needs_review") {
      return { kind: "needs-review" };
    }

    if (
      status.runStatus === "permanent_failed" ||
      status.commandStatus === "failed" ||
      status.bookStatus === "failed"
    ) {
      return { kind: "failed", status };
    }

    if (status.runStatus !== "completed") {
      return { kind: "processing", status };
    }

    try {
      const summary = await bookwiseApi(
        getAccessTokenSilently,
        `/v1/books/${bookId}/summary`,
        { method: "GET" },
        bookSummarySchema,
      );

      return { kind: "ready", summary };
    } catch {
      return { kind: "unavailable" };
    }
  }, [bookId, getAccessTokenSilently]);

  useEffect(() => {
    let active = true;
    let uploadIncomplete = false;
    let inFlight = false;
    let interval: number | undefined;

    const poll = () => {
      if (document.hidden || uploadIncomplete || inFlight) {
        return;
      }

      inFlight = true;
      void requestDetail().then((nextState) => {
        inFlight = false;
        if (!active) {
          return;
        }

        setState(nextState);
        uploadIncomplete = nextState.kind === "upload-incomplete";
        if (nextState.kind === "processing" && interval === undefined) {
          interval = window.setInterval(poll, 5000);
        }
        if (nextState.kind !== "processing" && interval !== undefined) {
          window.clearInterval(interval);
          interval = undefined;
        }
      });
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        poll();
      }
    };

    poll();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [requestDetail, reloadKey]);

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    setReloadKey((key) => key + 1);
  }, []);

  return { state, reload };
}
