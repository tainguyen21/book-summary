import { z } from "zod";

export interface LibraryBook {
  id: string;
  title: string;
  filename: string;
  bookStatus: string;
  uploadState: string;
  createdAt: string;
  commandStatus?: string;
  runStatus?: string;
  /** Filled in from processing polls; not part of the list response. */
  latestEventAt?: string;
  latestEventType?: string;
}

/** A cited span of the book with nearby spans, in reading order. */
export interface SourcePassage {
  bookId: string;
  sourceSpanId: string;
  spans: {
    sourceSpanId: string;
    sequenceNumber: number;
    content: string;
    location: Record<string, unknown>;
    cited: boolean;
  }[];
}

/** Shared daily AI budget; `capUsd` 0 means no cap. */
export interface DailyUsage {
  spentUsd: number;
  capUsd: number;
  paused: boolean;
  resetsAt: string;
}

export interface UploadTicket {
  bookId: string;
  objectId: string;
  contentType: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface FinalizedUpload {
  bookId: string;
  bookStatus: "queued";
  commandId: string;
  commandStatus: "queued";
}

export interface BookProcessingStatus {
  bookId: string;
  bookStatus: string;
  commandStatus?: string;
  runStatus?: string;
  latestEventType?: string;
  latestEventAt?: string;
}

export interface SummaryCitation {
  sourceSpanId: string;
  order: number;
  location: Record<string, unknown>;
}

/** A summary sentence with its numbered sources and verified quotes. */
export interface SummarySentence {
  text: string;
  citations: (SummaryCitation & { quote?: string })[];
}

export interface PublishedSummary {
  id: string;
  body: string;
  generationVersion: string;
  provider: string;
  model: string;
  createdAt: string;
  citations: SummaryCitation[];
  /** Empty for summaries generated before sentence quotes existed. */
  paragraphs: SummarySentence[][];
  /** Part-by-part summaries of a long book in reading order; empty otherwise. */
  sections: SummarySection[];
}

/** One part of a long book, with citations numbered within the part. */
export interface SummarySection {
  position: number;
  /** Locations of the first and last source passage the part covers. */
  locationStart: Record<string, unknown>;
  locationEnd: Record<string, unknown>;
  citations: SummaryCitation[];
  paragraphs: SummarySentence[][];
}

export interface BookSummary {
  bookId: string;
  summary: PublishedSummary;
}

export const libraryBookSchema: z.ZodType<LibraryBook> = z.object({
  id: z.string().uuid(),
  title: z.string(),
  filename: z.string(),
  bookStatus: z.string(),
  uploadState: z.string(),
  createdAt: z.string().datetime(),
  commandStatus: z.string().optional(),
  runStatus: z.string().optional(),
});

export const uploadTicketSchema: z.ZodType<UploadTicket> = z.object({
  bookId: z.string().uuid(),
  objectId: z.string().uuid(),
  contentType: z.string(),
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});

export const finalizedUploadSchema: z.ZodType<FinalizedUpload> = z.object({
  bookId: z.string().uuid(),
  bookStatus: z.literal("queued"),
  commandId: z.string().uuid(),
  commandStatus: z.literal("queued"),
});

export const bookProcessingStatusSchema: z.ZodType<BookProcessingStatus> =
  z.object({
    bookId: z.string().uuid(),
    bookStatus: z.string(),
    commandStatus: z.string().optional(),
    runStatus: z.string().optional(),
    latestEventType: z.string().optional(),
    latestEventAt: z.string().datetime().optional(),
  });

export const sourcePassageSchema: z.ZodType<SourcePassage> = z.object({
  bookId: z.string().uuid(),
  sourceSpanId: z.string().uuid(),
  spans: z.array(
    z.object({
      sourceSpanId: z.string().uuid(),
      sequenceNumber: z.number().int(),
      content: z.string(),
      location: z.record(z.string(), z.unknown()),
      cited: z.boolean(),
    }),
  ),
});

export const dailyUsageSchema: z.ZodType<DailyUsage> = z.object({
  spentUsd: z.number().nonnegative(),
  capUsd: z.number().nonnegative(),
  paused: z.boolean(),
  resetsAt: z.string().datetime(),
});

const summaryCitationSchema = z.object({
  sourceSpanId: z.string().uuid(),
  order: z.number().int().positive(),
  location: z.record(z.string(), z.unknown()),
});

const summaryParagraphsSchema = z
  .array(
    z.array(
      z.object({
        text: z.string(),
        citations: z.array(summaryCitationSchema.extend({ quote: z.string().optional() })),
      }),
    ),
  )
  .default([]);

export const bookSummarySchema: z.ZodType<BookSummary> = z.object({
  bookId: z.string().uuid(),
  summary: z.object({
    id: z.string().uuid(),
    body: z.string().min(1),
    generationVersion: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    createdAt: z.string().datetime(),
    citations: z.array(summaryCitationSchema),
    paragraphs: summaryParagraphsSchema,
    sections: z
      .array(
        z.object({
          position: z.number().int().positive(),
          locationStart: z.record(z.string(), z.unknown()),
          locationEnd: z.record(z.string(), z.unknown()),
          citations: z.array(summaryCitationSchema),
          paragraphs: summaryParagraphsSchema,
        }),
      )
      .default([]),
  }),
});
