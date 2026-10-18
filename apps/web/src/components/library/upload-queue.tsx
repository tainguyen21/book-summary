"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { Check, CircleAlert, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { bookwiseApi } from "../../lib/bookwise-api";
import { formatFileSize } from "../../lib/format";
import { useLocale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { uploadMessages, type UploadErrorKey } from "../../lib/i18n/messages/upload";
import { uploadQueueMessages } from "../../lib/i18n/messages/upload-queue";
import { finalizedUploadSchema, uploadTicketSchema } from "../../lib/library-types";
import { Spinner } from "../ui/loading";
import { FileTypeIcon } from "./upload-dialog-parts";
import { contentTypeFor, fileProblem, putFile, titleFromFilename, UploadCanceledError } from "./upload-files";

type ItemState =
  | { kind: "waiting" }
  | { kind: "uploading"; percent: number }
  | { kind: "queuing" }
  | { kind: "queued"; bookId: string }
  | { kind: "failed"; reason: UploadErrorKey }
  | { kind: "rejected"; reason: UploadErrorKey };

interface QueueItem {
  id: number;
  file: File;
  state: ItemState;
}

/**
 * Uploads several books one after another: each file gets its own ticket,
 * storage upload, and summary queue request, with a status per file.
 */
export function UploadQueue({
  files,
  onChooseOthers,
  onClose,
  onComplete,
  onRunningChange,
}: {
  files: File[];
  /** Lets the dialog refuse to close while files are uploading. */
  onRunningChange(running: boolean): void;
  onChooseOthers(): void;
  onClose(): void;
  onComplete(): Promise<void>;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const locale = useLocale();
  const t = useMessages(uploadQueueMessages);
  const upload = useMessages(uploadMessages);
  const [items, setItems] = useState<QueueItem[]>(() =>
    files.map((file, id) => {
      const problem = fileProblem(file);
      return { id, file, state: problem ? { kind: "rejected", reason: problem } : { kind: "waiting" } };
    }),
  );
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const requestRef = useRef<XMLHttpRequest | undefined>(undefined);

  const setState = (id: number, state: ItemState) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, state } : item)));

  async function uploadOne(item: QueueItem): Promise<void> {
    const contentType = contentTypeFor(item.file)!;
    let phase: "creating" | "uploading" | "finalizing" = "creating";
    try {
      setState(item.id, { kind: "uploading", percent: 0 });
      const ticket = await bookwiseApi(
        getAccessTokenSilently,
        "/v1/books/uploads",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: item.file.name,
            contentType,
            sizeBytes: item.file.size,
            title: titleFromFilename(item.file.name),
          }),
        },
        uploadTicketSchema,
      );
      phase = "uploading";
      await putFile(
        ticket.uploadUrl,
        ticket.contentType,
        item.file,
        (loaded, total) => setState(item.id, { kind: "uploading", percent: Math.round((loaded / total) * 100) }),
        (xhr) => {
          requestRef.current = xhr;
        },
      );
      phase = "finalizing";
      setState(item.id, { kind: "queuing" });
      await bookwiseApi(
        getAccessTokenSilently,
        `/v1/books/${ticket.bookId}/uploads/finalize`,
        { method: "POST" },
        finalizedUploadSchema,
      );
      setState(item.id, { kind: "queued", bookId: ticket.bookId });
    } catch (failure) {
      setState(item.id, {
        kind: "failed",
        reason:
          failure instanceof UploadCanceledError
            ? "canceled"
            : phase === "creating"
              ? "startFailed"
              : phase === "uploading"
                ? "uploadIncomplete"
                : "queueFailed",
      });
    } finally {
      requestRef.current = undefined;
    }
  }

  async function run(targets: QueueItem[]) {
    stopRef.current = false;
    setRunning(true);
    onRunningChange(true);
    for (const item of targets) {
      if (stopRef.current) {
        break;
      }
      await uploadOne(item);
    }
    setRunning(false);
    onRunningChange(false);
    await onComplete();
  }

  const uploadable = items.filter((item) => item.state.kind === "waiting");
  const failed = items.filter((item) => item.state.kind === "failed");
  const doneCount = items.filter((item) => item.state.kind === "queued").length;
  const total = items.filter((item) => item.state.kind !== "rejected").length;

  function statusText(state: ItemState): string {
    switch (state.kind) {
      case "waiting":
        return t.waiting;
      case "uploading":
        return t.uploading(state.percent);
      case "queuing":
        return t.queuing;
      case "queued":
        return t.queued;
      case "failed":
        return `${t.failed}: ${upload.errors[state.reason]}`;
      case "rejected":
        return `${t.rejected}: ${upload.errors[state.reason]}`;
    }
  }

  return (
    <div className="up-queue">
      <header className="up-header">
        <div>
          <h2 id="upload-title">{t.title(items.length)}</h2>
          <p>{t.intro}</p>
        </div>
        <button
          className="button button-ghost icon-button button-sm"
          type="button"
          onClick={onClose}
          aria-label={t.done}
          disabled={running}
        >
          <X aria-hidden="true" size={18} />
        </button>
      </header>

      <ol className="up-queue-list" aria-label={t.progress(doneCount, total)}>
        {items.map((item) => (
          <li key={item.id} className={`up-queue-item is-${item.state.kind}`}>
            <FileTypeIcon filename={item.file.name} small />
            <div className="up-queue-text">
              <b title={item.file.name}>{titleFromFilename(item.file.name) || item.file.name}</b>
              <small>
                {formatFileSize(item.file.size, locale)} · {statusText(item.state)}
              </small>
              {item.state.kind === "uploading" && (
                <span className="up-queue-bar" aria-hidden="true">
                  <span style={{ width: `${item.state.percent}%` }} />
                </span>
              )}
            </div>
            <span className="up-queue-icon" aria-hidden="true">
              {item.state.kind === "queued" ? (
                <Check size={16} strokeWidth={2.6} />
              ) : item.state.kind === "failed" || item.state.kind === "rejected" ? (
                <CircleAlert size={16} />
              ) : item.state.kind === "uploading" || item.state.kind === "queuing" ? (
                <Spinner size="sm" />
              ) : null}
            </span>
            {item.state.kind === "waiting" && !running && (
              <button
                className="button button-ghost icon-button button-sm"
                type="button"
                aria-label={t.removeFile(item.file.name)}
                onClick={() => setItems((current) => current.filter((other) => other.id !== item.id))}
              >
                <X aria-hidden="true" size={15} />
              </button>
            )}
          </li>
        ))}
      </ol>

      <p className="up-queue-progress" role="status">
        {running ? t.keepOpen : t.progress(doneCount, total)}
      </p>

      <div className="up-footer">
        <button className="button button-line" type="button" onClick={onChooseOthers} disabled={running}>
          {t.chooseOthers}
        </button>
        <div className="up-actions">
          {running ? (
            <button
              className="button button-line"
              type="button"
              onClick={() => {
                stopRef.current = true;
              }}
            >
              {t.cancel}
            </button>
          ) : failed.length > 0 ? (
            <button className="button button-ink" type="button" onClick={() => void run(failed)}>
              {t.retryFailed(failed.length)}
            </button>
          ) : uploadable.length > 0 ? (
            <button className="button button-ink" type="button" onClick={() => void run(uploadable)}>
              <Upload aria-hidden="true" size={16} />
              {t.start(uploadable.length)}
            </button>
          ) : (
            <button className="button button-ink" type="button" onClick={onClose}>
              {t.done}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
