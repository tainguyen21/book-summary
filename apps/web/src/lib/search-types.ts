import { z } from "zod";

export const HIGHLIGHT_START = "\u0002";
export const HIGHLIGHT_END = "\u0003";

const searchResultSchema = z.object({
  bookId: z.string().uuid(),
  bookTitle: z.string(),
  sourceSpanId: z.string().uuid(),
  location: z.record(z.string(), z.unknown()),
  kind: z.enum(["evidence", "passage"]),
  text: z.string(),
  quote: z.string().optional(),
  score: z.number(),
});

export const searchResponseSchema = z.object({
  mode: z.enum(["hybrid", "keyword"]),
  keywordReason: z.enum(["budget", "unavailable"]).optional(),
  results: z.array(searchResultSchema),
});

export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
