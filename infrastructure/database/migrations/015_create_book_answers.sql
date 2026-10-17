-- Answer cache for "Ask a book". The API owns the app schema, so it writes
-- here directly. An entry is reused only for the same normalized question,
-- prompt version, and the book's current source document.
CREATE TABLE app.book_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
    question_key VARCHAR(500) NOT NULL,
    prompt_version VARCHAR(64) NOT NULL,
    source_document_id UUID NOT NULL,
    answered BOOLEAN NOT NULL,
    answer_text TEXT NOT NULL,
    sources JSONB NOT NULL CHECK (jsonb_typeof(sources) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_app_book_answers_key UNIQUE (
        book_id,
        question_key,
        prompt_version,
        source_document_id
    )
);

CREATE INDEX ix_app_book_answers_owner_id ON app.book_answers(owner_id);

GRANT SELECT, INSERT ON app.book_answers TO app_rw;
