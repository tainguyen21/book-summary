import type { UploadErrorKey } from "../../lib/i18n/messages/upload";

/** File checks and the storage PUT shared by the single upload and the upload queue. */

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const uploadFormats = {
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
} as const;
export const accept = [...Object.keys(uploadFormats), ...Object.values(uploadFormats)].join(",");

export class StorageUploadError extends Error {
  constructor(readonly status: number) {
    super("Storage upload failed.");
    this.name = "StorageUploadError";
  }
}

export class UploadCanceledError extends Error {
  constructor() {
    super("Upload canceled.");
    this.name = "UploadCanceledError";
  }
}

export function contentTypeFor(candidate: File): string | undefined {
  const extension = candidate.name.slice(candidate.name.lastIndexOf(".")).toLowerCase();

  return uploadFormats[extension as keyof typeof uploadFormats];
}

/** Returns the reason (a message key) the file cannot be uploaded, if any. */
export function fileProblem(candidate: File): UploadErrorKey | undefined {
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

export function titleFromFilename(filename: string): string {
  const index = filename.lastIndexOf(".");

  return (index > 0 ? filename.slice(0, index) : filename).replace(/[-_]+/g, " ").trim();
}

/**
 * PUTs a file to its signed storage URL, reporting progress. `register`
 * receives the request so the caller can abort it (cancel).
 */
export function putFile(
  url: string,
  contentType: string,
  file: File,
  onProgress: (loaded: number, total: number, elapsedSeconds: number) => void,
  register: (xhr: XMLHttpRequest) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = performance.now();

    register(xhr);
    xhr.open("PUT", url);
    xhr.withCredentials = false;
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total, (performance.now() - startedAt) / 1000);
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new StorageUploadError(xhr.status));
    xhr.onerror = () => reject(new StorageUploadError(xhr.status));
    xhr.onabort = () => reject(new UploadCanceledError());
    xhr.send(file);
  });
}
