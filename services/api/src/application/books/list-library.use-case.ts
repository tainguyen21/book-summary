import type { BookReadRepository, LibraryBook } from "../../domain/books/book";

export class ListLibraryUseCase {
  constructor(private readonly books: BookReadRepository) {}

  execute(ownerId: string): Promise<LibraryBook[]> {
    return this.books.listLibrary(ownerId);
  }
}

export const LIST_LIBRARY_USE_CASE = Symbol("ListLibraryUseCase");
