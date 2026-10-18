import { Pool } from "pg";

import type {
  Highlight,
  HighlightRepository as HighlightRepositoryPort,
} from "../../domain/highlights/highlights";

interface HighlightRow {
  id: string;
  book_id: string;
  summary_id: string;
  paragraph_index: number;
  sentence_index: number;
  sentence_text: string;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = `id, book_id, summary_id, paragraph_index, sentence_index,
  sentence_text, note, created_at, updated_at`;

function toHighlight(row: HighlightRow): Highlight {
  return {
    id: row.id,
    bookId: row.book_id,
    summaryId: row.summary_id,
    paragraph: row.paragraph_index,
    sentence: row.sentence_index,
    text: row.sentence_text,
    ...(row.note ? { note: row.note } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class HighlightRepository implements HighlightRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async list(ownerId: string, bookId: string): Promise<Highlight[]> {
    const result = await this.pool.query<HighlightRow>(
      `SELECT ${COLUMNS} FROM app.highlights
       WHERE owner_id = $1 AND book_id = $2
       ORDER BY created_at`,
      [ownerId, bookId],
    );
    return result.rows.map(toHighlight);
  }

  async upsert(
    ownerId: string,
    highlight: Omit<Highlight, "id" | "createdAt" | "updatedAt">,
  ): Promise<Highlight> {
    const result = await this.pool.query<HighlightRow>(
      `INSERT INTO app.highlights
         (owner_id, book_id, summary_id, paragraph_index, sentence_index, sentence_text, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ON CONSTRAINT uq_app_highlights_sentence
       DO UPDATE SET note = EXCLUDED.note, updated_at = now()
       WHERE app.highlights.owner_id = EXCLUDED.owner_id
       RETURNING ${COLUMNS}`,
      [
        ownerId,
        highlight.bookId,
        highlight.summaryId,
        highlight.paragraph,
        highlight.sentence,
        highlight.text,
        highlight.note ?? null,
      ],
    );
    return toHighlight(result.rows[0]);
  }

  async remove(ownerId: string, highlightId: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM app.highlights WHERE owner_id = $1 AND id = $2",
      [ownerId, highlightId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
