"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { ArrowRight, Check, CircleAlert, Lock, Upload, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { bookwiseApi } from "../../lib/bookwise-api";
import { formatFileSize } from "../../lib/format";
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

/** Returns a user-facing reason the file cannot be uploaded, if any. */
function fileProblem(candidate: File): string | undefined {
  const contentType = contentTypeFor(candidate);

  if (!contentType) {
    return "This file type isn’t supported. Choose a PDF, EPUB, DOCX, or TXT file.";
  }

  if (candidate.type && candidate.type.toLowerCase() !== contentType) {
    return "This file’s type doesn’t match its extension. Re-save it and try again.";
  }

  if (candidate.size > MAX_UPLOAD_BYTES) {
    return "This file is larger than 100 MB. Choose a smaller file.";
  }

  return undefined;
}

function titleFromFilename(filename: string): string {
  const index = filename.lastIndexOf(".");

  return (index > 0 ? filename.slice(0, index) : filename).replace(/[-_]+/g, " ").trim();
}

function secondsLeftLabel(seconds: number): string {
  if (seconds < 5) {
    return "Almost done";
  }

  return seconds < 60
    ? `About ${Math.ceil(seconds / 5) * 5} seconds left`
    : `About ${Math.ceil(seconds / 60)} min left`;
}

export function UploadDialog({
  onClose,
  onComplete,
}: {
  onClose(): void;
  onComplete(): Promise<void>;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const [file, setFile] = useState<File>();
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<UploadStage>("idle");
  const [ticket, setTicket] = useState<UploadTicket>();
  const [storageUploaded, setStorageUploaded] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, loaded: 0, eta: "" });
  const [error, setError] = useState<string>();
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
    setProgress({ percent: 0, loaded: 0, eta: "" });
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
          eta: elapsedSeconds > 0.5 ? secondsLeftLabel(remaining) : "",
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
      setProgress({ percent: 0, loaded: 0, eta: "" });
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
          ? "Upload canceled. Your file is still selected — upload again when you’re ready."
          : phase === "creating" && !currentTicket
            ? "Bookwise couldn’t start the upload. Check your connection and try again."
            : !canReuseTicket
              ? "The upload link expired. Upload again to get a fresh one."
              : phase === "uploading"
                ? "The upload didn’t finish, so processing hasn’t started. Retry to continue."
                : "The file uploaded, but the summary wasn’t queued yet. Retry to queue it.",
      );
    }
  }

  function close(): void {
    if (!busy) {
      onClose();
    }
  }

  const submitLabel = storageUploaded
    ? "Retry queuing summary"
    : error && ticket
      ? "Retry upload"
      : "Upload & summarize";

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
              <button className="button button-ghost icon-button button-sm up-close" type="button" onClick={onClose} aria-label="Close">
                <X aria-hidden="true" size={18} />
              </button>
              <span className="up-done-check" aria-hidden="true">
                <Check size={30} strokeWidth={3} />
              </span>
              <h2 id="upload-title">Uploaded — summary on its way</h2>
              <p>
                Bookwise is reading your book now. It usually takes a few
                minutes, and you can leave this page.
              </p>
              <div className="up-done-file">
                <FileTypeIcon filename={file.name} small />
                <div>
                  <b>{title.trim() || file.name}</b>
                  <small>Queued · {formatFileSize(file.size)}</small>
                </div>
              </div>
              <div className="up-actions up-actions-center">
                <button className="button button-line" type="button" onClick={reset}>
                  Upload another
                </button>
                <Link className="button button-ink" href={`/books/${uploadedBookId}`} onClick={onClose}>
                  View progress
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </div>
            </div>
          ) : stage === "uploading" && file ? (
            <>
              <header className="up-header">
                <div>
                  <h2 id="upload-title">Uploading…</h2>
                  <p>Keep this window open until the upload finishes.</p>
                </div>
              </header>
              <div className="up-progress">
                <UploadProgressRing progress={progress.percent} loaded={progress.loaded} total={file.size} />
                <p className="up-progress-file">
                  <FileTypeIcon filename={file.name} small />
                  {file.name}
                </p>
                <p className="up-progress-eta" aria-live="polite">
                  {progress.eta || "Starting…"}
                </p>
              </div>
              <div className="up-footer">
                <small className="up-hint up-hint-info">
                  <Spinner size="sm" />
                  Sending securely
                </small>
                <button className="button button-line" type="button" onClick={() => requestRef.current?.abort()}>
                  Cancel upload
                </button>
              </div>
            </>
          ) : (
            <>
              <header className="up-header">
                <div>
                  <h2 id="upload-title">Upload a book</h2>
                  <p>We’ll read it privately and write a cited summary.</p>
                </div>
                <button
                  className="button button-ghost icon-button button-sm"
                  type="button"
                  onClick={close}
                  aria-label="Close"
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
                      <small>{formatFileSize(file.size)}</small>
                    </div>
                    <button className="button button-ghost button-sm" type="button" onClick={() => selectFile(undefined)} disabled={busy}>
                      Replace
                    </button>
                  </div>
                  {!problem && (
                    <ul className="up-checks" aria-label="File checks">
                      <li>
                        <Check aria-hidden="true" size={14} strokeWidth={2.6} />
                        Supported format
                      </li>
                      <li>
                        <Check aria-hidden="true" size={14} strokeWidth={2.6} />
                        Under 100 MB
                      </li>
                    </ul>
                  )}
                  <div className="up-field">
                    <label htmlFor="upload-book-title">
                      Title <span>· optional</span>
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
                      Suggested from the file name — edit it if you like.
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
                  <strong>{dragging ? "Drop to upload" : "Drag your book here"}</strong>
                  <span className="up-drop-browse">
                    or <u>browse your files</u>
                  </span>
                  <span className="up-drop-formats" aria-hidden="true">
                    <i>PDF</i>
                    <i>EPUB</i>
                    <i>DOCX</i>
                    <i>TXT</i>
                  </span>
                  <span className="up-drop-limit">One book at a time · up to 100 MB</span>
                  <input
                    type="file"
                    accept={accept}
                    aria-label="Choose a book file"
                    onChange={(event) => selectFile(event.target.files?.[0])}
                  />
                </label>
              )}

              {error && (
                <p className={errorIsNotice ? "up-error is-notice" : "up-error"} role="alert">
                  <CircleAlert aria-hidden="true" size={16} />
                  {error}
                </p>
              )}

              <div className="up-footer">
                <small className="up-hint">
                  {busy ? <Spinner size="sm" /> : <Lock aria-hidden="true" size={13} />}
                  {stage === "creating"
                    ? "Preparing a secure upload…"
                    : stage === "finalizing"
                      ? "Queuing your summary…"
                      : "Private to your account"}
                </small>
                <div className="up-actions">
                  <button className="button button-line" type="button" onClick={close} disabled={busy}>
                    Cancel
                  </button>
                  <button className="button button-ink" type="submit" disabled={!file || busy || Boolean(problem)}>
                    {busy ? <Spinner /> : <Upload aria-hidden="true" size={16} />}
                    {busy ? "Working…" : submitLabel}
                  </button>
                </div>
              </div>
            </>
          )}
        </form>

        <UploadTimeline
          stage={stage}
          progress={progress.percent}
          sizeLabel={file && !problem ? formatFileSize(file.size) : undefined}
        />
      </div>
    </dialog>
  );
}
