-- Consolidate any legacy current rows before replacing the version-scoped
-- uniqueness rule. The newest immutable row remains current; older rows gain
-- only the permitted supersession link.
WITH ranked_current AS (
    SELECT
        id,
        first_value(id) OVER (
            PARTITION BY owner_id, book_id, source_document_id, source_node_id
            ORDER BY created_at DESC, id DESC
        ) AS replacement_id
    FROM data.generated_summaries
    WHERE validation_status = 'accepted'
        AND superseded_by_id IS NULL
)
UPDATE data.generated_summaries AS summary
SET superseded_by_id = ranked_current.replacement_id
FROM ranked_current
WHERE summary.id = ranked_current.id
    AND summary.id <> ranked_current.replacement_id;

DROP INDEX data.uq_data_generated_summaries_current_node;

ALTER TABLE data.generated_summaries
    ADD COLUMN current_summary_marker BOOLEAN
    GENERATED ALWAYS AS (
        CASE WHEN superseded_by_id IS NULL THEN TRUE ELSE NULL END
    ) STORED;

ALTER TABLE data.generated_summaries
    ADD CONSTRAINT uq_data_generated_summaries_current_node
    UNIQUE (
        owner_id,
        book_id,
        source_document_id,
        source_node_id,
        current_summary_marker
    )
    DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION data.validate_generated_summary_citations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    citation JSONB;
    span_id UUID;
BEGIN
    FOR citation IN SELECT * FROM jsonb_array_elements(NEW.citation_data)
    LOOP
        span_id := (citation ->> 'source_span_id')::UUID;
        IF NOT EXISTS (
            SELECT 1
            FROM data.source_spans AS span
            WHERE span.id = span_id
                AND span.source_document_id = NEW.source_document_id
        ) THEN
            RAISE EXCEPTION
                USING ERRCODE = '23503',
                    MESSAGE = 'generated summary citation must reference a source span from the same source document';
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM data.generated_evidence_citations AS evidence_citation
            JOIN data.generated_evidence AS evidence
                ON evidence.id = evidence_citation.generated_evidence_id
            WHERE evidence_citation.owner_id = NEW.owner_id
                AND evidence_citation.book_id = NEW.book_id
                AND evidence_citation.source_document_id = NEW.source_document_id
                AND evidence_citation.source_span_id = span_id
                AND evidence.validation_status = 'accepted'
        ) THEN
            RAISE EXCEPTION
                USING ERRCODE = '23503',
                    MESSAGE = 'accepted summary citation must correspond to accepted generated evidence';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;
