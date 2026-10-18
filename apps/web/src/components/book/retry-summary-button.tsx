"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { retryBook } from "../../lib/book-management";
import { BookwiseConnectionError, BookwiseRequestError } from "../../lib/bookwise-api";
import { useMessages } from "../../lib/i18n/messages";
import { bookMessages } from "../../lib/i18n/messages/book";
import { Spinner } from "../ui/loading";

type RetryFailure = "notFailed" | "notFound" | "connection" | "failed";

/** Classifies a retry rejection so its text follows the interface language. */
function retryFailure(failure: unknown): RetryFailure {
  if (failure instanceof BookwiseConnectionError) {
    return "connection";
  }
  if (failure instanceof BookwiseRequestError) {
    if (failure.status === 409) {
      return "notFailed";
    }
    if (failure.status === 404) {
      return "notFound";
    }
  }
  return "failed";
}

/** Requeues a permanently failed summary, then lets the page reload its state. */
export function RetrySummaryButton({
  bookId,
  onRetried,
}: {
  bookId: string;
  onRetried(): void;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RetryFailure>();
  const t = useMessages(bookMessages);
  const errorText: Record<RetryFailure, string> = {
    notFailed: t.retryNotFailed,
    notFound: t.retryNotFound,
    connection: t.retryConnection,
    failed: t.retryFailed,
  };

  return (
    <>
      <button
        className="button button-ink button-sm"
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(undefined);
          retryBook(getAccessTokenSilently, bookId)
            .then(onRetried)
            .catch((failure: unknown) => {
              setError(retryFailure(failure));
              setBusy(false);
            });
        }}
      >
        {busy ? <Spinner size="sm" /> : <RotateCcw aria-hidden="true" size={15} />}
        {t.retrySummary}
      </button>
      {error && (
        <span className="bm-error" role="alert">
          {errorText[error]}
        </span>
      )}
    </>
  );
}
