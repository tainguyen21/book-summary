/** A numbered passage the answer may cite as [n]. */
export interface AnswerSource {
  n: number;
  sourceSpanId: string;
  location: Record<string, unknown>;
  quote?: string;
}

export interface CachedAnswer {
  answered: boolean;
  answerText: string;
  sources: AnswerSource[];
}

export interface RetrievedPassage {
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
  passages(
    ownerId: string,
    bookId: string,
    spanIds: string[],
  ): Promise<RetrievedPassage[]>;
  cached(key: AnswerCacheKey): Promise<CachedAnswer | undefined>;
  saveAnswer(key: AnswerCacheKey, answer: CachedAnswer): Promise<void>;
}

export interface AnswerCacheKey {
  ownerId: string;
  bookId: string;
  questionKey: string;
  promptVersion: string;
  sourceDocumentId: string;
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
  | { event: "done"; data: { answered: boolean; cached: boolean } }
  | {
      event: "error";
      data: { code: "budget" | "unavailable"; message: string };
    };

export const ASK_REPOSITORY = Symbol("AskRepository");
export const ANSWER_GENERATOR = Symbol("AnswerGenerator");
