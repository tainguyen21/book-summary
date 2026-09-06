export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const uploadFormats = {
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
} as const;

export type UploadFormat = keyof typeof uploadFormats;

export interface CreateUploadInput {
  ownerId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  title?: string;
}

export interface PendingBookUpload {
  bookId: string;
  objectId: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
}

export interface StoredObjectHead {
  contentType: string;
  sizeBytes: number;
  etag?: string;
}

export interface ObjectStorage {
  createPutUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ uploadUrl: string; expiresAt: string }>;
  head(objectKey: string): Promise<StoredObjectHead | undefined>;
}

export interface UploadTicket {
  bookId: string;
  objectId: string;
  contentType: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface FinalizableBookUpload extends PendingBookUpload {
  bookStatus: string;
  objectState: string;
  commandId?: string;
  commandStatus?: string;
}

export interface QueuedProcessingCommand {
  commandId: string;
  commandStatus: "queued";
}

export interface BookUploadRepository {
  createPendingUpload(input: CreateUploadInput): Promise<PendingBookUpload>;
  findOwnedUploadForFinalization(input: {
    ownerId: string;
    bookId: string;
  }): Promise<FinalizableBookUpload | undefined>;
  finalizeOwnedUpload(input: {
    ownerId: string;
    bookId: string;
    head: StoredObjectHead;
  }): Promise<QueuedProcessingCommand>;
}

export interface LibraryBook {
  id: string;
  title: string;
  filename: string;
  bookStatus: string;
  uploadState: string;
  createdAt: string;
  commandStatus?: string;
}

export interface BookProcessingStatus {
  bookId: string;
  bookStatus: string;
  commandStatus?: string;
  runStatus?: string;
  latestEventType?: string;
  latestEventAt?: string;
}

export interface BookReadRepository {
  listLibrary(ownerId: string): Promise<LibraryBook[]>;
  getProcessingStatus(
    ownerId: string,
    bookId: string,
  ): Promise<BookProcessingStatus | undefined>;
}

export const OBJECT_STORAGE = Symbol("ObjectStorage");
export const BOOK_REPOSITORY = Symbol("BookRepository");
export const BOOK_READ_REPOSITORY = Symbol("BookReadRepository");
export const PROCESSING_COMMAND_REPOSITORY = Symbol(
  "ProcessingCommandRepository",
);

export class InvalidUploadInputError extends Error {
  readonly publicMessage: string;
  readonly statusCode = 422;

  constructor(publicMessage: string) {
    super(publicMessage);
    this.publicMessage = publicMessage;
  }
}

export class UploadConflictError extends Error {
  readonly publicMessage: string;
  readonly statusCode = 409;

  constructor(publicMessage: string) {
    super(publicMessage);
    this.publicMessage = publicMessage;
  }
}

export function validateUploadInput(input: CreateUploadInput): UploadFormat {
  const filename = input.filename.trim();

  if (filename.length === 0) {
    throw new InvalidUploadInputError(
      "Upload filename must include a basename.",
    );
  }

  if (/[\\/]/.test(filename)) {
    throw new InvalidUploadInputError(
      "Upload filename must not include directory separators.",
    );
  }

  const extensionIndex = filename.lastIndexOf(".");

  if (extensionIndex === 0) {
    throw new InvalidUploadInputError(
      "Upload filename must include a basename.",
    );
  }

  const extension = filename
    .slice(extensionIndex)
    .toLowerCase() as UploadFormat;
  const expectedContentType = uploadFormats[extension];

  if (!expectedContentType) {
    throw new InvalidUploadInputError(
      "Upload format must be PDF, EPUB, DOCX, or TXT.",
    );
  }

  if (input.contentType.trim().toLowerCase() !== expectedContentType) {
    throw new InvalidUploadInputError(
      "Upload content type must match the filename extension.",
    );
  }

  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new InvalidUploadInputError(
      "Upload size must be a positive integer.",
    );
  }

  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new InvalidUploadInputError(
      `Upload size must not exceed ${MAX_UPLOAD_BYTES} bytes.`,
    );
  }

  return extension;
}
