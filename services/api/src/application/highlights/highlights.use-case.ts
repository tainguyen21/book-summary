import type { BookReadRepository } from "../../domain/books/book";
import type {
  Highlight,
  HighlightRepository,
} from "../../domain/highlights/highlights";

const NOTE_LIMIT = 2000;

export class HighlightNoteError extends Error {
  readonly publicMessage = `Keep notes under ${NOTE_LIMIT} characters.`;
}

/**
 * Highlights on the book's current summary sentences. The sentence text is
 * taken from the stored summary, never from the request, and only the owner's
 * published summary can be highlighted.
 */
export class HighlightsUseCase {
  constructor(
    private readonly highlights: HighlightRepository,
    private readonly books: BookReadRepository,
  ) {}

  list(ownerId: string, bookId: string): Promise<Highlight[]> {
    return this.highlights.list(ownerId, bookId);
  }

  /** Returns undefined when the book, summary version, or sentence does not exist. */
  async save(
    ownerId: string,
    bookId: string,
    input: {
      summaryId: string;
      paragraph: number;
      sentence: number;
      note?: string;
    },
  ): Promise<Highlight | undefined> {
    const note = input.note?.trim() || undefined;
    if (note && note.length > NOTE_LIMIT) {
      throw new HighlightNoteError();
    }
    const published = await this.books.getPublishedSummary(ownerId, bookId);
    if (!published || published.summary.id !== input.summaryId) {
      return undefined;
    }
    const sentence =
      published.summary.paragraphs[input.paragraph]?.[input.sentence];
    if (!sentence) {
      return undefined;
    }
    return this.highlights.upsert(ownerId, {
      bookId,
      summaryId: input.summaryId,
      paragraph: input.paragraph,
      sentence: input.sentence,
      text: sentence.text,
      ...(note ? { note } : {}),
    });
  }

  remove(ownerId: string, highlightId: string): Promise<boolean> {
    return this.highlights.remove(ownerId, highlightId);
  }
}

export const HIGHLIGHTS_USE_CASE = Symbol("HighlightsUseCase");
