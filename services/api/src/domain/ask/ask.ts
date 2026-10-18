/** A numbered passage the answer may cite as [n]. */
export interface AnswerSource {
  n: number;
  /** Absent only in answers cached before library answers existed. */
  bookId?: string;
  bookTitle?: string;
  sourceSpanId: string;
  location: Record<string, unknown>;
  quote?: string;
}

export interface CachedAnswer {
  answered: boolean;
  answerText: string;
  sources: AnswerSource[];
  /** The supporting sentence for each rendered marker, in text order. */
  markerQuotes: (string | null)[];
}

export interface RetrievedPassage {
  bookId: string;
  bookTitle: string;
  sourceSpanId: string;
  content: string;
  location: Record<string, unknown>;
  quote?: string;
}

export interface AskRepository {
  /** The book's current summarized source document, or undefined (not owned / not ready). */
  currentSourceDocument(
    ownerId: string,
    bookId: string,
  ): Promise<string | undefined>;
  /** Changes whenever any book's current source document changes; undefined with no ready books. */
  libraryVersion(ownerId: string): Promise<string | undefined>;
  /**
   * For each anchor span, the ids of the next `count` spans of the same
   * document, in reading order (a point often continues in the next paragraph).
   */
  followingSpanIds(
    ownerId: string,
    anchorSpanIds: string[],
    count: number,
  ): Promise<Map<string, string[]>>;
  /** Passages in `spanIds` order, limited to one book when `bookId` is given. */
  passages(
    ownerId: string,
    spanIds: string[],
    bookId?: string,
  ): Promise<RetrievedPassage[]>;
  cached(key: AnswerCacheKey): Promise<CachedAnswer | undefined>;
  saveAnswer(key: AnswerCacheKey, answer: CachedAnswer): Promise<void>;
}

/** What a question is asked of: one book, or every ready book of the owner. */
export type AskScope =
  | { kind: "book"; bookId: string; sourceDocumentId: string }
  | { kind: "library"; libraryVersion: string };

export interface AnswerCacheKey {
  ownerId: string;
  scope: AskScope;
  questionKey: string;
  promptVersion: string;
}

export interface AnswerGenerator {
  readonly provider: string;
  readonly model: string;
  /** Streams text chunks to `onText`; resolves with token usage. */
  stream(
    system: string,
    prompt: string,
    onText: (text: string) => void,
  ): Promise<{ inputTokens: number; outputTokens: number }>;
}

export type AskEvent =
  | { event: "sources"; data: { sources: AnswerSource[] } }
  | { event: "delta"; data: { text: string } }
  | {
      event: "done";
      data: {
        answered: boolean;
        cached: boolean;
        markerQuotes: (string | null)[];
      };
    }
  | {
      event: "error";
      data: { code: "budget" | "unavailable"; message: string };
    };

export const ASK_REPOSITORY = Symbol("AskRepository");
export const ANSWER_GENERATOR = Symbol("AnswerGenerator");
