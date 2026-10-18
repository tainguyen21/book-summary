-- Flashcards made from a book's summary, scheduled with FSRS (ts-fsrs in the
-- API). The API owns the app schema; card text cites the summary's sources.
CREATE TABLE app.flashcards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
    source_document_id UUID NOT NULL,
    position INTEGER NOT NULL,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    source_span_ids UUID[] NOT NULL DEFAULT '{}',
    -- FSRS memory state (ts-fsrs Card).
    due TIMESTAMPTZ NOT NULL,
    stability DOUBLE PRECISION NOT NULL DEFAULT 0,
    difficulty DOUBLE PRECISION NOT NULL DEFAULT 0,
    elapsed_days INTEGER NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    learning_steps INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    state SMALLINT NOT NULL DEFAULT 0 CHECK (state BETWEEN 0 AND 3),
    last_review TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_app_flashcards_owner_due ON app.flashcards(owner_id, due);
CREATE INDEX ix_app_flashcards_book ON app.flashcards(book_id, position);

-- One row per review, for history and future parameter tuning.
CREATE TABLE app.flashcard_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    flashcard_id UUID NOT NULL REFERENCES app.flashcards(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 4),
    state_before SMALLINT NOT NULL,
    scheduled_days INTEGER NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_app_flashcard_reviews_card ON app.flashcard_reviews(flashcard_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.flashcards TO app_rw;
GRANT SELECT, INSERT ON app.flashcard_reviews TO app_rw;

-- Card generation is recorded in the usage ledger like other API spend.
ALTER TABLE data.model_usage DROP CONSTRAINT model_usage_operation_check;
ALTER TABLE data.model_usage ADD CONSTRAINT model_usage_operation_check CHECK (
    operation IN (
        'evidence', 'summary', 'embedding', 'query_embedding', 'answer',
        'evaluation', 'flashcards'
    )
);
