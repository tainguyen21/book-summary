-- The supporting sentence chosen for each answer marker, in text order.
-- Answers cached before this column fall back to the evidence quote.
ALTER TABLE app.book_answers
    ADD COLUMN marker_quotes JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(marker_quotes) = 'array');

-- Answer cache for "Ask the library". An entry is reused only for the same
-- normalized question, prompt version, and library version (a hash of every
-- ready book's current source document), so any new, changed, or deleted
-- book makes earlier library answers stale.
CREATE TABLE app.library_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    question_key VARCHAR(500) NOT NULL,
    prompt_version VARCHAR(64) NOT NULL,
    library_version VARCHAR(64) NOT NULL,
    answered BOOLEAN NOT NULL,
    answer_text TEXT NOT NULL,
    sources JSONB NOT NULL CHECK (jsonb_typeof(sources) = 'array'),
    marker_quotes JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(marker_quotes) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_app_library_answers_key UNIQUE (
        owner_id,
        question_key,
        prompt_version,
        library_version
    )
);

GRANT SELECT, INSERT ON app.library_answers TO app_rw;
