-- Sentence-level citations for accepted summaries: paragraphs -> sentences ->
-- citations, each citation with its source span and an optional verbatim
-- quote. Older summaries keep an empty array.
ALTER TABLE data.generated_summaries
    ADD COLUMN segments JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(segments) = 'array');

-- Same immutability rule as migration 004, now also freezing segments.
CREATE OR REPLACE FUNCTION data.validate_generated_summary_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM app.books AS book
            WHERE book.id = OLD.book_id
                AND book.owner_id = OLD.owner_id
        ) THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION
            USING ERRCODE = '42501',
                MESSAGE = 'generated summary rows are immutable';
    END IF;

    IF OLD.owner_id = NEW.owner_id
        AND OLD.book_id = NEW.book_id
        AND OLD.source_document_id = NEW.source_document_id
        AND OLD.source_node_id = NEW.source_node_id
        AND OLD.generation_version = NEW.generation_version
        AND OLD.body = NEW.body
        AND OLD.citation_data = NEW.citation_data
        AND OLD.segments = NEW.segments
        AND OLD.validation_status = NEW.validation_status
        AND OLD.input_hash = NEW.input_hash
        AND OLD.output_hash = NEW.output_hash
        AND OLD.provider = NEW.provider
        AND OLD.model = NEW.model
        AND OLD.created_at = NEW.created_at
        AND OLD.superseded_by_id IS NULL
        AND NEW.superseded_by_id IS NOT NULL
        AND NEW.superseded_by_id <> OLD.id
        AND EXISTS (
            SELECT 1
            FROM data.generated_summaries AS replacement
            WHERE replacement.id = NEW.superseded_by_id
                AND replacement.owner_id = OLD.owner_id
                AND replacement.book_id = OLD.book_id
                AND replacement.source_document_id = OLD.source_document_id
                AND replacement.source_node_id = OLD.source_node_id
                AND replacement.validation_status = 'accepted'
        ) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION
        USING ERRCODE = '42501',
            MESSAGE = 'generated summary rows are immutable except supersession links';
END;
$$;

-- Same projection as migration 006 with segments appended.
CREATE OR REPLACE VIEW data.book_current_summaries AS
SELECT
    summary.id,
    summary.owner_id,
    summary.book_id,
    summary.source_document_id,
    summary.source_node_id,
    summary.body,
    summary.generation_version,
    summary.provider,
    summary.model,
    summary.created_at,
    summary.segments
FROM data.generated_summaries AS summary
JOIN LATERAL (
    SELECT id
    FROM data.structure_nodes
    WHERE source_document_id = summary.source_document_id
    ORDER BY sequence_number
    LIMIT 1
) AS root_node
    ON root_node.id = summary.source_node_id
WHERE summary.validation_status = 'accepted'
    AND summary.superseded_by_id IS NULL;
