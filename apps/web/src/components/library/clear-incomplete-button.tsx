"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { Eraser } from "lucide-react";
import { useRef, useState } from "react";

import { clearIncompleteUploads } from "../../lib/book-management";
import { useMessages } from "../../lib/i18n/messages";
import { libraryMessages } from "../../lib/i18n/messages/library";
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
  const t = useMessages(libraryMessages);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);

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
        ref={buttonRef}
        className="button button-line button-sm lib-clear-incomplete"
        type="button"
        onClick={() => setConfirming(true)}
      >
        <Eraser aria-hidden="true" size={15} />
        {t.clearButton(count)}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {notice}
      </span>
      {confirming && (
        <ConfirmDialog
          title={t.clearTitle(count)}
          body={t.clearBody}
          confirmLabel={t.clearConfirm}
          onConfirm={async () => {
            const deleted = await clearIncompleteUploads(getAccessTokenSilently);
            setNotice(t.cleared(deleted));
            onCleared();
          }}
          onClose={() => {
            setConfirming(false);
            // After the modal is removed; the button is gone once everything is cleared.
            requestAnimationFrame(() => buttonRef.current?.focus());
          }}
        />
      )}
    </>
  );
}
