import { Pool } from "pg";

import type {
  BookManagementRepository as BookManagementRepositoryPort,
  DeleteOutcome,
  DeletedBook,
  RenamedBook,
  RetryOutcome,
} from "../../domain/books/book-management";

export class BookManagementRepository implements BookManagementRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async rename(
    ownerId: string,
    bookId: string,
    title: string,
  ): Promise<RenamedBook | undefined> {
    const result = await this.pool.query<RenamedBook>(
      `UPDATE app.books
       SET title = $3, updated_at = now()
       WHERE id = $1 AND owner_id = $2
       RETURNING id, title`,
      [bookId, ownerId, title],
    );

    return result.rows[0];
  }

  async delete(ownerId: string, bookId: string): Promise<DeleteOutcome> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const book = await client.query(
        `SELECT id FROM app.books WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
        [bookId, ownerId],
      );
      if (book.rowCount === 0) {
        await client.query("ROLLBACK");
        return { kind: "not_found" };
      }

      // A running summary keeps writing until it finishes; refuse instead of
      // racing the worker.
      const running = await client.query(
        `SELECT 1
         FROM data.book_processing_status
         WHERE book_id = $1 AND owner_id = $2 AND run_status = 'running'
         LIMIT 1`,
        [bookId, ownerId],
      );
      if ((running.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return { kind: "processing" };
      }

      await client.query(
        `DELETE FROM app.books WHERE id = $1 AND owner_id = $2`,
        [bookId, ownerId],
      );
      await client.query("COMMIT");
      return { kind: "deleted", book: { ownerId, bookId } };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async requestRetry(ownerId: string, bookId: string): Promise<RetryOutcome> {
    const result = await this.pool.query(
      `INSERT INTO app.processing_retry_requests (owner_id, book_id, command_id)
       SELECT owner_id, book_id, command_id
       FROM data.book_processing_status
       WHERE book_id = $1 AND owner_id = $2 AND run_status = 'permanent_failed'
       RETURNING id`,
      [bookId, ownerId],
    );
    const commandCount = result.rowCount ?? 0;
    if (commandCount > 0) {
      return { kind: "requested", commandCount };
    }

    const book = await this.pool.query(
      `SELECT 1 FROM app.books WHERE id = $1 AND owner_id = $2`,
      [bookId, ownerId],
    );
    return book.rowCount === 0 ? { kind: "not_found" } : { kind: "not_failed" };
  }

  async deleteIncomplete(ownerId: string): Promise<DeletedBook[]> {
    const result = await this.pool.query<{ id: string }>(
      `DELETE FROM app.books
       WHERE owner_id = $1 AND status = 'pending_upload'
       RETURNING id`,
      [ownerId],
    );

    return result.rows.map((row) => ({ ownerId, bookId: row.id }));
  }
}
