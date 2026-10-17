/** Owner actions that change or remove an existing book. */
export interface RenamedBook {
  id: string;
  title: string;
}

export interface DeletedBook {
  ownerId: string;
  bookId: string;
}

export type DeleteOutcome =
  | { kind: "deleted"; book: DeletedBook }
  | { kind: "not_found" }
  | { kind: "processing" };

export type RetryOutcome =
  | { kind: "requested"; commandCount: number }
  | { kind: "not_found" }
  | { kind: "not_failed" };

export interface BookManagementRepository {
  rename(
    ownerId: string,
    bookId: string,
    title: string,
  ): Promise<RenamedBook | undefined>;
  /** Deletes the book row; every app/data row cascades except the usage ledger. */
  delete(ownerId: string, bookId: string): Promise<DeleteOutcome>;
  requestRetry(ownerId: string, bookId: string): Promise<RetryOutcome>;
  /** Deletes the owner's `pending_upload` books and returns them. */
  deleteIncomplete(ownerId: string): Promise<DeletedBook[]>;
}

export const BOOK_MANAGEMENT_REPOSITORY = Symbol("BookManagementRepository");

/** Storage prefixes that hold a book's original and normalized files. */
export function bookStoragePrefixes(book: DeletedBook): string[] {
  return [
    `books/${book.ownerId}/${book.bookId}/`,
    `normalized/${book.ownerId}/${book.bookId}/`,
  ];
}
