import { Pool } from "pg";

import type {
  SourcePassage,
  SourcePassageRepository as SourcePassageRepositoryPort,
} from "../../domain/books/source-passage";

interface PassageRow {
  source_span_id: string;
  sequence_number: number;
  content: string;
  location: Record<string, unknown>;
  cited: boolean;
}

export class SourcePassageRepository implements SourcePassageRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findPassage(
    ownerId: string,
    bookId: string,
    sourceSpanId: string,
    context: number,
  ): Promise<SourcePassage | undefined> {
    const result = await this.pool.query<PassageRow>(
      `WITH target AS (
         SELECT source_document_id, sequence_number
         FROM data.book_source_passages
         WHERE owner_id = $1 AND book_id = $2 AND source_span_id = $3
       )
       SELECT
         passage.source_span_id,
         passage.sequence_number,
         passage.content,
         passage.location,
         passage.source_span_id = $3 AS cited
       FROM data.book_source_passages AS passage
       JOIN target
         ON passage.source_document_id = target.source_document_id
        AND passage.sequence_number
            BETWEEN target.sequence_number - $4 AND target.sequence_number + $4
       WHERE passage.owner_id = $1 AND passage.book_id = $2
       ORDER BY passage.sequence_number`,
      [ownerId, bookId, sourceSpanId, context],
    );

    if (result.rows.length === 0) {
      return undefined;
    }

    return {
      bookId,
      sourceSpanId,
      spans: result.rows.map((row) => ({
        sourceSpanId: row.source_span_id,
        sequenceNumber: row.sequence_number,
        content: row.content,
        location: row.location,
        cited: row.cited,
      })),
    };
  }
}
