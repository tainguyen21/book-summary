export interface Highlight {
  id: string;
  bookId: string;
  summaryId: string;
  paragraph: number;
  sentence: number;
  text: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HighlightRepository {
  list(ownerId: string, bookId: string): Promise<Highlight[]>;
  /** Creates the highlight or updates its note; one per sentence of a summary. */
  upsert(
    ownerId: string,
    highlight: Omit<Highlight, "id" | "createdAt" | "updatedAt">,
  ): Promise<Highlight>;
  remove(ownerId: string, highlightId: string): Promise<boolean>;
}

export const HIGHLIGHT_REPOSITORY = Symbol("HighlightRepository");
