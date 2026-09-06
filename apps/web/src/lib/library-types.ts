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
