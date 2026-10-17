/** One search hit, always anchored to a source span of the owner's book. */
export interface SearchResult {
  bookId: string;
  bookTitle: string;
  sourceSpanId: string;
  location: Record<string, unknown>;
  /** "evidence" is an extracted fact; "passage" is raw book text. */
  kind: "evidence" | "passage";
  text: string;
  /** Verified verbatim quote for evidence hits, when recorded. */
  quote?: string;
  score: number;
}

export interface SearchResponse {
  /** "keyword" when meaning search was skipped; `keywordReason` says why. */
  mode: "hybrid" | "keyword";
  keywordReason?: "budget" | "unavailable";
  results: SearchResult[];
}

export type RankedHit = Omit<SearchResult, "score">;

/**
 * English words too common to help ranking. Single characters are dropped too,
 * but two-letter words stay because many Vietnamese syllables are two letters.
 */
const STOP_WORDS = new Set([
  "an",
  "as",
  "at",
  "be",
  "by",
  "do",
  "if",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "so",
  "to",
  "up",
  "we",
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "was",
  "were",
  "are",
  "but",
  "not",
  "you",
  "your",
  "its",
  "his",
  "her",
  "their",
  "they",
  "them",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "how",
  "did",
  "does",
  "has",
  "have",
  "had",
  "into",
  "about",
  "than",
  "then",
  "there",
  "been",
  "also",
]);

/**
 * A safe Postgres tsquery (letters and digits only) matching ANY meaningful
 * query word, so natural questions still find text; ranking puts the
 * documents with more matching words first. Falls back to all words when
 * nothing meaningful remains (for example "of the").
 */
export function keywordTsQuery(query: string): string | undefined {
  const words = query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const meaningful = [
    ...new Set(
      words.filter((word) => word.length >= 2 && !STOP_WORDS.has(word)),
    ),
  ];
  const terms = meaningful.length > 0 ? meaningful : [...new Set(words)];
  if (terms.length === 0) {
    return undefined;
  }
  return terms.join(meaningful.length > 0 ? " | " : " & ");
}

export interface SearchRepository {
  keywordEvidence(
    ownerId: string,
    query: string,
    limit: number,
  ): Promise<RankedHit[]>;
  keywordPassages(
    ownerId: string,
    query: string,
    limit: number,
  ): Promise<RankedHit[]>;
  similarEvidence(
    ownerId: string,
    embedding: number[],
    limit: number,
  ): Promise<RankedHit[]>;
}

export interface QueryEmbedder {
  readonly provider: string;
  readonly model: string;
  embed(text: string): Promise<{ values: number[]; inputTokens: number }>;
}

export interface AppUsageRecorder {
  record(input: {
    ownerId: string;
    bookId?: string;
    operation: "query_embedding" | "answer";
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void>;
}

export const SEARCH_REPOSITORY = Symbol("SearchRepository");
export const QUERY_EMBEDDER = Symbol("QueryEmbedder");
export const APP_USAGE_RECORDER = Symbol("AppUsageRecorder");
