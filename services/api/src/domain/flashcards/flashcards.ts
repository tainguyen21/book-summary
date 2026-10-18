/** Ratings a reader gives a card, as FSRS defines them. */
export type ReviewRating = 1 | 2 | 3 | 4;

/** FSRS memory state stored with each card (ts-fsrs `Card`). */
export interface CardSchedule {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview?: Date;
}

export interface Flashcard {
  id: string;
  bookId: string;
  bookTitle: string;
  front: string;
  back: string;
  sourceSpanIds: string[];
  schedule: CardSchedule;
}

export interface NewFlashcard {
  front: string;
  back: string;
  sourceSpanIds: string[];
}

export interface FlashcardRepository {
  /** Replaces the book's cards with a fresh deck, all due now. */
  replaceDeck(
    ownerId: string,
    bookId: string,
    sourceDocumentId: string,
    cards: NewFlashcard[],
    now: Date,
  ): Promise<void>;
  bookDeck(ownerId: string, bookId: string): Promise<Flashcard[]>;
  due(ownerId: string, now: Date, limit: number): Promise<Flashcard[]>;
  dueCount(ownerId: string, now: Date): Promise<number>;
  find(ownerId: string, cardId: string): Promise<Flashcard | undefined>;
  saveReview(
    ownerId: string,
    card: Flashcard,
    rating: ReviewRating,
    next: CardSchedule,
    reviewedAt: Date,
  ): Promise<void>;
}

export const FLASHCARD_REPOSITORY = Symbol("FlashcardRepository");
