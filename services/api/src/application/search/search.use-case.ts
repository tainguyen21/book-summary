import { Logger } from "@nestjs/common";

import {
  keywordTsQuery,
  type AppUsageRecorder,
  type QueryEmbedder,
  type RankedHit,
  type SearchRepository,
  type SearchResponse,
  type SearchResult,
} from "../../domain/search/search";
import type { UsageReadRepository } from "../../domain/usage/daily-usage";
import type { DailyBudgetSettings } from "../usage/get-daily-usage.use-case";

const CANDIDATES_PER_LIST = 30;
const RESULT_LIMIT = 20;
// Reciprocal rank fusion constant; 60 is the common default.
const RRF_K = 60;

export class SearchQueryError extends Error {
  readonly publicMessage = "Enter between 2 and 200 characters.";
}

/**
 * Hybrid search over the owner's books: keyword matches on evidence and
 * passages plus meaning matches on evidence embeddings, fused by rank.
 * Meaning search is skipped (keyword mode) when no embedder is configured or
 * the shared daily budget is spent.
 */
export class SearchUseCase {
  private readonly logger = new Logger(SearchUseCase.name);

  constructor(
    private readonly search: SearchRepository,
    private readonly embedder: QueryEmbedder | undefined,
    private readonly usage: AppUsageRecorder,
    private readonly spend: UsageReadRepository,
    private readonly budget: DailyBudgetSettings,
  ) {}

  async execute(ownerId: string, rawQuery: string): Promise<SearchResponse> {
    const query = rawQuery.trim();
    if (query.length < 2 || query.length > 200) {
      throw new SearchQueryError();
    }

    const tsQuery = keywordTsQuery(query);
    const [keywordEvidence, keywordPassages, meaning] = await Promise.all([
      tsQuery
        ? this.search.keywordEvidence(ownerId, tsQuery, CANDIDATES_PER_LIST)
        : [],
      tsQuery
        ? this.search.keywordPassages(ownerId, tsQuery, CANDIDATES_PER_LIST)
        : [],
      this.meaningSearch(ownerId, query),
    ]);

    const results = fuse([
      keywordEvidence,
      keywordPassages,
      ...(Array.isArray(meaning) ? [meaning] : []),
    ]);
    return Array.isArray(meaning)
      ? { mode: "hybrid", results }
      : { mode: "keyword", keywordReason: meaning, results };
  }

  /** Meaning hits, or why they were skipped. */
  private async meaningSearch(
    ownerId: string,
    query: string,
  ): Promise<RankedHit[] | "budget" | "unavailable"> {
    if (!this.embedder) {
      return "unavailable";
    }
    if (await this.budgetSpent()) {
      return "budget";
    }
    try {
      const { values, inputTokens } = await this.embedder.embed(query);
      await this.usage.record({
        ownerId,
        operation: "query_embedding",
        provider: this.embedder.provider,
        model: this.embedder.model,
        inputTokens,
        outputTokens: 0,
      });
      return await this.search.similarEvidence(
        ownerId,
        values,
        CANDIDATES_PER_LIST,
      );
    } catch (error) {
      // Keyword results still answer the search; never log the query text.
      this.logger.warn(
        `Meaning search skipped (${error instanceof Error ? error.name : "unknown error"}).`,
      );
      return "unavailable";
    }
  }

  private async budgetSpent(): Promise<boolean> {
    if (this.budget.capUsd <= 0) {
      return false;
    }
    const { spentUsd } = await this.spend.spentToday(this.budget.timeZone);
    return spentUsd >= this.budget.capUsd;
  }
}

/** Reciprocal rank fusion keyed by source span; evidence wins over a bare passage. */
function fuse(lists: RankedHit[][]): SearchResult[] {
  const merged = new Map<string, SearchResult>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const score = 1 / (RRF_K + rank + 1);
      const existing = merged.get(hit.sourceSpanId);
      if (!existing) {
        merged.set(hit.sourceSpanId, { ...hit, score });
        return;
      }
      existing.score += score;
      if (existing.kind === "passage" && hit.kind === "evidence") {
        Object.assign(existing, {
          kind: hit.kind,
          text: hit.text,
          quote: hit.quote,
        });
      }
    });
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, RESULT_LIMIT)
    .map((result) => ({
      ...result,
      score: Math.round(result.score * 10_000) / 10_000,
    }));
}

export const SEARCH_USE_CASE = Symbol("SearchUseCase");
