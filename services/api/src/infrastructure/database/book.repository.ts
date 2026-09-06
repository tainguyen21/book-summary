import { Pool, type PoolClient } from "pg";

import {
  type BookUploadRepository,
  type CreateUploadInput,
  type FinalizableBookUpload,
  type PendingBookUpload,
  type QueuedProcessingCommand,
  type StoredObjectHead,
  UploadConflictError,
} from "../../domain/books/book";
import { ProcessingCommandRepository } from "./processing-command.repository";

interface PendingUploadRow {
  book_id: string;
  object_id: string;
  object_key: string;
  content_type: string;
  size_bytes: string;
}

interface FinalizableUploadRow extends PendingUploadRow {
  book_status: string;
  object_state: string;
  command_id: string | null;
  command_status: string | null;
}

interface LockedUploadRow extends PendingUploadRow {
  book_status: string;
  object_state: string;
}

interface ExistingCommandRow {
  id: string;
  status: "queued";
}

export class BookRepository implements BookUploadRepository {
  constructor(
    private readonly pool: Pool,
    private readonly processingCommands: ProcessingCommandRepository,
  ) {}

  async createPendingUpload(
    input: CreateUploadInput,
  ): Promise<PendingBookUpload> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const title =
        input.title?.trim() || this.titleFromFilename(input.filename);
      const result = await client.query<PendingUploadRow>(
        `WITH ids AS (
           SELECT gen_random_uuid() AS book_id, gen_random_uuid() AS object_id
         ),
         inserted_book AS (
           INSERT INTO app.books (id, owner_id, title, filename, status)
           SELECT book_id, $1, $2, $3, 'pending_upload'
           FROM ids
         )
         INSERT INTO app.book_objects (
           id,
           owner_id,
           book_id,
           object_type,
           object_key,
           content_type,
           size_bytes,
           state
         )
         SELECT
           ids.object_id,
           $1,
           ids.book_id,
           'original',
           format('books/%s/%s/%s/original', $1, ids.book_id, ids.object_id),
           $4,
           $5,
           'pending'
         FROM ids
         RETURNING
           book_id,
           id AS object_id,
           object_key,
           content_type,
           size_bytes`,
        [
          input.ownerId,
          title,
          input.filename.trim(),
          input.contentType.trim().toLowerCase(),
          input.sizeBytes,
        ],
      );

      await client.query("COMMIT");
      return this.pendingUpload(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findOwnedUploadForFinalization(input: {
    ownerId: string;
    bookId: string;
  }): Promise<FinalizableBookUpload | undefined> {
    const result = await this.pool.query<FinalizableUploadRow>(
      `SELECT
         book.id AS book_id,
         object.id AS object_id,
         object.object_key,
         object.content_type,
         object.size_bytes,
         book.status AS book_status,
         object.state AS object_state,
         command.id AS command_id,
         command.status AS command_status
       FROM app.books AS book
       JOIN app.book_objects AS object
         ON object.book_id = book.id
        AND object.owner_id = book.owner_id
        AND object.object_type = 'original'
       LEFT JOIN app.processing_commands AS command
         ON command.book_id = book.id
        AND command.owner_id = book.owner_id
        AND command.command_type = 'ingest_book'
        AND command.processing_version = 'v1'
       WHERE book.id = $1
         AND book.owner_id = $2`,
      [input.bookId, input.ownerId],
    );

    const row = result.rows[0];

    if (!row) {
      return undefined;
    }

    return {
      ...this.pendingUpload(row),
      bookStatus: row.book_status,
      objectState: row.object_state,
      commandId: row.command_id ?? undefined,
      commandStatus: row.command_status ?? undefined,
    };
  }

  async finalizeOwnedUpload(input: {
    ownerId: string;
    bookId: string;
    head: StoredObjectHead;
  }): Promise<QueuedProcessingCommand> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const locked = await this.lockOwnedUpload(client, input);

      if (!locked) {
        throw new UploadConflictError("The upload is no longer available.");
      }

      if (
        locked.book_status === "queued" &&
        locked.object_state === "uploaded"
      ) {
        const command = await this.existingQueuedCommand(
          client,
          input.ownerId,
          input.bookId,
        );

        if (!command) {
          throw new UploadConflictError("The upload is no longer available.");
        }

        await client.query("COMMIT");
        return {
          commandId: command.id,
          commandStatus: command.status,
        };
      }

      if (
        locked.book_status !== "pending_upload" ||
        locked.object_state !== "pending"
      ) {
        throw new UploadConflictError("The upload is no longer available.");
      }

      this.assertHeadMatches(locked, input.head);

      await client.query(
        `UPDATE app.book_objects
         SET state = 'uploaded',
             etag = $1,
             updated_at = now()
         WHERE id = $2`,
        [input.head.etag ?? null, locked.object_id],
      );
      await client.query(
        `UPDATE app.books
         SET status = 'queued',
             updated_at = now()
         WHERE id = $1`,
        [input.bookId],
      );
      const command = await this.processingCommands.enqueueIngest(client, {
        ownerId: input.ownerId,
        bookId: input.bookId,
      });

      await client.query("COMMIT");
      return command;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockOwnedUpload(
    client: PoolClient,
    input: { ownerId: string; bookId: string },
  ): Promise<LockedUploadRow | undefined> {
    const result = await client.query<LockedUploadRow>(
      `SELECT
         book.id AS book_id,
         object.id AS object_id,
         object.object_key,
         object.content_type,
         object.size_bytes,
         book.status AS book_status,
         object.state AS object_state
       FROM app.books AS book
       JOIN app.book_objects AS object
         ON object.book_id = book.id
        AND object.owner_id = book.owner_id
        AND object.object_type = 'original'
       WHERE book.id = $1
         AND book.owner_id = $2
       FOR UPDATE OF book, object`,
      [input.bookId, input.ownerId],
    );

    return result.rows[0];
  }

  private async existingQueuedCommand(
    client: PoolClient,
    ownerId: string,
    bookId: string,
  ): Promise<ExistingCommandRow | undefined> {
    const result = await client.query<ExistingCommandRow>(
      `SELECT id, status
       FROM app.processing_commands
       WHERE owner_id = $1
         AND book_id = $2
         AND command_type = 'ingest_book'
         AND processing_version = 'v1'`,
      [ownerId, bookId],
    );

    return result.rows[0];
  }

  private assertHeadMatches(
    upload: LockedUploadRow,
    head: StoredObjectHead,
  ): void {
    if (
      head.contentType.trim().toLowerCase() !== upload.content_type ||
      head.sizeBytes !== Number(upload.size_bytes)
    ) {
      throw new UploadConflictError(
        "The uploaded file does not match the upload request.",
      );
    }
  }

  private pendingUpload(row: PendingUploadRow): PendingBookUpload {
    return {
      bookId: row.book_id,
      objectId: row.object_id,
      objectKey: row.object_key,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes),
    };
  }

  private titleFromFilename(filename: string): string {
    const extensionIndex = filename.lastIndexOf(".");

    return filename.slice(0, extensionIndex).trim();
  }
}
