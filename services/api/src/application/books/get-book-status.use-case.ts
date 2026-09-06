import type {
  BookProcessingStatus,
  BookReadRepository,
} from "../../domain/books/book";

export class GetBookStatusUseCase {
  constructor(private readonly books: BookReadRepository) {}

  execute(
    ownerId: string,
    bookId: string,
  ): Promise<BookProcessingStatus | undefined> {
    return this.books.getProcessingStatus(ownerId, bookId);
  }
}

export const GET_BOOK_STATUS_USE_CASE = Symbol("GetBookStatusUseCase");
