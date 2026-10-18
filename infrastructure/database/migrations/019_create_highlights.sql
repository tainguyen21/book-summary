-- Reader highlights on summary sentences, with optional notes. A highlight
-- belongs to one generated summary version; the sentence text is copied from
-- that summary so it stays readable after the book is summarized again.
CREATE TABLE app.highlights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
    summary_id UUID NOT NULL,
    paragraph_index INTEGER NOT NULL CHECK (paragraph_index >= 0),
    sentence_index INTEGER NOT NULL CHECK (sentence_index >= 0),
    sentence_text TEXT NOT NULL,
    note TEXT CHECK (note IS NULL OR char_length(note) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_app_highlights_sentence UNIQUE (
        book_id,
        summary_id,
        paragraph_index,
        sentence_index
    )
);

CREATE INDEX ix_app_highlights_owner_book ON app.highlights(owner_id, book_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.highlights TO app_rw;
