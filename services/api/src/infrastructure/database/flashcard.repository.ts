import { Pool } from "pg";

import type {
  CardSchedule,
  Flashcard,
  FlashcardRepository as FlashcardRepositoryPort,
  NewFlashcard,
  ReviewRating,
} from "../../domain/flashcards/flashcards";

interface FlashcardRow {
  id: string;
  book_id: string;
  book_title: string;
  front: string;
  back: string;
  source_span_ids: string[];
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: Date | null;
}

const SELECT_CARD = `
  SELECT card.id, card.book_id, coalesce(book.title, book.filename) AS book_title,
         card.front, card.back, card.source_span_ids::text[] AS source_span_ids,
         card.due, card.stability, card.difficulty, card.elapsed_days,
         card.scheduled_days, card.learning_steps, card.reps, card.lapses,
         card.state, card.last_review
  FROM app.flashcards AS card
  JOIN app.books AS book ON book.id = card.book_id AND book.owner_id = card.owner_id`;

function toCard(row: FlashcardRow): Flashcard {
  return {
    id: row.id,
    bookId: row.book_id,
    bookTitle: row.book_title,
    front: row.front,
    back: row.back,
    sourceSpanIds: row.source_span_ids,
    schedule: {
      due: row.due,
      stability: row.stability,
      difficulty: row.difficulty,
      elapsedDays: row.elapsed_days,
      scheduledDays: row.scheduled_days,
      learningSteps: row.learning_steps,
      reps: row.reps,
      lapses: row.lapses,
      state: row.state,
      ...(row.last_review ? { lastReview: row.last_review } : {}),
    },
  };
}

export class FlashcardRepository implements FlashcardRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async replaceDeck(
    ownerId: string,
    bookId: string,
    sourceDocumentId: string,
    cards: NewFlashcard[],
    now: Date,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM app.flashcards WHERE owner_id = $1 AND book_id = $2",
        [ownerId, bookId],
      );
      for (const [position, card] of cards.entries()) {
        await client.query(
          `INSERT INTO app.flashcards
             (owner_id, book_id, source_document_id, position, front, back, source_span_ids, due)
           VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8)`,
          [
            ownerId,
            bookId,
            sourceDocumentId,
            position,
            card.front,
            card.back,
            card.sourceSpanIds,
            now,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async bookDeck(ownerId: string, bookId: string): Promise<Flashcard[]> {
    const result = await this.pool.query<FlashcardRow>(
      `${SELECT_CARD}
       WHERE card.owner_id = $1 AND card.book_id = $2
       ORDER BY card.position`,
      [ownerId, bookId],
    );
    return result.rows.map(toCard);
  }

  async due(ownerId: string, now: Date, limit: number): Promise<Flashcard[]> {
    const result = await this.pool.query<FlashcardRow>(
      `${SELECT_CARD}
       WHERE card.owner_id = $1 AND card.due <= $2
       ORDER BY card.due, card.position
       LIMIT $3`,
      [ownerId, now, limit],
    );
    return result.rows.map(toCard);
  }

  async dueCount(ownerId: string, now: Date): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "SELECT count(*) FROM app.flashcards WHERE owner_id = $1 AND due <= $2",
      [ownerId, now],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async find(ownerId: string, cardId: string): Promise<Flashcard | undefined> {
    const result = await this.pool.query<FlashcardRow>(
      `${SELECT_CARD} WHERE card.owner_id = $1 AND card.id = $2`,
      [ownerId, cardId],
    );
    return result.rows[0] ? toCard(result.rows[0]) : undefined;
  }

  async saveReview(
    ownerId: string,
    card: Flashcard,
    rating: ReviewRating,
    next: CardSchedule,
    reviewedAt: Date,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE app.flashcards
         SET due = $3, stability = $4, difficulty = $5, elapsed_days = $6,
             scheduled_days = $7, learning_steps = $8, reps = $9, lapses = $10,
             state = $11, last_review = $12
         WHERE owner_id = $1 AND id = $2`,
        [
          ownerId,
          card.id,
          next.due,
          next.stability,
          next.difficulty,
          next.elapsedDays,
          next.scheduledDays,
          next.learningSteps,
          next.reps,
          next.lapses,
          next.state,
          next.lastReview ?? reviewedAt,
        ],
      );
      await client.query(
        `INSERT INTO app.flashcard_reviews
           (owner_id, flashcard_id, rating, state_before, scheduled_days, reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          ownerId,
          card.id,
          rating,
          card.schedule.state,
          next.scheduledDays,
          reviewedAt,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
