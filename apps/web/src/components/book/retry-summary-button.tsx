"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { retryBook } from "../../lib/book-management";
import { Spinner } from "../ui/loading";

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
  const [error, setError] = useState<string>();

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
              setError(failure instanceof Error ? failure.message : "Retry failed.");
              setBusy(false);
            });
        }}
      >
        {busy ? <Spinner size="sm" /> : <RotateCcw aria-hidden="true" size={15} />}
        Retry summary
      </button>
      {error && (
        <span className="bm-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
