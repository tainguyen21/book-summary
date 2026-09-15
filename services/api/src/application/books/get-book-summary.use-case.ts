import type {
  BookReadRepository,
  BookSummary,
} from "../../domain/books/book";

export class GetBookSummaryUseCase {
  constructor(private readonly books: BookReadRepository) {}

  execute(ownerId: string, bookId: string): Promise<BookSummary | undefined> {
    return this.books.getPublishedSummary(ownerId, bookId);
  }
}

export const GET_BOOK_SUMMARY_USE_CASE = Symbol("GetBookSummaryUseCase");
