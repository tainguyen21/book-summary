import { Pool } from "pg";

import type {
  BookProcessingStatus,
  BookReadRepository as BookReadRepositoryPort,
  LibraryBook,
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
         ORDER BY command.created_at DESC
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
}
