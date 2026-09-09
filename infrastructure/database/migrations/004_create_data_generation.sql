DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM data.generated_summaries) THEN
        RAISE EXCEPTION
            USING ERRCODE = '55000',
                MESSAGE = '004_create_data_generation requires empty data.generated_summaries',
                DETAIL = 'Legacy generated summaries cannot be backfilled with immutable source provenance automatically.';
    END IF;
END;
$$;

ALTER TABLE data.source_documents
    ADD CONSTRAINT uq_data_source_documents_id_owner_book
    UNIQUE (id, owner_id, book_id);

ALTER TABLE data.source_spans
    ADD CONSTRAINT uq_data_source_spans_document_id_id
    UNIQUE (source_document_id, id);

ALTER TABLE data.structure_nodes
    ADD CONSTRAINT uq_data_structure_nodes_document_id_id
    UNIQUE (source_document_id, id);

ALTER TABLE data.generated_summaries
    ADD COLUMN source_document_id UUID,
    ADD CONSTRAINT fk_data_generated_summaries_source_document_owner_book
        FOREIGN KEY (source_document_id, owner_id, book_id)
        REFERENCES data.source_documents (id, owner_id, book_id)
        ON DELETE CASCADE,
    ADD CONSTRAINT fk_data_generated_summaries_source_node
        FOREIGN KEY (source_document_id, source_node_id)
        REFERENCES data.structure_nodes (source_document_id, id)
        ON DELETE CASCADE,
    ADD CONSTRAINT ck_data_generated_summaries_hashes CHECK (
        input_hash ~ '^[0-9a-f]{64}$'
        AND output_hash ~ '^[0-9a-f]{64}$'
    ),
    ADD CONSTRAINT ck_data_generated_summaries_validation_status CHECK (
        validation_status IN ('accepted', 'rejected', 'ambiguous')
    ),
    ADD CONSTRAINT ck_data_generated_summaries_accepted CHECK (
        validation_status = 'accepted'
    ),
    ADD CONSTRAINT ck_data_generated_summaries_citation_array CHECK (
        jsonb_typeof(citation_data) = 'array'
        AND jsonb_array_length(citation_data) > 0
    );

ALTER TABLE data.generated_summaries
    ALTER COLUMN source_document_id SET NOT NULL,
    ALTER COLUMN source_node_id SET NOT NULL;

CREATE TABLE data.generated_evidence (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL,
    source_document_id UUID NOT NULL,
    source_node_id UUID NOT NULL,
    generation_version VARCHAR(100) NOT NULL,
    evidence_type VARCHAR(64) NOT NULL CHECK (
        evidence_type IN (
            'main_claim',
            'supporting_argument',
            'definition',
            'concept',
            'procedure',
            'example',
            'data_point',
            'limitation',
            'counterargument',
            'conclusion'
        )
    ),
    statement TEXT NOT NULL CHECK (btrim(statement) <> ''),
    citation_data JSONB NOT NULL CHECK (
        jsonb_typeof(citation_data) = 'array'
        AND jsonb_array_length(citation_data) > 0
    ),
    validation_status VARCHAR(32) NOT NULL CHECK (validation_status = 'accepted'),
    input_hash VARCHAR(64) NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
    output_hash VARCHAR(64) NOT NULL CHECK (output_hash ~ '^[0-9a-f]{64}$'),
    provider VARCHAR(100) NOT NULL,
    model VARCHAR(255) NOT NULL,
    confidence NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_data_generated_evidence_source_document_owner_book
        FOREIGN KEY (source_document_id, owner_id, book_id)
        REFERENCES data.source_documents (id, owner_id, book_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_data_generated_evidence_source_node
        FOREIGN KEY (source_document_id, source_node_id)
        REFERENCES data.structure_nodes (source_document_id, id)
        ON DELETE CASCADE,
    CONSTRAINT uq_data_generated_evidence_identity UNIQUE (
        source_node_id,
        generation_version,
        input_hash,
        output_hash
    )
);

CREATE INDEX ix_data_generated_evidence_owner_id
    ON data.generated_evidence(owner_id);
CREATE INDEX ix_data_generated_evidence_book_id
    ON data.generated_evidence(book_id);
CREATE INDEX ix_data_generated_evidence_source_node_id
    ON data.generated_evidence(source_node_id);

CREATE TABLE data.generation_validation_outcomes (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL,
    source_document_id UUID,
    source_node_id UUID,
    source_chunk_sequence_number INTEGER CHECK (
        source_chunk_sequence_number >= 1
    ),
    generation_version VARCHAR(100) NOT NULL,
    stage VARCHAR(100) NOT NULL,
    validation_status VARCHAR(32) NOT NULL CHECK (
        validation_status IN ('rejected', 'ambiguous')
    ),
    reason_code VARCHAR(100) NOT NULL,
    input_hash VARCHAR(64) CHECK (input_hash ~ '^[0-9a-f]{64}$'),
    output_hash VARCHAR(64) CHECK (output_hash ~ '^[0-9a-f]{64}$'),
    provider VARCHAR(100),
    model VARCHAR(255),
    details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(details) = 'object'
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_data_generation_validation_outcomes_book_owner
        FOREIGN KEY (owner_id, book_id)
        REFERENCES app.books (owner_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_data_generation_validation_outcomes_source_document_owner_book
        FOREIGN KEY (source_document_id, owner_id, book_id)
        REFERENCES data.source_documents (id, owner_id, book_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_data_generation_validation_outcomes_source_node
        FOREIGN KEY (source_document_id, source_node_id)
        REFERENCES data.structure_nodes (source_document_id, id)
        ON DELETE CASCADE,
    CONSTRAINT ck_data_generation_validation_outcomes_source_pair CHECK (
        source_node_id IS NULL
        OR source_document_id IS NOT NULL
    ),
    CONSTRAINT ck_data_generation_validation_outcomes_chunk_scope CHECK (
        source_chunk_sequence_number IS NULL
        OR source_node_id IS NOT NULL
    )
);

CREATE INDEX ix_data_generation_validation_outcomes_owner_id
    ON data.generation_validation_outcomes(owner_id);
CREATE INDEX ix_data_generation_validation_outcomes_book_id
    ON data.generation_validation_outcomes(book_id);

CREATE TABLE data.generated_summary_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL,
    generated_summary_id UUID NOT NULL,
    source_document_id UUID NOT NULL,
    source_span_id UUID NOT NULL,
    citation_order INTEGER NOT NULL CHECK (citation_order >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_data_generated_summary_citations_summary
        FOREIGN KEY (generated_summary_id)
        REFERENCES data.generated_summaries(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_data_generated_summary_citations_source_span
        FOREIGN KEY (source_document_id, source_span_id)
        REFERENCES data.source_spans(source_document_id, id)
        ON DELETE CASCADE,
    CONSTRAINT uq_data_generated_summary_citation_order UNIQUE (
        generated_summary_id,
        citation_order
    )
);

CREATE TABLE data.generated_evidence_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL,
    generated_evidence_id UUID NOT NULL,
    source_document_id UUID NOT NULL,
    source_span_id UUID NOT NULL,
    citation_order INTEGER NOT NULL CHECK (citation_order >= 1),
    source_excerpt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_data_generated_evidence_citations_evidence
        FOREIGN KEY (generated_evidence_id)
        REFERENCES data.generated_evidence(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_data_generated_evidence_citations_source_span
        FOREIGN KEY (source_document_id, source_span_id)
        REFERENCES data.source_spans(source_document_id, id)
        ON DELETE CASCADE,
    CONSTRAINT uq_data_generated_evidence_citation_order UNIQUE (
        generated_evidence_id,
        citation_order
    )
);

CREATE TABLE data.embedding_records (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL,
    source_document_id UUID NOT NULL,
    target_type VARCHAR(64) NOT NULL CHECK (
        target_type IN ('evidence', 'generated_summary')
    ),
    target_id UUID NOT NULL,
    embedding_version VARCHAR(100) NOT NULL,
    input_hash VARCHAR(64) NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
    provider VARCHAR(100) NOT NULL,
    model VARCHAR(255) NOT NULL,
    dimensions INTEGER NOT NULL CHECK (dimensions > 0),
    embedding vector NOT NULL CHECK (vector_dims(embedding) = dimensions),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_data_embedding_records_source_document_owner_book
        FOREIGN KEY (source_document_id, owner_id, book_id)
        REFERENCES data.source_documents (id, owner_id, book_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_data_embedding_records_identity UNIQUE (
        target_type,
        target_id,
        embedding_version,
        provider,
        model
    )
);

CREATE INDEX ix_data_embedding_records_owner_id
    ON data.embedding_records(owner_id);
CREATE INDEX ix_data_embedding_records_book_id
    ON data.embedding_records(book_id);

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

CREATE FUNCTION data.reject_generated_row_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE'
        AND NOT EXISTS (
            SELECT 1
            FROM app.books AS book
            WHERE book.id = OLD.book_id
                AND book.owner_id = OLD.owner_id
        ) THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        USING ERRCODE = '42501',
            MESSAGE = 'generated data rows are immutable';
END;
$$;

CREATE FUNCTION data.validate_generated_summary_mutation()
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

CREATE TRIGGER trg_data_generated_summaries_immutable
    BEFORE UPDATE OR DELETE ON data.generated_summaries
    FOR EACH ROW
    EXECUTE FUNCTION data.validate_generated_summary_mutation();

CREATE TRIGGER trg_data_generated_evidence_immutable
    BEFORE UPDATE OR DELETE ON data.generated_evidence
    FOR EACH ROW
    EXECUTE FUNCTION data.reject_generated_row_mutation();

CREATE TRIGGER trg_data_generation_validation_outcomes_immutable
    BEFORE UPDATE OR DELETE ON data.generation_validation_outcomes
    FOR EACH ROW
    EXECUTE FUNCTION data.reject_generated_row_mutation();

CREATE TRIGGER trg_data_generated_summary_citations_immutable
    BEFORE UPDATE OR DELETE ON data.generated_summary_citations
    FOR EACH ROW
    EXECUTE FUNCTION data.reject_generated_row_mutation();

CREATE TRIGGER trg_data_generated_evidence_citations_immutable
    BEFORE UPDATE OR DELETE ON data.generated_evidence_citations
    FOR EACH ROW
    EXECUTE FUNCTION data.reject_generated_row_mutation();

CREATE TRIGGER trg_data_embedding_records_immutable
    BEFORE UPDATE OR DELETE ON data.embedding_records
    FOR EACH ROW
    EXECUTE FUNCTION data.reject_generated_row_mutation();

CREATE FUNCTION data.validate_generated_summary_citations()
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

CREATE FUNCTION data.validate_generated_evidence_citations()
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
                    MESSAGE = 'generated evidence citation must reference a source span from the same source document';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_data_generated_summary_citation_json
    BEFORE INSERT OR UPDATE ON data.generated_summaries
    FOR EACH ROW
    EXECUTE FUNCTION data.validate_generated_summary_citations();

CREATE TRIGGER trg_data_generated_evidence_citation_json
    BEFORE INSERT OR UPDATE ON data.generated_evidence
    FOR EACH ROW
    EXECUTE FUNCTION data.validate_generated_evidence_citations();

CREATE FUNCTION data.sync_generated_summary_citations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, data
AS $$
DECLARE
    citation JSONB;
    span_id UUID;
    order_number INTEGER := 1;
BEGIN
    FOR citation IN SELECT * FROM jsonb_array_elements(NEW.citation_data)
    LOOP
        span_id := (citation ->> 'source_span_id')::UUID;
        INSERT INTO data.generated_summary_citations (
            owner_id,
            book_id,
            generated_summary_id,
            source_document_id,
            source_span_id,
            citation_order
        )
        VALUES (
            NEW.owner_id,
            NEW.book_id,
            NEW.id,
            NEW.source_document_id,
            span_id,
            order_number
        )
        ON CONFLICT (generated_summary_id, citation_order) DO NOTHING;
        order_number := order_number + 1;
    END LOOP;

    RETURN NULL;
END;
$$;

CREATE FUNCTION data.sync_generated_evidence_citations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, data
AS $$
DECLARE
    citation JSONB;
    span_id UUID;
    order_number INTEGER := 1;
BEGIN
    FOR citation IN SELECT * FROM jsonb_array_elements(NEW.citation_data)
    LOOP
        span_id := (citation ->> 'source_span_id')::UUID;
        INSERT INTO data.generated_evidence_citations (
            owner_id,
            book_id,
            generated_evidence_id,
            source_document_id,
            source_span_id,
            citation_order,
            source_excerpt
        )
        VALUES (
            NEW.owner_id,
            NEW.book_id,
            NEW.id,
            NEW.source_document_id,
            span_id,
            order_number,
            citation ->> 'source_excerpt'
        )
        ON CONFLICT (generated_evidence_id, citation_order) DO NOTHING;
        order_number := order_number + 1;
    END LOOP;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_data_generated_summary_sync_citations
    AFTER INSERT ON data.generated_summaries
    FOR EACH ROW
    EXECUTE FUNCTION data.sync_generated_summary_citations();

CREATE TRIGGER trg_data_generated_evidence_sync_citations
    AFTER INSERT ON data.generated_evidence
    FOR EACH ROW
    EXECUTE FUNCTION data.sync_generated_evidence_citations();

CREATE FUNCTION data.reject_direct_generated_citation_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION
            USING ERRCODE = '42501',
                MESSAGE = 'generated citation projections are created only from immutable parent citation data';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_data_generated_summary_citation_direct_insert
    BEFORE INSERT ON data.generated_summary_citations
    FOR EACH ROW
    EXECUTE FUNCTION data.reject_direct_generated_citation_insert();

CREATE TRIGGER trg_data_generated_evidence_citation_direct_insert
    BEFORE INSERT ON data.generated_evidence_citations
    FOR EACH ROW
    EXECUTE FUNCTION data.reject_direct_generated_citation_insert();

CREATE FUNCTION data.validate_generated_summary_citation_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM data.generated_summaries AS summary
        WHERE summary.id = NEW.generated_summary_id
            AND summary.owner_id = NEW.owner_id
            AND summary.book_id = NEW.book_id
            AND summary.source_document_id = NEW.source_document_id
    ) THEN
        RAISE EXCEPTION
            USING ERRCODE = '23503',
                MESSAGE = 'summary citation provenance must match its generated summary';
    END IF;

    RETURN NEW;
END;
$$;

CREATE FUNCTION data.validate_generated_evidence_citation_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM data.generated_evidence AS evidence
        WHERE evidence.id = NEW.generated_evidence_id
            AND evidence.owner_id = NEW.owner_id
            AND evidence.book_id = NEW.book_id
            AND evidence.source_document_id = NEW.source_document_id
    ) THEN
        RAISE EXCEPTION
            USING ERRCODE = '23503',
                MESSAGE = 'evidence citation provenance must match its generated evidence';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_data_generated_summary_citation_row_provenance
    BEFORE INSERT OR UPDATE ON data.generated_summary_citations
    FOR EACH ROW
    EXECUTE FUNCTION data.validate_generated_summary_citation_row();

CREATE TRIGGER trg_data_generated_evidence_citation_row_provenance
    BEFORE INSERT OR UPDATE ON data.generated_evidence_citations
    FOR EACH ROW
    EXECUTE FUNCTION data.validate_generated_evidence_citation_row();

CREATE FUNCTION data.validate_embedding_target()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.target_type = 'evidence' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM data.generated_evidence AS evidence
            WHERE evidence.id = NEW.target_id
                AND evidence.owner_id = NEW.owner_id
                AND evidence.book_id = NEW.book_id
                AND evidence.source_document_id = NEW.source_document_id
        ) THEN
            RAISE EXCEPTION
                USING ERRCODE = '23503',
                    MESSAGE = 'evidence embedding target must match owner, book, and source document';
        END IF;
    ELSIF NEW.target_type = 'generated_summary' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM data.generated_summaries AS summary
            WHERE summary.id = NEW.target_id
                AND summary.owner_id = NEW.owner_id
                AND summary.book_id = NEW.book_id
                AND summary.source_document_id = NEW.source_document_id
        ) THEN
            RAISE EXCEPTION
                USING ERRCODE = '23503',
                    MESSAGE = 'summary embedding target must match owner, book, and source document';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_data_embedding_records_target
    BEFORE INSERT OR UPDATE ON data.embedding_records
    FOR EACH ROW
    EXECUTE FUNCTION data.validate_embedding_target();

ALTER TABLE data.generated_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE data.generated_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE data.generation_validation_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE data.generated_summary_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE data.generated_evidence_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE data.embedding_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_generated_summaries_owner_policy
    ON data.generated_summaries
    FOR ALL
    TO data_rw
    USING (owner_id = data.current_owner_id())
    WITH CHECK (owner_id = data.current_owner_id());

CREATE POLICY data_generated_evidence_owner_policy
    ON data.generated_evidence
    FOR ALL
    TO data_rw
    USING (owner_id = data.current_owner_id())
    WITH CHECK (owner_id = data.current_owner_id());

CREATE POLICY data_generation_validation_outcomes_owner_policy
    ON data.generation_validation_outcomes
    FOR ALL
    TO data_rw
    USING (owner_id = data.current_owner_id())
    WITH CHECK (owner_id = data.current_owner_id());

CREATE POLICY data_generated_summary_citations_owner_policy
    ON data.generated_summary_citations
    FOR ALL
    TO data_rw
    USING (owner_id = data.current_owner_id())
    WITH CHECK (owner_id = data.current_owner_id());

CREATE POLICY data_generated_evidence_citations_owner_policy
    ON data.generated_evidence_citations
    FOR ALL
    TO data_rw
    USING (owner_id = data.current_owner_id())
    WITH CHECK (owner_id = data.current_owner_id());

CREATE POLICY data_embedding_records_owner_policy
    ON data.embedding_records
    FOR ALL
    TO data_rw
    USING (owner_id = data.current_owner_id())
    WITH CHECK (owner_id = data.current_owner_id());

GRANT SELECT, INSERT ON
    data.generated_summaries,
    data.generated_evidence,
    data.generation_validation_outcomes,
    data.embedding_records
    TO data_rw;

GRANT SELECT ON
    data.generated_summary_citations,
    data.generated_evidence_citations
    TO data_rw;

GRANT UPDATE (superseded_by_id) ON data.generated_summaries TO data_rw;
