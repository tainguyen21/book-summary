"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { MAX_TITLE_LENGTH } from "../../lib/book-management";
import { useMessages } from "../../lib/i18n/messages";
import { commonMessages } from "../../lib/i18n/messages/common";
import { libraryMessages } from "../../lib/i18n/messages/library";
import { Spinner } from "../ui/loading";

/**
 * A native modal dialog (built-in focus trap and Escape handling) that opens
 * on mount. Closing is always routed through `onClose` so the parent owns state.
 */
function ModalDialog({
  labelledBy,
  onClose,
  busy,
  children,
}: {
  labelledBy: string;
  onClose(): void;
  busy: boolean;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog bm-dialog"
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) {
          onClose();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      {children}
    </dialog>
  );
}

/** Asks before an irreversible action; the cancel button gets initial focus. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm(): Promise<void>;
  onClose(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const common = useMessages(commonMessages);

  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : common.somethingWentWrong);
      setBusy(false);
    }
  }

  return (
    <ModalDialog labelledBy="bm-confirm-title" onClose={onClose} busy={busy}>
      <div className="bm-body">
        <h2 id="bm-confirm-title">{title}</h2>
        <p>{body}</p>
        {error && (
          <p className="bm-error" role="alert">
            {error}
          </p>
        )}
        <div className="bm-actions">
          <button className="button button-line button-sm" type="button" onClick={onClose} disabled={busy} autoFocus>
            {common.cancel}
          </button>
          <button className="button button-danger button-sm" type="button" onClick={confirm} disabled={busy}>
            {busy && <Spinner size="sm" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

/** Edits a book's display title (1–500 characters after trimming). */
export function RenameDialog({
  currentTitle,
  onRename,
  onClose,
}: {
  currentTitle: string;
  onRename(title: string): Promise<void>;
  onClose(): void;
}) {
  const [title, setTitle] = useState(currentTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const trimmed = title.trim();
  const invalid = !trimmed || trimmed.length > MAX_TITLE_LENGTH;
  const t = useMessages(libraryMessages);
  const common = useMessages(commonMessages);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid) {
      setError(t.titleLength(MAX_TITLE_LENGTH));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onRename(trimmed);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : common.somethingWentWrong);
      setBusy(false);
    }
  }

  return (
    <ModalDialog labelledBy="bm-rename-title" onClose={onClose} busy={busy}>
      <form className="bm-body" onSubmit={submit} noValidate>
        <h2 id="bm-rename-title">{t.renameTitle}</h2>
        <label className="bm-field">
          <span>{t.titleLabel}</span>
          <input
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "bm-rename-error" : undefined}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        {error && (
          <p className="bm-error" id="bm-rename-error" role="alert">
            {error}
          </p>
        )}
        <div className="bm-actions">
          <button className="button button-line button-sm" type="button" onClick={onClose} disabled={busy}>
            {common.cancel}
          </button>
          <button className="button button-ink button-sm" type="submit" disabled={busy || trimmed === currentTitle}>
            {busy && <Spinner size="sm" />}
            {common.save}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
