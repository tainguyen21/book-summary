"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { deleteBook, renameBook, retryBook } from "../../lib/book-management";
import type { LibraryBook } from "../../lib/library-types";
import { useMessages } from "../../lib/i18n/messages";
import { libraryMessages } from "../../lib/i18n/messages/library";
import { ConfirmDialog, RenameDialog } from "./book-management-dialogs";
import "./book-management.css";

type OpenDialog = "rename" | "delete" | undefined;

/** A failed summary can be retried; a running one cannot be deleted. */
export function canRetry(book: Pick<LibraryBook, "runStatus">): boolean {
  return book.runStatus === "permanent_failed";
}

export function isSummarizing(book: Pick<LibraryBook, "runStatus">): boolean {
  return book.runStatus === "running";
}

/**
 * "More actions" menu for one book: rename, retry (failed only), delete.
 * `onChanged` refreshes the caller's data; `onDeleted` defaults to it.
 */
export function BookActionsMenu({
  book,
  onChanged,
  onDeleted,
}: {
  book: LibraryBook;
  onChanged(): void;
  onDeleted?(): void;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const t = useMessages(libraryMessages);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog>();
  const [notice, setNotice] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const summarizing = isSummarizing(book);

  useEffect(() => {
    if (!open) {
      return;
    }
    rootRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']:not([disabled])")?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(next: OpenDialog | "retry") {
    setOpen(false);
    if (next === "retry") {
      void retryBook(getAccessTokenSilently, book.id)
        .then(() => {
          setNotice(t.retryRequested);
          onChanged();
        })
        .catch((error: unknown) =>
          setNotice(error instanceof Error ? error.message : t.retryFailed),
        );
      return;
    }
    setDialog(next);
  }

  function closeDialog() {
    setDialog(undefined);
    // Refocus after the modal is removed; removing it resets focus to <body>.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <div
      className="bm-menu"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        className="button button-ghost icon-button button-sm"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.moreActions(book.title)}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal aria-hidden="true" size={16} />
      </button>

      {open && (
        <div className="bm-menu-list" role="menu" aria-label={t.actionsFor(book.title)}>
          <button type="button" role="menuitem" onClick={() => choose("rename")}>
            <Pencil aria-hidden="true" size={14} />
            {t.rename}
          </button>
          {canRetry(book) && (
            <button type="button" role="menuitem" onClick={() => choose("retry")}>
              <RotateCcw aria-hidden="true" size={14} />
              {t.retrySummary}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="bm-danger"
            disabled={summarizing}
            title={summarizing ? t.deleteUnavailable : undefined}
            onClick={() => choose("delete")}
          >
            <Trash2 aria-hidden="true" size={14} />
            {t.delete}
          </button>
        </div>
      )}

      <span className="visually-hidden" role="status" aria-live="polite">
        {notice}
      </span>

      {dialog === "rename" && (
        <RenameDialog
          currentTitle={book.title}
          onRename={async (title) => {
            await renameBook(getAccessTokenSilently, book.id, title);
            onChanged();
          }}
          onClose={closeDialog}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDialog
          title={t.deleteTitle(book.title)}
          body={t.deleteBody}
          confirmLabel={t.deleteConfirm}
          onConfirm={async () => {
            await deleteBook(getAccessTokenSilently, book.id);
            (onDeleted ?? onChanged)();
          }}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
