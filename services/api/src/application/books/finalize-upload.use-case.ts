import {
  type BookUploadRepository,
  MAX_UPLOAD_BYTES,
  type ObjectStorage,
  UploadConflictError,
} from "../../domain/books/book";

export interface FinalizedUpload {
  bookId: string;
  bookStatus: "queued";
  commandId: string;
  commandStatus: "queued";
}

export class FinalizeUploadUseCase {
  constructor(
    private readonly books: BookUploadRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async execute(input: {
    ownerId: string;
    bookId: string;
  }): Promise<FinalizedUpload> {
    const upload = await this.books.findOwnedUploadForFinalization(input);

    if (!upload) {
      throw new UploadNotFoundError();
    }

    if (
      upload.bookStatus === "queued" &&
      upload.objectState === "uploaded" &&
      upload.commandId &&
      upload.commandStatus === "queued"
    ) {
      return {
        bookId: input.bookId,
        bookStatus: "queued",
        commandId: upload.commandId,
        commandStatus: upload.commandStatus,
      };
    }

    if (
      upload.bookStatus !== "pending_upload" ||
      upload.objectState !== "pending"
    ) {
      throw new UploadConflictError("The upload is no longer available.");
    }

    const head = await this.storage.head(upload.objectKey);

    if (!head || head.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new UploadConflictError("The uploaded file could not be verified.");
    }

    const command = await this.books.finalizeOwnedUpload({
      ...input,
      head,
    });

    return {
      bookId: input.bookId,
      bookStatus: "queued",
      commandId: command.commandId,
      commandStatus: command.commandStatus,
    };
  }
}

export class UploadNotFoundError extends Error {}

export const FINALIZE_UPLOAD_USE_CASE = Symbol("FinalizeUploadUseCase");
