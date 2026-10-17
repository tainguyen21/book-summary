import { Pool } from "pg";

import type {
  AnswerCacheKey,
  AskRepository as AskRepositoryPort,
  CachedAnswer,
  RetrievedPassage,
} from "../../domain/ask/ask";

export class AskRepository implements AskRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async currentSourceDocument(
    ownerId: string,
    bookId: string,
  ): Promise<string | undefined> {
    const result = await this.pool.query<{ source_document_id: string }>(
      `SELECT source_document_id
       FROM data.book_current_summaries
       WHERE owner_id = $1 AND book_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [ownerId, bookId],
    );
    return result.rows[0]?.source_document_id;
  }

  async passages(
    ownerId: string,
    bookId: string,
    spanIds: string[],
  ): Promise<RetrievedPassage[]> {
    if (spanIds.length === 0) {
      return [];
    }
    const result = await this.pool.query<{
      source_span_id: string;
      content: string;
      location: Record<string, unknown>;
      quote: string | null;
    }>(
      `SELECT p.source_span_id, p.content, p.location,
              (SELECT e.quote FROM data.book_search_evidence AS e
               WHERE e.owner_id = p.owner_id AND e.source_span_id = p.source_span_id
                 AND e.quote IS NOT NULL
               LIMIT 1) AS quote
       FROM data.book_source_passages AS p
       WHERE p.owner_id = $1 AND p.book_id = $2 AND p.source_span_id = ANY($3::uuid[])`,
      [ownerId, bookId, spanIds],
    );
    const byId = new Map(result.rows.map((row) => [row.source_span_id, row]));
    // Keep the retrieval order (most relevant first).
    return spanIds.flatMap((id) => {
      const row = byId.get(id);
      return row
        ? [
            {
              sourceSpanId: id,
              content: row.content,
              location: row.location,
              ...(row.quote ? { quote: row.quote } : {}),
            },
          ]
        : [];
    });
  }

  async cached(key: AnswerCacheKey): Promise<CachedAnswer | undefined> {
    const result = await this.pool.query<{
      answered: boolean;
      answer_text: string;
      sources: CachedAnswer["sources"];
    }>(
      `SELECT answered, answer_text, sources
       FROM app.book_answers
       WHERE owner_id = $1 AND book_id = $2 AND question_key = $3
         AND prompt_version = $4 AND source_document_id = $5`,
      [
        key.ownerId,
        key.bookId,
        key.questionKey,
        key.promptVersion,
        key.sourceDocumentId,
      ],
    );
    const row = result.rows[0];
    return row
      ? {
          answered: row.answered,
          answerText: row.answer_text,
          sources: row.sources,
        }
      : undefined;
  }

  async saveAnswer(key: AnswerCacheKey, answer: CachedAnswer): Promise<void> {
    await this.pool.query(
      `INSERT INTO app.book_answers
         (owner_id, book_id, question_key, prompt_version, source_document_id, answered, answer_text, sources)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT ON CONSTRAINT uq_app_book_answers_key DO NOTHING`,
      [
        key.ownerId,
        key.bookId,
        key.questionKey,
        key.promptVersion,
        key.sourceDocumentId,
        answer.answered,
        answer.answerText,
        JSON.stringify(answer.sources),
      ],
    );
  }
}
