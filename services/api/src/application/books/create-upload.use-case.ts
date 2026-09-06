import {
  type BookUploadRepository,
  type CreateUploadInput,
  type ObjectStorage,
  type UploadTicket,
  validateUploadInput,
} from "../../domain/books/book";

export class CreateUploadUseCase {
  constructor(
    private readonly books: BookUploadRepository,
    private readonly storage: ObjectStorage,
    private readonly presignedUrlExpirySeconds: number,
  ) {}

  async execute(input: CreateUploadInput): Promise<UploadTicket> {
    validateUploadInput(input);
    const upload = await this.books.createPendingUpload(input);
    const ticket = await this.storage.createPutUrl({
      objectKey: upload.objectKey,
      contentType: upload.contentType,
      expiresInSeconds: this.presignedUrlExpirySeconds,
    });

    return {
      bookId: upload.bookId,
      objectId: upload.objectId,
      contentType: upload.contentType,
      uploadUrl: ticket.uploadUrl,
      expiresAt: ticket.expiresAt,
    };
  }
}

export const CREATE_UPLOAD_USE_CASE = Symbol("CreateUploadUseCase");
