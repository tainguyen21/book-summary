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
