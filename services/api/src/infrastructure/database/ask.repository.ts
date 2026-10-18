import { createHash } from "node:crypto";

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

  async libraryVersion(ownerId: string): Promise<string | undefined> {
    const result = await this.pool.query<{ pair: string }>(
      `SELECT DISTINCT book_id::text || ':' || source_document_id::text AS pair
       FROM data.book_current_summaries
       WHERE owner_id = $1
       ORDER BY pair`,
      [ownerId],
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return createHash("sha256")
      .update(result.rows.map((row) => row.pair).join(","))
      .digest("hex")
      .slice(0, 32);
  }

  async followingSpanIds(
    ownerId: string,
    anchorSpanIds: string[],
    count: number,
  ): Promise<Map<string, string[]>> {
    const following = new Map<string, string[]>();
    if (anchorSpanIds.length === 0) {
      return following;
    }
    const result = await this.pool.query<{ anchor: string; span: string }>(
      `SELECT anchor.source_span_id AS anchor, next.source_span_id AS span
       FROM data.book_source_passages AS anchor
       JOIN data.book_source_passages AS next
         ON next.source_document_id = anchor.source_document_id
        AND next.sequence_number > anchor.sequence_number
        AND next.sequence_number <= anchor.sequence_number + $3
       WHERE anchor.owner_id = $1 AND anchor.source_span_id = ANY($2::uuid[])
       ORDER BY anchor.source_span_id, next.sequence_number`,
      [ownerId, anchorSpanIds, count],
    );
    for (const row of result.rows) {
      following.set(row.anchor, [
        ...(following.get(row.anchor) ?? []),
        row.span,
      ]);
    }
    return following;
  }

  async passages(
    ownerId: string,
    spanIds: string[],
    bookId?: string,
  ): Promise<RetrievedPassage[]> {
    if (spanIds.length === 0) {
      return [];
    }
    const result = await this.pool.query<{
      book_id: string;
      book_title: string;
      source_span_id: string;
      content: string;
      location: Record<string, unknown>;
      quote: string | null;
    }>(
      `SELECT p.book_id, coalesce(b.title, b.filename) AS book_title,
              p.source_span_id, p.content, p.location,
              (SELECT e.quote FROM data.book_search_evidence AS e
               WHERE e.owner_id = p.owner_id AND e.source_span_id = p.source_span_id
                 AND e.quote IS NOT NULL
               LIMIT 1) AS quote
       FROM data.book_source_passages AS p
       JOIN app.books AS b ON b.id = p.book_id AND b.owner_id = p.owner_id
       WHERE p.owner_id = $1 AND p.source_span_id = ANY($2::uuid[])
         AND ($3::uuid IS NULL OR p.book_id = $3)`,
      [ownerId, spanIds, bookId ?? null],
    );
    const byId = new Map(result.rows.map((row) => [row.source_span_id, row]));
    // Keep the retrieval order (most relevant first).
    return spanIds.flatMap((id) => {
      const row = byId.get(id);
      return row
        ? [
            {
              bookId: row.book_id,
              bookTitle: row.book_title,
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
    const result =
      key.scope.kind === "book"
        ? await this.pool.query<CachedRow>(
            `SELECT answered, answer_text, sources, marker_quotes
             FROM app.book_answers
             WHERE owner_id = $1 AND book_id = $2 AND question_key = $3
               AND prompt_version = $4 AND source_document_id = $5`,
            [
              key.ownerId,
              key.scope.bookId,
              key.questionKey,
              key.promptVersion,
              key.scope.sourceDocumentId,
            ],
          )
        : await this.pool.query<CachedRow>(
            `SELECT answered, answer_text, sources, marker_quotes
             FROM app.library_answers
             WHERE owner_id = $1 AND question_key = $2
               AND prompt_version = $3 AND library_version = $4`,
            [
              key.ownerId,
              key.questionKey,
              key.promptVersion,
              key.scope.libraryVersion,
            ],
          );
    const row = result.rows[0];
    return row
      ? {
          answered: row.answered,
          answerText: row.answer_text,
          sources: row.sources,
          markerQuotes: row.marker_quotes,
        }
      : undefined;
  }

  async saveAnswer(key: AnswerCacheKey, answer: CachedAnswer): Promise<void> {
    const answerColumns = [
      answer.answered,
      answer.answerText,
      JSON.stringify(answer.sources),
      JSON.stringify(answer.markerQuotes),
    ];
    if (key.scope.kind === "book") {
      await this.pool.query(
        `INSERT INTO app.book_answers
           (owner_id, book_id, question_key, prompt_version, source_document_id,
            answered, answer_text, sources, marker_quotes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
         ON CONFLICT ON CONSTRAINT uq_app_book_answers_key DO NOTHING`,
        [
          key.ownerId,
          key.scope.bookId,
          key.questionKey,
          key.promptVersion,
          key.scope.sourceDocumentId,
          ...answerColumns,
        ],
      );
      return;
    }
    await this.pool.query(
      `INSERT INTO app.library_answers
         (owner_id, question_key, prompt_version, library_version,
          answered, answer_text, sources, marker_quotes)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
       ON CONFLICT ON CONSTRAINT uq_app_library_answers_key DO NOTHING`,
      [
        key.ownerId,
        key.questionKey,
        key.promptVersion,
        key.scope.libraryVersion,
        ...answerColumns,
      ],
    );
  }
}

interface CachedRow {
  answered: boolean;
  answer_text: string;
  sources: CachedAnswer["sources"];
  marker_quotes: CachedAnswer["markerQuotes"];
}
