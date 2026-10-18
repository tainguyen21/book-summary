/** A change to one book's processing status, as announced by the database. */
export interface BookStatusChange {
  ownerId: string;
  bookId: string;
}

/** Fan-out of status changes; subscribe returns an unsubscribe function. */
export interface BookStatusFeed {
  subscribe(listener: (change: BookStatusChange) => void): () => void;
}

export const BOOK_STATUS_FEED = Symbol("BookStatusFeed");
