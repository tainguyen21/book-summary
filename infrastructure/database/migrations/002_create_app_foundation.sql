CREATE TYPE app.book_status AS ENUM (
    'pending_upload',
    'queued',
    'processing',
    'completed',
    'failed'
);

CREATE TYPE app.processing_command_status AS ENUM (
    'queued',
    'running',
    'completed',
    'retryable_failed',
    'permanent_failed',
    'needs_review'
);

CREATE TYPE app.processing_command_type AS ENUM (
    'ingest_book',
    'regenerate_summary',
    'reindex_book',
    'answer_question'
);

CREATE TABLE app.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oidc_subject VARCHAR(255) UNIQUE,
    email VARCHAR(320) NOT NULL UNIQUE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app.invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(320) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    accepted_subject VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app.books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    title VARCHAR(500),
    filename VARCHAR(500) NOT NULL,
    status app.book_status NOT NULL DEFAULT 'pending_upload',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_app_books_owner_id ON app.books(owner_id);

CREATE TABLE app.book_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
    object_type VARCHAR(50) NOT NULL,
    object_key VARCHAR(1024) NOT NULL UNIQUE,
    content_type VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    etag VARCHAR(255),
    sha256 VARCHAR(64),
    state VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_app_book_object_type UNIQUE (book_id, object_type)
);

CREATE INDEX ix_app_book_objects_owner_id ON app.book_objects(owner_id);
CREATE INDEX ix_app_book_objects_book_id ON app.book_objects(book_id);

CREATE TABLE app.processing_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
    command_type app.processing_command_type NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    processing_version VARCHAR(100) NOT NULL,
    status app.processing_command_status NOT NULL DEFAULT 'queued',
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    claimed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error_code VARCHAR(100),
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_app_processing_command_identity UNIQUE (
        command_type,
        book_id,
        processing_version
    )
);

CREATE INDEX ix_app_processing_commands_owner_id ON app.processing_commands(owner_id);
CREATE INDEX ix_app_processing_commands_status ON app.processing_commands(status);
