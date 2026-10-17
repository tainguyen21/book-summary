"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { bookwiseApi } from "../../lib/bookwise-api";
import { sourcePassageSchema, type SourcePassage } from "../../lib/library-types";
import { Skeleton } from "../ui/loading";

type PassageState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; passage: SourcePassage };

/**
 * Shows a cited passage of the owner's book, highlighted, with the text just
 * before and after it. Opens on mount; the parent restores focus on close.
 */
export function PassageDialog({
  bookId,
  sourceSpanId,
  label,
  onClose,
}: {
  bookId: string;
  sourceSpanId: string;
  label: string;
  onClose(): void;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const citedRef = useRef<HTMLParagraphElement>(null);
  const [state, setState] = useState<PassageState>({ kind: "loading" });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  useEffect(() => {
    let active = true;
    bookwiseApi(
      getAccessTokenSilently,
      `/v1/books/${bookId}/passages/${sourceSpanId}`,
      { method: "GET" },
      sourcePassageSchema,
    )
      .then((passage) => active && setState({ kind: "ready", passage }))
      .catch(() => active && setState({ kind: "error" }));
    return () => {
      active = false;
    };
  }, [bookId, getAccessTokenSilently, sourceSpanId]);

  useEffect(() => {
    if (state.kind === "ready") {
      citedRef.current?.scrollIntoView({ block: "center" });
    }
  }, [state.kind]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog passage-dialog"
      aria-labelledby="passage-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <header className="passage-header">
        <div>
          <p className="passage-eyebrow">Cited passage</p>
          <h2 id="passage-title">{label}</h2>
        </div>
        <button className="button button-ghost icon-button button-sm" type="button" onClick={onClose} aria-label="Close">
          <X aria-hidden="true" size={18} />
        </button>
      </header>
      <div className="passage-body" aria-live="polite" aria-busy={state.kind === "loading"}>
        {state.kind === "loading" && (
          <div className="passage-skeleton">
            <Skeleton width="94%" height={14} />
            <Skeleton width="88%" height={14} />
            <Skeleton width="91%" height={14} />
          </div>
        )}
        {state.kind === "error" && (
          <p className="passage-error" role="alert">
            We couldn’t load this passage. Close and try again.
          </p>
        )}
        {state.kind === "ready" &&
          state.passage.spans.map((span) => (
            <p
              key={span.sourceSpanId}
              ref={span.cited ? citedRef : undefined}
              className={span.cited ? "passage-cited" : "passage-context"}
            >
              {span.cited && <span className="visually-hidden">Cited text: </span>}
              {span.content}
            </p>
          ))}
      </div>
    </dialog>
  );
}
