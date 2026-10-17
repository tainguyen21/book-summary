import { Pool } from "pg";

import type {
  RankedHit,
  SearchRepository as SearchRepositoryPort,
} from "../../domain/search/search";

interface HitRow {
  book_id: string;
  book_title: string;
  source_span_id: string;
  location: Record<string, unknown>;
  text: string;
  quote: string | null;
}

// Marks around matched words in passage snippets; the web turns them into <mark>.
export const HIGHLIGHT_START = "\u0002";
export const HIGHLIGHT_END = "\u0003";

const toHit =
  (kind: RankedHit["kind"]) =>
  (row: HitRow): RankedHit => ({
    bookId: row.book_id,
    bookTitle: row.book_title,
    sourceSpanId: row.source_span_id,
    location: row.location,
    kind,
    text: row.text,
    ...(row.quote ? { quote: row.quote } : {}),
  });

/** Owner-scoped keyword and meaning queries over evidence and passages. */
export class SearchRepository implements SearchRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async keywordEvidence(
    ownerId: string,
    query: string,
    limit: number,
    bookId?: string,
  ): Promise<RankedHit[]> {
    const result = await this.pool.query<HitRow>(
      `SELECT e.book_id, coalesce(b.title, b.filename) AS book_title,
              e.source_span_id, e.location, e.statement AS text, e.quote
       FROM data.book_search_evidence AS e
       JOIN app.books AS b ON b.id = e.book_id AND b.owner_id = e.owner_id
       WHERE e.owner_id = $1
         AND ($4::uuid IS NULL OR e.book_id = $4)
         AND to_tsvector('simple', e.statement) @@ to_tsquery('simple', $2)
       ORDER BY ts_rank(to_tsvector('simple', e.statement), to_tsquery('simple', $2)) DESC
       LIMIT $3`,
      [ownerId, query, limit, bookId ?? null],
    );
    return result.rows.map(toHit("evidence"));
  }

  async keywordPassages(
    ownerId: string,
    query: string,
    limit: number,
    bookId?: string,
  ): Promise<RankedHit[]> {
    const result = await this.pool.query<HitRow>(
      `SELECT p.book_id, coalesce(b.title, b.filename) AS book_title,
              p.source_span_id, p.location,
              ts_headline('simple', p.content, to_tsquery('simple', $2),
                'MaxFragments=1, MinWords=12, MaxWords=32, StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_END}') AS text,
              NULL::text AS quote
       FROM data.book_source_passages AS p
       JOIN app.books AS b ON b.id = p.book_id AND b.owner_id = p.owner_id
       WHERE p.owner_id = $1
         AND ($4::uuid IS NULL OR p.book_id = $4)
         AND to_tsvector('simple', p.content) @@ to_tsquery('simple', $2)
       ORDER BY ts_rank(to_tsvector('simple', p.content), to_tsquery('simple', $2)) DESC
       LIMIT $3`,
      [ownerId, query, limit, bookId ?? null],
    );
    return result.rows.map(toHit("passage"));
  }

  async similarEvidence(
    ownerId: string,
    embedding: number[],
    limit: number,
    bookId?: string,
  ): Promise<RankedHit[]> {
    const result = await this.pool.query<HitRow>(
      `SELECT e.book_id, coalesce(b.title, b.filename) AS book_title,
              e.source_span_id, e.location, e.statement AS text, e.quote
       FROM data.book_search_evidence AS e
       JOIN app.books AS b ON b.id = e.book_id AND b.owner_id = e.owner_id
       WHERE e.owner_id = $1 AND e.embedding IS NOT NULL
         AND ($4::uuid IS NULL OR e.book_id = $4)
       ORDER BY e.embedding <=> $2::vector(768)
       LIMIT $3`,
      [ownerId, `[${embedding.join(",")}]`, limit, bookId ?? null],
    );
    return result.rows.map(toHit("evidence"));
  }
}
