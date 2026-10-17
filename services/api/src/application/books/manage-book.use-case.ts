import { Logger } from "@nestjs/common";

import type { ObjectStorage } from "../../domain/books/book";
import {
  bookStoragePrefixes,
  type BookManagementRepository,
  type DeleteOutcome,
  type DeletedBook,
  type RenamedBook,
  type RetryOutcome,
} from "../../domain/books/book-management";

export const MAX_TITLE_LENGTH = 500;

export class InvalidTitleError extends Error {
  readonly publicMessage = `Title must be 1-${MAX_TITLE_LENGTH} characters.`;
}

export class ManageBookUseCase {
  private readonly logger = new Logger(ManageBookUseCase.name);

  constructor(
    private readonly books: BookManagementRepository,
    private readonly storage: ObjectStorage,
  ) {}

  rename(
    ownerId: string,
    bookId: string,
    title: string,
  ): Promise<RenamedBook | undefined> {
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > MAX_TITLE_LENGTH) {
      throw new InvalidTitleError();
    }

    return this.books.rename(ownerId, bookId, trimmed);
  }

  async delete(ownerId: string, bookId: string): Promise<DeleteOutcome> {
    const outcome = await this.books.delete(ownerId, bookId);
    if (outcome.kind === "deleted") {
      await this.removeStoredFiles(outcome.book);
    }

    return outcome;
  }

  retry(ownerId: string, bookId: string): Promise<RetryOutcome> {
    return this.books.requestRetry(ownerId, bookId);
  }

  async clearIncomplete(ownerId: string): Promise<{ deleted: number }> {
    const deleted = await this.books.deleteIncomplete(ownerId);
    for (const book of deleted) {
      await this.removeStoredFiles(book);
    }

    return { deleted: deleted.length };
  }

  /**
   * Files go after the rows are committed. A storage failure leaves private,
   * unreferenced objects, which is safer than a book whose file is missing.
   */
  private async removeStoredFiles(book: DeletedBook): Promise<void> {
    for (const prefix of bookStoragePrefixes(book)) {
      try {
        await this.storage.deletePrefix(prefix);
      } catch (error) {
        this.logger.warn(
          `Stored files were not deleted for book ${book.bookId} (${
            error instanceof Error ? error.name : "unknown error"
          }).`,
        );
      }
    }
  }
}

export const MANAGE_BOOK_USE_CASE = Symbol("ManageBookUseCase");
