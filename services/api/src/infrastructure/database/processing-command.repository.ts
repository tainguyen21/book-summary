import type { PoolClient } from "pg";

import type { QueuedProcessingCommand } from "../../domain/books/book";

interface ProcessingCommandRow {
  id: string;
  status: "queued";
}

export class ProcessingCommandRepository {
  async enqueueIngest(
    client: PoolClient,
    input: { ownerId: string; bookId: string },
  ): Promise<QueuedProcessingCommand> {
    const result = await client.query<ProcessingCommandRow>(
      `INSERT INTO app.processing_commands (
         owner_id,
         book_id,
         command_type,
         processing_version
       )
       VALUES ($1, $2, 'ingest_book', 'v1')
       ON CONFLICT (command_type, book_id, processing_version)
       DO UPDATE SET updated_at = app.processing_commands.updated_at
       RETURNING id, status`,
      [input.ownerId, input.bookId],
    );

    return {
      commandId: result.rows[0].id,
      commandStatus: result.rows[0].status,
    };
  }
}
