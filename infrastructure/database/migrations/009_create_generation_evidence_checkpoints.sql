-- Validated per-chunk evidence output, saved as soon as a chunk succeeds, so a
-- retried or paused summary run reuses paid-for chunks instead of re-calling
-- the model. Append-only; a prompt, provider, or model change uses a new key.
CREATE TABLE data.generation_evidence_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL,
    command_id UUID NOT NULL,
    source_document_id UUID NOT NULL,
    chunk_input_hash VARCHAR(64) NOT NULL CHECK (chunk_input_hash ~ '^[0-9a-f]{64}$'),
    provider VARCHAR(100) NOT NULL,
    model VARCHAR(255) NOT NULL,
    prompt_version VARCHAR(64) NOT NULL,
    evidence_output JSONB NOT NULL CHECK (jsonb_typeof(evidence_output) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_data_generation_evidence_checkpoints_source_document
        FOREIGN KEY (source_document_id, owner_id, book_id)
        REFERENCES data.source_documents (id, owner_id, book_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_data_generation_evidence_checkpoints_chunk UNIQUE (
        command_id,
        source_document_id,
        chunk_input_hash,
        provider,
        model,
        prompt_version
    )
);

CREATE INDEX ix_data_generation_evidence_checkpoints_owner_id
    ON data.generation_evidence_checkpoints(owner_id);

ALTER TABLE data.generation_evidence_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_generation_evidence_checkpoints_owner_policy
    ON data.generation_evidence_checkpoints
    FOR ALL
    TO data_rw
    USING (owner_id = data.current_owner_id())
    WITH CHECK (owner_id = data.current_owner_id());

GRANT SELECT, INSERT ON data.generation_evidence_checkpoints TO data_rw;
