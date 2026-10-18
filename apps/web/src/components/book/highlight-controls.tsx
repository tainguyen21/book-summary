"use client";

import { Highlighter, NotebookPen } from "lucide-react";
import { useId, useState } from "react";

import type { Highlight } from "../../lib/highlights-api";
import { useMessages } from "../../lib/i18n/messages";
import { highlightMessages } from "../../lib/i18n/messages/highlights";

const NOTE_LIMIT = 2000;

/** Quote-card footer: highlight the sentence and keep a note on it. */
export function HighlightControls({
  highlight,
  onToggle,
  onSaveNote,
}: {
  highlight?: Highlight;
  onToggle(): Promise<void>;
  onSaveNote(note: string): Promise<void>;
}) {
  const t = useMessages(highlightMessages);
  const noteId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "saved" | "error">("idle");

  async function run(work: () => Promise<void>, after?: () => void) {
    setStatus("busy");
    try {
      await work();
      after?.();
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="highlight-controls">
      <div className="highlight-actions">
        <button
          type="button"
          className="button button-line button-sm"
          aria-pressed={Boolean(highlight)}
          aria-label={highlight ? t.removeHighlightLabel : t.highlightLabel}
          disabled={status === "busy"}
          onClick={() => void run(onToggle, () => setEditing(false))}
        >
          <Highlighter aria-hidden="true" size={14} />
          {highlight ? t.highlighted : t.highlight}
        </button>
        {highlight && !editing && (
          <button
            type="button"
            className="button button-ghost button-sm"
            onClick={() => {
              setDraft(highlight.note ?? "");
              setEditing(true);
              setStatus("idle");
            }}
          >
            <NotebookPen aria-hidden="true" size={14} />
            {highlight.note ? t.editNote : t.addNote}
          </button>
        )}
        <span className="highlight-status" role="status">
          {status === "saved" ? t.saved : status === "error" ? t.saveError : ""}
        </span>
      </div>

      {highlight?.note && !editing && <p className="highlight-note">{highlight.note}</p>}

      {highlight && editing && (
        <form
          className="highlight-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => onSaveNote(draft), () => setEditing(false));
          }}
        >
          <label htmlFor={noteId}>{t.noteLabel}</label>
          <textarea
            id={noteId}
            rows={3}
            value={draft}
            maxLength={NOTE_LIMIT}
            placeholder={t.notePlaceholder}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
          />
          <div className="highlight-actions">
            <button type="submit" className="button button-ink button-sm" disabled={status === "busy"}>
              {t.saveNote}
            </button>
            <button type="button" className="button button-ghost button-sm" onClick={() => setEditing(false)}>
              {t.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
