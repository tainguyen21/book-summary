import type { PoolClient } from "pg";

import type { QueuedProcessingCommand } from "../../domain/books/book";

interface ProcessingCommandRow {
  id: string;
  status: "queued";
}

type EnqueueableCommandType = "ingest_book" | "regenerate_summary";

export class ProcessingCommandRepository {
  async enqueueIngest(
    client: PoolClient,
    input: { ownerId: string; bookId: string },
  ): Promise<QueuedProcessingCommand> {
    return this.enqueue(client, { ...input, commandType: "ingest_book" });
  }

  async enqueueRegenerateSummary(
    client: PoolClient,
    input: { ownerId: string; bookId: string },
  ): Promise<QueuedProcessingCommand> {
    return this.enqueue(client, {
      ...input,
      commandType: "regenerate_summary",
    });
  }

  private async enqueue(
    client: PoolClient,
    input: {
      ownerId: string;
      bookId: string;
      commandType: EnqueueableCommandType;
    },
  ): Promise<QueuedProcessingCommand> {
    const result = await client.query<ProcessingCommandRow>(
      `INSERT INTO app.processing_commands (
         owner_id,
         book_id,
         command_type,
         processing_version
       )
       VALUES ($1, $2, $3, 'v1')
       ON CONFLICT (command_type, book_id, processing_version)
       DO UPDATE SET updated_at = app.processing_commands.updated_at
       RETURNING id, status`,
      [input.ownerId, input.bookId, input.commandType],
    );

    return {
      commandId: result.rows[0].id,
      commandStatus: result.rows[0].status,
    };
  }
}
