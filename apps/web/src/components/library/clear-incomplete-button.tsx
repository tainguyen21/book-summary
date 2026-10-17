"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { Eraser } from "lucide-react";
import { useState } from "react";

import { clearIncompleteUploads } from "../../lib/book-management";
import { ConfirmDialog } from "./book-management-dialogs";
import "./book-management.css";

/** Removes every upload that never finished; shown only when there are some. */
export function ClearIncompleteButton({
  count,
  onCleared,
}: {
  count: number;
  onCleared(): void;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");

  if (count === 0) {
    return (
      <span className="visually-hidden" role="status" aria-live="polite">
        {notice}
      </span>
    );
  }

  return (
    <>
      <button
        className="button button-line button-sm lib-clear-incomplete"
        type="button"
        onClick={() => setConfirming(true)}
      >
        <Eraser aria-hidden="true" size={15} />
        Clear incomplete uploads ({count})
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {notice}
      </span>
      {confirming && (
        <ConfirmDialog
          title={`Clear ${count} incomplete upload${count === 1 ? "" : "s"}?`}
          body="These files never finished uploading, so they have no summary. This can’t be undone."
          confirmLabel="Clear uploads"
          onConfirm={async () => {
            const deleted = await clearIncompleteUploads(getAccessTokenSilently);
            setNotice(`Cleared ${deleted} incomplete upload${deleted === 1 ? "" : "s"}.`);
            onCleared();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
