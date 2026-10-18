"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { ArrowRight, Check, CircleAlert, Lock, Upload, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { bookwiseApi } from "../../lib/bookwise-api";
import { formatFileSize } from "../../lib/format";
import { useLocale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { commonMessages } from "../../lib/i18n/messages/common";
import { uploadMessages, type UploadErrorKey } from "../../lib/i18n/messages/upload";
import {
  finalizedUploadSchema,
  type UploadTicket,
  uploadTicketSchema,
} from "../../lib/library-types";
import { Spinner } from "../ui/loading";
import {
  FileTypeIcon,
  UploadProgressRing,
  UploadTimeline,
  type UploadStage,
} from "./upload-dialog-parts";
import "./upload-dialog.css";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const uploadFormats = {
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
} as const;
const accept = [...Object.keys(uploadFormats), ...Object.values(uploadFormats)].join(",");

class StorageUploadError extends Error {
  constructor(readonly status: number) {
    super("Storage upload failed.");
    this.name = "StorageUploadError";
  }
}

class UploadCanceledError extends Error {
  constructor() {
    super("Upload canceled.");
    this.name = "UploadCanceledError";
  }
}

function contentTypeFor(candidate: File): string | undefined {
  const extension = candidate.name.slice(candidate.name.lastIndexOf(".")).toLowerCase();

  return uploadFormats[extension as keyof typeof uploadFormats];
}

/** Returns the reason (a message key) the file cannot be uploaded, if any. */
function fileProblem(candidate: File): UploadErrorKey | undefined {
  const contentType = contentTypeFor(candidate);

  if (!contentType) {
    return "unsupported";
  }

  if (candidate.type && candidate.type.toLowerCase() !== contentType) {
    return "typeMismatch";
  }

  if (candidate.size > MAX_UPLOAD_BYTES) {
    return "tooLarge";
  }

  return undefined;
}

function titleFromFilename(filename: string): string {
  const index = filename.lastIndexOf(".");

  return (index > 0 ? filename.slice(0, index) : filename).replace(/[-_]+/g, " ").trim();
}

function secondsLeftLabel(t: (typeof uploadMessages)["en"], seconds: number): string {
  if (seconds < 5) {
    return t.almostDone;
  }

  return seconds < 60
    ? t.secondsLeft(Math.ceil(seconds / 5) * 5)
    : t.minutesLeft(Math.ceil(seconds / 60));
}

/** Upload progress; `secondsLeft` stays unset until the rate estimate settles. */
interface UploadProgress {
  percent: number;
  loaded: number;
  secondsLeft?: number;
}

const noProgress: UploadProgress = { percent: 0, loaded: 0 };

export function UploadDialog({
  onClose,
  onComplete,
}: {
  onClose(): void;
  onComplete(): Promise<void>;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const locale = useLocale();
  const t = useMessages(uploadMessages);
  const common = useMessages(commonMessages);
  const [file, setFile] = useState<File>();
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<UploadStage>("idle");
  const [ticket, setTicket] = useState<UploadTicket>();
  const [storageUploaded, setStorageUploaded] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>(noProgress);
  const [error, setError] = useState<UploadErrorKey>();
  /** A cancel the user chose is a neutral notice, not an error. */
  const [errorIsNotice, setErrorIsNotice] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadedBookId, setUploadedBookId] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<XMLHttpRequest | undefined>(undefined);

  const busy = stage === "creating" || stage === "uploading" || stage === "finalizing";
  const problem = file ? fileProblem(file) : undefined;

  // Open as a true modal so the backdrop, focus trap, and Escape key work.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }

    return () => {
      requestRef.current?.abort();
      dialog?.close();
    };
  }, []);

  function selectFile(candidate: File | undefined): void {
    setFile(candidate);
    setTicket(undefined);
    setStorageUploaded(false);
    setProgress(noProgress);
    setError(candidate ? fileProblem(candidate) : undefined);
    setErrorIsNotice(false);
    setTitle(candidate ? titleFromFilename(candidate.name) : "");
  }

  function reset(): void {
    selectFile(undefined);
    setUploadedBookId(undefined);
    setStage("idle");
  }

  function uploadFile(currentFile: File, currentTicket: UploadTicket): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const startedAt = performance.now();

      requestRef.current = xhr;
      xhr.open("PUT", currentTicket.uploadUrl);
      xhr.withCredentials = false;
      xhr.setRequestHeader("content-type", currentTicket.contentType);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const elapsedSeconds = (performance.now() - startedAt) / 1000;
        const rate = event.loaded / Math.max(elapsedSeconds, 0.001);
        const remaining = (event.total - event.loaded) / Math.max(rate, 1);

        setProgress({
          percent: Math.round((event.loaded / event.total) * 100),
          loaded: event.loaded,
          secondsLeft: elapsedSeconds > 0.5 ? remaining : undefined,
        });
      };
      xhr.onload = () => {
        requestRef.current = undefined;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }

        reject(new StorageUploadError(xhr.status));
      };
      xhr.onerror = () => {
        requestRef.current = undefined;
        reject(new StorageUploadError(xhr.status));
      };
      xhr.onabort = () => {
        requestRef.current = undefined;
        reject(new UploadCanceledError());
      };
      xhr.send(currentFile);
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!file || busy) {
      return;
    }

    const contentType = contentTypeFor(file);

    if (problem || !contentType) {
      setError(problem);
      return;
    }

    let currentTicket = ticket;
    let uploaded = storageUploaded;
    let phase: UploadStage = "creating";
    const ticketIsValid = (candidate: UploadTicket) =>
      new Date(candidate.expiresAt).valueOf() > Date.now();

    setError(undefined);
    setErrorIsNotice(false);

    try {
      if (!currentTicket) {
        setStage("creating");
        currentTicket = await bookwiseApi(
          getAccessTokenSilently,
          "/v1/books/uploads",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType,
              sizeBytes: file.size,
              ...(title.trim() ? { title: title.trim() } : {}),
            }),
          },
          uploadTicketSchema,
        );
        setTicket(currentTicket);
      }

      if (!ticketIsValid(currentTicket)) {
        setTicket(undefined);
        setStorageUploaded(false);
        throw new Error("Upload link expired.");
      }

      if (!uploaded) {
        phase = "uploading";
        setStage("uploading");
        await uploadFile(file, currentTicket);
        uploaded = true;
        setStorageUploaded(true);
      }

      phase = "finalizing";
      setStage("finalizing");
      await bookwiseApi(
        getAccessTokenSilently,
        `/v1/books/${currentTicket.bookId}/uploads/finalize`,
        { method: "POST" },
        finalizedUploadSchema,
      );
      setUploadedBookId(currentTicket.bookId);
      setStage("done");
      await onComplete();
    } catch (failure) {
      const canReuseTicket = Boolean(currentTicket && ticketIsValid(currentTicket));
      const canceled = failure instanceof UploadCanceledError;

      setStage("idle");
      setTicket(canReuseTicket ? currentTicket : undefined);
      setStorageUploaded(canReuseTicket ? uploaded : false);
      setProgress(noProgress);
      setErrorIsNotice(canceled);

      if (!canceled) {
        console.warn("Bookwise upload failed", {
          stage: phase,
          bookId: currentTicket?.bookId,
          storageHttpStatus:
            failure instanceof StorageUploadError ? failure.status : undefined,
          reason:
            failure instanceof StorageUploadError
              ? failure.status === 0
                ? "storage_network_or_cors"
                : "storage_http_error"
              : currentTicket && !canReuseTicket
                ? "upload_link_expired"
                : `${phase}_failed`,
          storageUploaded: uploaded,
          canReuseTicket,
        });
      }

      setError(
        canceled
          ? "canceled"
          : phase === "creating" && !currentTicket
            ? "startFailed"
            : !canReuseTicket
              ? "linkExpired"
              : phase === "uploading"
                ? "uploadIncomplete"
                : "queueFailed",
      );
    }
  }

  function close(): void {
    if (!busy) {
      onClose();
    }
  }

  const submitLabel = storageUploaded
    ? t.retryQueue
    : error && ticket
      ? t.retryUpload
      : t.uploadAndSummarize;

  return (
    <dialog
      ref={dialogRef}
      className="dialog up-dialog"
      aria-labelledby="upload-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div className="up-layout">
        <form className="up-main" onSubmit={submit} noValidate>
          {stage === "done" && uploadedBookId && file ? (
            <div className="up-done">
              <button className="button button-ghost icon-button button-sm up-close" type="button" onClick={onClose} aria-label={common.close}>
                <X aria-hidden="true" size={18} />
              </button>
              <span className="up-done-check" aria-hidden="true">
                <Check size={30} strokeWidth={3} />
              </span>
              <h2 id="upload-title">{t.doneTitle}</h2>
              <p>{t.doneBody}</p>
              <div className="up-done-file">
                <FileTypeIcon filename={file.name} small />
                <div>
                  <b>{title.trim() || file.name}</b>
                  <small>{t.queuedSize(formatFileSize(file.size, locale))}</small>
                </div>
              </div>
              <div className="up-actions up-actions-center">
                <button className="button button-line" type="button" onClick={reset}>
                  {t.uploadAnother}
                </button>
                <Link className="button button-ink" href={`/books/${uploadedBookId}`} onClick={onClose}>
                  {t.viewProgress}
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </div>
            </div>
          ) : stage === "uploading" && file ? (
            <>
              <header className="up-header">
                <div>
                  <h2 id="upload-title">{t.uploadingTitle}</h2>
                  <p>{t.keepOpen}</p>
                </div>
              </header>
              <div className="up-progress">
                <UploadProgressRing progress={progress.percent} loaded={progress.loaded} total={file.size} />
                <p className="up-progress-file">
                  <FileTypeIcon filename={file.name} small />
                  {file.name}
                </p>
                <p className="up-progress-eta" aria-live="polite">
                  {progress.secondsLeft === undefined
                    ? t.starting
                    : secondsLeftLabel(t, progress.secondsLeft)}
                </p>
              </div>
              <div className="up-footer">
                <small className="up-hint up-hint-info">
                  <Spinner size="sm" />
                  {t.sendingSecurely}
                </small>
                <button className="button button-line" type="button" onClick={() => requestRef.current?.abort()}>
                  {t.cancelUpload}
                </button>
              </div>
            </>
          ) : (
            <>
              <header className="up-header">
                <div>
                  <h2 id="upload-title">{t.title}</h2>
                  <p>{t.intro}</p>
                </div>
                <button
                  className="button button-ghost icon-button button-sm"
                  type="button"
                  onClick={close}
                  aria-label={common.close}
                  disabled={busy}
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </header>

              {file ? (
                <>
                  <div className="up-file">
                    <FileTypeIcon filename={file.name} />
                    <div>
                      <b title={file.name}>{file.name}</b>
                      <small>{formatFileSize(file.size, locale)}</small>
                    </div>
                    <button className="button button-ghost button-sm" type="button" onClick={() => selectFile(undefined)} disabled={busy}>
                      {t.replace}
                    </button>
                  </div>
                  {!problem && (
                    <ul className="up-checks" aria-label={t.fileChecks}>
                      <li>
                        <Check aria-hidden="true" size={14} strokeWidth={2.6} />
                        {t.supportedFormat}
                      </li>
                      <li>
                        <Check aria-hidden="true" size={14} strokeWidth={2.6} />
                        {t.underLimit}
                      </li>
                    </ul>
                  )}
                  <div className="up-field">
                    <label htmlFor="upload-book-title">
                      {t.titleLabel} <span>{t.optional}</span>
                    </label>
                    <input
                      id="upload-book-title"
                      type="text"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={500}
                      disabled={busy || Boolean(problem)}
                      aria-describedby="upload-book-title-hint"
                    />
                    <small id="upload-book-title-hint">
                      {t.titleHint}
                    </small>
                  </div>
                </>
              ) : (
                <label
                  className={dragging ? "up-drop is-dragging" : "up-drop"}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    selectFile(event.dataTransfer.files[0]);
                  }}
                >
                  <span className="up-drop-art" aria-hidden="true">
                    <span className="book-cover cover-2" />
                    <span className="book-cover cover-1" />
                    <span className="book-cover cover-3" />
                    <span className="up-drop-arrow">
                      <Upload size={16} strokeWidth={2.4} />
                    </span>
                  </span>
                  <strong>{dragging ? t.dropToUpload : t.dragHere}</strong>
                  <span className="up-drop-browse">
                    {t.or} <u>{t.browse}</u>
                  </span>
                  <span className="up-drop-formats" aria-hidden="true">
                    <i>PDF</i>
                    <i>EPUB</i>
                    <i>DOCX</i>
                    <i>TXT</i>
                  </span>
                  <span className="up-drop-limit">{t.limit}</span>
                  <input
                    type="file"
                    accept={accept}
                    aria-label={t.chooseFile}
                    onChange={(event) => selectFile(event.target.files?.[0])}
                  />
                </label>
              )}

              {error && (
                <p className={errorIsNotice ? "up-error is-notice" : "up-error"} role="alert">
                  <CircleAlert aria-hidden="true" size={16} />
                  {t.errors[error]}
                </p>
              )}

              <div className="up-footer">
                <small className="up-hint">
                  {busy ? <Spinner size="sm" /> : <Lock aria-hidden="true" size={13} />}
                  {stage === "creating"
                    ? t.preparing
                    : stage === "finalizing"
                      ? t.queuing
                      : t.privateHint}
                </small>
                <div className="up-actions">
                  <button className="button button-line" type="button" onClick={close} disabled={busy}>
                    {common.cancel}
                  </button>
                  <button className="button button-ink" type="submit" disabled={!file || busy || Boolean(problem)}>
                    {busy ? <Spinner /> : <Upload aria-hidden="true" size={16} />}
                    {busy ? t.working : submitLabel}
                  </button>
                </div>
              </div>
            </>
          )}
        </form>

        <UploadTimeline
          stage={stage}
          progress={progress.percent}
          sizeLabel={file && !problem ? formatFileSize(file.size, locale) : undefined}
        />
      </div>
    </dialog>
  );
}
