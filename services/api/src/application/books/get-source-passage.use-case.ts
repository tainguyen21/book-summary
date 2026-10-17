import type {
  SourcePassage,
  SourcePassageRepository,
} from "../../domain/books/source-passage";

/** Spans shown on each side of a cited passage. */
export const PASSAGE_CONTEXT_SPANS = 2;

export class GetSourcePassageUseCase {
  constructor(private readonly passages: SourcePassageRepository) {}

  execute(
    ownerId: string,
    bookId: string,
    sourceSpanId: string,
  ): Promise<SourcePassage | undefined> {
    return this.passages.findPassage(
      ownerId,
      bookId,
      sourceSpanId,
      PASSAGE_CONTEXT_SPANS,
    );
  }
}

export const GET_SOURCE_PASSAGE_USE_CASE = Symbol("GetSourcePassageUseCase");
