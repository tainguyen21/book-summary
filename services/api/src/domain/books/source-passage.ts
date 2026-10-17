/** A cited span of a book's source, with nearby spans for context. */
export interface SourcePassageSpan {
  sourceSpanId: string;
  sequenceNumber: number;
  content: string;
  location: Record<string, unknown>;
  /** True for the span the citation points at. */
  cited: boolean;
}

export interface SourcePassage {
  bookId: string;
  sourceSpanId: string;
  spans: SourcePassageSpan[];
}

export interface SourcePassageRepository {
  /** The span and up to `context` spans on each side, in reading order. */
  findPassage(
    ownerId: string,
    bookId: string,
    sourceSpanId: string,
    context: number,
  ): Promise<SourcePassage | undefined>;
}

export const SOURCE_PASSAGE_REPOSITORY = Symbol("SourcePassageRepository");
