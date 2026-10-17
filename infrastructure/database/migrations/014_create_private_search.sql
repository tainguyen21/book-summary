-- Private search: interactive API model calls are recorded in the shared
-- usage ledger (they have no book or command), and the API reads searchable
-- evidence and passages through owner-filtered views.
ALTER TABLE data.model_usage ALTER COLUMN book_id DROP NOT NULL;
ALTER TABLE data.model_usage ALTER COLUMN command_id DROP NOT NULL;
ALTER TABLE data.model_usage DROP CONSTRAINT model_usage_operation_check;
ALTER TABLE data.model_usage ADD CONSTRAINT model_usage_operation_check CHECK (
    operation IN ('evidence', 'summary', 'embedding', 'query_embedding', 'answer')
);

-- The only way the API writes to the Python-owned data schema: one usage row.
CREATE FUNCTION data.record_app_model_usage(
    p_owner_id UUID,
    p_book_id UUID,
    p_operation VARCHAR,
    p_provider VARCHAR,
    p_model VARCHAR,
    p_input_tokens INTEGER,
    p_output_tokens INTEGER,
    p_estimated_cost_usd NUMERIC
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, data
AS $$
    INSERT INTO data.model_usage (
        owner_id, book_id, command_id, operation, provider, model,
        input_tokens, output_tokens, estimated_cost_usd
    )
    VALUES (
        p_owner_id, p_book_id, NULL, p_operation, p_provider, p_model,
        p_input_tokens, p_output_tokens, p_estimated_cost_usd
    );
$$;

REVOKE ALL ON FUNCTION data.record_app_model_usage(
    UUID, UUID, VARCHAR, VARCHAR, VARCHAR, INTEGER, INTEGER, NUMERIC
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION data.record_app_model_usage(
    UUID, UUID, VARCHAR, VARCHAR, VARCHAR, INTEGER, INTEGER, NUMERIC
) TO app_rw;

-- Evidence behind each book's current summary, with its first cited span,
-- verified quote, and embedding. The API filters by owner.
CREATE VIEW data.book_search_evidence AS
SELECT
    evidence.owner_id,
    evidence.book_id,
    evidence.id AS evidence_id,
    evidence.statement,
    (evidence.citation_data -> 0 ->> 'source_span_id')::UUID AS source_span_id,
    evidence.citation_data -> 0 ->> 'source_excerpt' AS quote,
    span.location,
    embedding.embedding::vector(768) AS embedding
FROM data.generated_evidence AS evidence
JOIN data.book_current_summaries AS summary
    ON summary.owner_id = evidence.owner_id
    AND summary.book_id = evidence.book_id
    AND summary.source_document_id = evidence.source_document_id
    AND summary.generation_version = evidence.generation_version
JOIN data.source_spans AS span
    ON span.id = (evidence.citation_data -> 0 ->> 'source_span_id')::UUID
LEFT JOIN data.embedding_records AS embedding
    ON embedding.target_type = 'evidence'
    AND embedding.target_id = evidence.id
    AND embedding.dimensions = 768;

GRANT SELECT ON data.book_search_evidence TO app_rw;

CREATE INDEX ix_data_source_spans_content_fts
    ON data.source_spans USING GIN (to_tsvector('simple', content));
CREATE INDEX ix_data_generated_evidence_statement_fts
    ON data.generated_evidence USING GIN (to_tsvector('simple', statement));
CREATE INDEX ix_data_embedding_records_768_cosine
    ON data.embedding_records
    USING hnsw ((embedding::vector(768)) vector_cosine_ops)
    WHERE dimensions = 768;
