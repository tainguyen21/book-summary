import { Pool } from "pg";

import type {
  BookProcessingStatus,
  BookReadRepository as BookReadRepositoryPort,
  BookSummary,
  LibraryBook,
  SummaryCitation,
  SummarySection,
  SummarySentence,
} from "../../domain/books/book";

interface LibraryBookRow {
  id: string;
  title: string | null;
  filename: string;
  book_status: string;
  upload_state: string;
  created_at: Date;
  command_status: string | null;
}

interface BookProcessingStatusRow {
  book_id: string;
  book_status: string;
  command_status: string | null;
  run_status: string | null;
  latest_event_type: string | null;
  latest_event_at: Date | null;
}

interface PublishedSummaryRow {
  id: string;
  book_id: string;
  body: string;
  generation_version: string;
  provider: string;
  model: string;
  created_at: Date;
  segments: unknown;
}

interface StoredSegment {
  sentences?: {
    text?: unknown;
    citations?: { source_span_id?: unknown; quote?: unknown }[];
  }[];
}

interface SummaryCitationRow {
  source_span_id: string;
  citation_order: number;
  location: unknown;
}

interface SummarySectionRow {
  position: number;
  segments: unknown;
  citations: unknown;
  location_start: unknown;
  location_end: unknown;
  title: string | null;
}

export class BookReadRepository implements BookReadRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async listLibrary(ownerId: string): Promise<LibraryBook[]> {
    const result = await this.pool.query<LibraryBookRow>(
      `SELECT
         book.id,
         book.title,
         book.filename,
         book.status AS book_status,
         object.state AS upload_state,
         book.created_at,
         command.status AS command_status
       FROM app.books AS book
       JOIN app.book_objects AS object
         ON object.book_id = book.id
        AND object.owner_id = book.owner_id
        AND object.object_type = 'original'
       LEFT JOIN LATERAL (
         SELECT status
         FROM app.processing_commands
         WHERE owner_id = book.owner_id
           AND book_id = book.id
           AND command_type = 'ingest_book'
           AND processing_version = 'v1'
         ORDER BY created_at DESC
         LIMIT 1
       ) AS command ON TRUE
       WHERE book.owner_id = $1
       ORDER BY book.created_at DESC`,
      [ownerId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title ?? row.filename,
      filename: row.filename,
      bookStatus: row.book_status,
      uploadState: row.upload_state,
      createdAt: row.created_at.toISOString(),
      commandStatus: row.command_status ?? undefined,
    }));
  }

  async getProcessingStatus(
    ownerId: string,
    bookId: string,
  ): Promise<BookProcessingStatus | undefined> {
    const result = await this.pool.query<BookProcessingStatusRow>(
      `SELECT
         book.id AS book_id,
         book.status AS book_status,
         status.command_status,
         status.run_status,
         status.latest_event_type,
         status.latest_event_at
       FROM app.books AS book
       LEFT JOIN LATERAL (
         SELECT
           projection.command_status,
           projection.run_status,
           projection.latest_event_type,
           projection.latest_event_at
         FROM data.book_processing_status AS projection
         JOIN app.processing_commands AS command
           ON command.id = projection.command_id
         WHERE projection.owner_id = book.owner_id
           AND projection.book_id = book.id
         ORDER BY
           CASE command.command_type
             WHEN 'regenerate_summary' THEN 0
             ELSE 1
           END,
           command.created_at DESC,
           command.id DESC
         LIMIT 1
       ) AS status ON TRUE
       WHERE book.owner_id = $1
         AND book.id = $2`,
      [ownerId, bookId],
    );

    const row = result.rows[0];

    if (!row) {
      return undefined;
    }

    return {
      bookId: row.book_id,
      bookStatus: row.book_status,
      commandStatus: row.command_status ?? undefined,
      runStatus: row.run_status ?? undefined,
      latestEventType: row.latest_event_type ?? undefined,
      latestEventAt: row.latest_event_at?.toISOString(),
    };
  }

  async getPublishedSummary(
    ownerId: string,
    bookId: string,
  ): Promise<BookSummary | undefined> {
    const summaryResult = await this.pool.query<PublishedSummaryRow>(
      `SELECT
         id,
         book_id,
         body,
         generation_version,
         provider,
         model,
         created_at,
         segments
       FROM data.book_current_summaries
       WHERE owner_id = $1
         AND book_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [ownerId, bookId],
    );
    const summary = summaryResult.rows[0];

    if (!summary) {
      return undefined;
    }

    const citationResult = await this.pool.query<SummaryCitationRow>(
      `SELECT source_span_id, citation_order, location
       FROM data.book_current_summary_citations
       WHERE owner_id = $1
         AND book_id = $2
         AND generated_summary_id = $3
       ORDER BY citation_order`,
      [ownerId, bookId, summary.id],
    );

    const citations = citationResult.rows.map(summaryCitation);

    const sectionResult = await this.pool.query<SummarySectionRow>(
      `SELECT position, segments, citations, location_start, location_end, title
       FROM data.book_current_summary_sections
       WHERE owner_id = $1
         AND book_id = $2
         AND generated_summary_id = $3
       ORDER BY position`,
      [ownerId, bookId, summary.id],
    );

    return {
      bookId: summary.book_id,
      summary: {
        id: summary.id,
        body: summary.body,
        generationVersion: summary.generation_version,
        provider: summary.provider,
        model: summary.model,
        createdAt: summary.created_at.toISOString(),
        citations,
        paragraphs: sentenceParagraphs(summary.segments, citations),
        sections: sectionResult.rows.map(summarySection),
      },
    };
  }
}

function summaryCitation(row: SummaryCitationRow): SummaryCitation {
  return {
    sourceSpanId: row.source_span_id,
    order: row.citation_order,
    location: locationRecord(row.location),
  };
}

function summarySection(row: SummarySectionRow): SummarySection {
  const citations = (
    Array.isArray(row.citations) ? (row.citations as SummaryCitationRow[]) : []
  ).map(summaryCitation);

  return {
    position: row.position,
    ...(row.title ? { title: row.title } : {}),
    locationStart: locationRecord(row.location_start),
    locationEnd: locationRecord(row.location_end),
    citations,
    paragraphs: sentenceParagraphs(row.segments, citations),
  };
}

/**
 * Stored segments joined with the summary's numbered citations, so sentence
 * markers use the same numbers and locations as the source list.
 */
function sentenceParagraphs(
  segments: unknown,
  citations: SummaryCitation[],
): SummarySentence[][] {
  if (!Array.isArray(segments)) {
    return [];
  }
  const bySpan = new Map(
    citations.map((citation) => [citation.sourceSpanId, citation]),
  );

  return (segments as StoredSegment[]).map((paragraph) =>
    (paragraph.sentences ?? [])
      .filter((sentence) => typeof sentence.text === "string" && sentence.text)
      .map((sentence) => ({
        text: sentence.text as string,
        citations: (sentence.citations ?? []).flatMap((stored) => {
          const citation =
            typeof stored.source_span_id === "string"
              ? bySpan.get(stored.source_span_id)
              : undefined;
          if (!citation) {
            return [];
          }
          return [
            typeof stored.quote === "string" && stored.quote
              ? { ...citation, quote: stored.quote }
              : citation,
          ];
        }),
      })),
  );
}

function locationRecord(value: unknown): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Current summary citation location must be a JSON object.");
  }

  return value as Record<string, unknown>;
}
