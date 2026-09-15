import { z } from "zod";

export interface LibraryBook {
  id: string;
  title: string;
  filename: string;
  bookStatus: string;
  uploadState: string;
  createdAt: string;
  commandStatus?: string;
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

export interface PublishedSummary {
  id: string;
  body: string;
  generationVersion: string;
  provider: string;
  model: string;
  createdAt: string;
  citations: SummaryCitation[];
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

export const bookSummarySchema: z.ZodType<BookSummary> = z.object({
  bookId: z.string().uuid(),
  summary: z.object({
    id: z.string().uuid(),
    body: z.string().min(1),
    generationVersion: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    createdAt: z.string().datetime(),
    citations: z.array(
      z.object({
        sourceSpanId: z.string().uuid(),
        order: z.number().int().positive(),
        location: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
});
