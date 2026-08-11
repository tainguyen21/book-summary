CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS data;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
        CREATE ROLE app_rw NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'data_rw') THEN
        CREATE ROLE data_rw NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_admin') THEN
        CREATE ROLE migration_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END
$$;

GRANT USAGE, CREATE ON SCHEMA app, data TO migration_admin;

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
    oidc_subject VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(320) NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_app_users_normalized_email
    ON app.users (lower(email));

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

CREATE TYPE data.processing_run_status AS ENUM (
    'running',
    'completed',
    'retryable_failed',
    'permanent_failed',
    'needs_review'
);

CREATE TABLE data.processing_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
    command_id UUID NOT NULL REFERENCES app.processing_commands(id) ON DELETE CASCADE,
    processing_version VARCHAR(100) NOT NULL,
    status data.processing_run_status NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_data_processing_run_identity UNIQUE (
        command_id,
        processing_version
    )
);

CREATE INDEX ix_data_processing_runs_owner_id ON data.processing_runs(owner_id);
CREATE INDEX ix_data_processing_runs_book_id ON data.processing_runs(book_id);

CREATE TABLE data.processing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
    command_id UUID NOT NULL REFERENCES app.processing_commands(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    processing_version VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_data_processing_events_owner_id ON data.processing_events(owner_id);
CREATE INDEX ix_data_processing_events_book_id ON data.processing_events(book_id);
CREATE INDEX ix_data_processing_events_command_id ON data.processing_events(command_id);

CREATE TABLE data.generated_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
    source_node_id UUID,
    generation_version VARCHAR(100) NOT NULL,
    body TEXT NOT NULL,
    citation_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    validation_status VARCHAR(32) NOT NULL,
    input_hash VARCHAR(64) NOT NULL,
    output_hash VARCHAR(64) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    model VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    superseded_by_id UUID REFERENCES data.generated_summaries(id),
    CONSTRAINT uq_data_generated_summary_identity UNIQUE (
        book_id,
        source_node_id,
        generation_version,
        input_hash
    )
);

CREATE INDEX ix_data_generated_summaries_owner_id ON data.generated_summaries(owner_id);
CREATE INDEX ix_data_generated_summaries_book_id ON data.generated_summaries(book_id);
