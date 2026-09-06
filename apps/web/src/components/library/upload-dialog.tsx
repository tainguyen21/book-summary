"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { LoaderCircle, Upload, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { bookwiseApi } from "../../lib/bookwise-api";
import {
  finalizedUploadSchema,
  type UploadTicket,
  uploadTicketSchema,
} from "../../lib/library-types";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const uploadFormats = {
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
} as const;
const accept = [
  ".pdf",
  ".epub",
  ".docx",
  ".txt",
  ...Object.values(uploadFormats),
].join(",");

type UploadStage = "idle" | "creating" | "uploading" | "finalizing";

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
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();

  const busy = stage !== "idle";
  const selectedFileLabel = useMemo(
    () => (file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : "No file selected"),
    [file],
  );

  function requiredContentType(candidate: File): string | undefined {
    const extensionIndex = candidate.name.lastIndexOf(".");
    const extension = candidate.name.slice(extensionIndex).toLowerCase();
    const contentType = uploadFormats[extension as keyof typeof uploadFormats];

    if (!contentType) {
      setError("Choose a PDF, EPUB, DOCX, or TXT file.");
      return undefined;
    }

    if (candidate.type && candidate.type.toLowerCase() !== contentType) {
      setError("The file type does not match its filename extension.");
      return undefined;
    }

    if (candidate.size > MAX_UPLOAD_BYTES) {
      setError("Files must be 100 MiB or smaller.");
      return undefined;
    }

    return contentType;
  }

  function selectFile(candidate: File | undefined): void {
    setFile(candidate);
    setTicket(undefined);
    setStorageUploaded(false);
    setProgress(0);
    setError(undefined);

    if (candidate) {
      requiredContentType(candidate);
    }
  }

  function ticketIsValid(currentTicket: UploadTicket): boolean {
    return new Date(currentTicket.expiresAt).valueOf() > Date.now();
  }

  function uploadFile(
    currentFile: File,
    currentTicket: UploadTicket,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open("PUT", currentTicket.uploadUrl);
      xhr.withCredentials = false;
      xhr.setRequestHeader("content-type", currentTicket.contentType);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }

        reject(new Error("Storage upload failed."));
      };
      xhr.onerror = () => reject(new Error("Storage upload failed."));
      xhr.send(currentFile);
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!file || busy) {
      return;
    }

    const contentType = requiredContentType(file);

    if (!contentType) {
      return;
    }

    let currentTicket = ticket;
    let uploaded = storageUploaded;
    let phase: UploadStage = "creating";
    let completed = false;

    setError(undefined);

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
      await onComplete();
      completed = true;
      onClose();
    } catch {
      const canReuseTicket = Boolean(
        currentTicket && ticketIsValid(currentTicket),
      );

      setTicket(canReuseTicket ? currentTicket : undefined);
      setStorageUploaded(canReuseTicket ? uploaded : false);
      setError(
        !canReuseTicket
          ? "The upload link expired. Start a new upload."
          : phase === "creating"
            ? "Bookwise could not create an upload. Try again."
            : phase === "uploading"
              ? "The file could not upload. Retry before the link expires."
              : "Bookwise could not finalize the upload. Retry to confirm it is queued.",
      );
    } finally {
      if (!completed) {
        setStage("idle");
      }
    }
  }

  function close(): void {
    if (!busy) {
      onClose();
    }
  }

  const submitLabel =
    stage === "creating"
      ? "Creating upload..."
      : stage === "uploading"
        ? "Uploading..."
        : stage === "finalizing"
          ? "Finalizing..."
          : storageUploaded
            ? "Finalize upload"
            : "Upload book";

  return (
    <dialog
      className="upload-dialog"
      open
      aria-labelledby="upload-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-header">
          <div>
            <p className="eyebrow">Private upload</p>
            <h2 id="upload-dialog-title">Add a book</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={close}
            title="Close upload dialog"
            aria-label="Close upload dialog"
            disabled={busy}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <label className="field">
          <span>Book file</span>
          <input
            type="file"
            accept={accept}
            disabled={busy}
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
          <small>{selectedFileLabel}</small>
        </label>

        <label className="field">
          <span>Title</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={500}
            placeholder="Optional"
            disabled={busy}
          />
        </label>

        {stage === "uploading" && (
          <div className="upload-progress" aria-live="polite">
            <div>
              <span>Uploading</span>
              <strong>{progress}%</strong>
            </div>
            <progress value={progress} max={100}>
              {progress}%
            </progress>
          </div>
        )}

        {error && (
          <p className="upload-error" role="alert">
            {error}
          </p>
        )}

        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={!file || busy}>
            {busy ? (
              <LoaderCircle className="spin" aria-hidden="true" size={18} />
            ) : (
              <Upload aria-hidden="true" size={18} />
            )}
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
