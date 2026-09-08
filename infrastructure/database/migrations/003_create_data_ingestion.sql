ALTER TABLE app.books
    ADD CONSTRAINT uq_app_books_owner_id_id UNIQUE (owner_id, id);

ALTER TABLE app.book_objects
    ADD CONSTRAINT uq_app_book_objects_owner_book_id_id
    UNIQUE (owner_id, book_id, id);

CREATE TABLE data.source_documents (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL,
    source_object_id UUID NOT NULL,
    source_location VARCHAR(1024) NOT NULL,
    source_content_hash VARCHAR(64) NOT NULL CHECK (
        source_content_hash ~ '^[0-9a-f]{64}$'
    ),
    source_format VARCHAR(16) NOT NULL CHECK (
        source_format IN ('pdf', 'epub', 'docx', 'txt')
    ),
    parser_version VARCHAR(100) NOT NULL,
    artifact_object_key VARCHAR(1024) NOT NULL,
    artifact_content_hash VARCHAR(64) NOT NULL CHECK (
        artifact_content_hash ~ '^[0-9a-f]{64}$'
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_data_source_document_book_owner
        FOREIGN KEY (owner_id, book_id)
        REFERENCES app.books (owner_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_data_source_document_original_object
        FOREIGN KEY (owner_id, book_id, source_object_id)
        REFERENCES app.book_objects (owner_id, book_id, id)
        ON DELETE CASCADE,
    CONSTRAINT uq_data_source_document_identity UNIQUE (
        book_id,
        source_content_hash,
        parser_version
    )
);

CREATE INDEX ix_data_source_documents_owner_id
    ON data.source_documents(owner_id);
CREATE INDEX ix_data_source_documents_book_id
    ON data.source_documents(book_id);

CREATE TABLE data.source_spans (
    id UUID PRIMARY KEY,
    source_document_id UUID NOT NULL REFERENCES data.source_documents(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
    content TEXT NOT NULL CHECK (btrim(content) <> ''),
    content_hash VARCHAR(64) NOT NULL CHECK (
        content_hash ~ '^[0-9a-f]{64}$'
    ),
    location JSONB NOT NULL CHECK (jsonb_typeof(location) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_data_source_span_sequence UNIQUE (
        source_document_id,
        sequence_number
    )
);

CREATE INDEX ix_data_source_spans_document_id
    ON data.source_spans(source_document_id);

CREATE TABLE data.structure_nodes (
    id UUID PRIMARY KEY,
    source_document_id UUID NOT NULL REFERENCES data.source_documents(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL CHECK (sequence_number >= 0),
    parent_sequence_number INTEGER CHECK (parent_sequence_number >= 0),
    node_type VARCHAR(64) NOT NULL,
    title TEXT,
    source_span_start_sequence INTEGER CHECK (source_span_start_sequence >= 1),
    source_span_end_sequence INTEGER CHECK (source_span_end_sequence >= 1),
    location JSONB NOT NULL CHECK (jsonb_typeof(location) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_data_structure_node_parent_order CHECK (
        parent_sequence_number IS NULL
        OR parent_sequence_number < sequence_number
    ),
    CONSTRAINT ck_data_structure_node_span_pair CHECK (
        (source_span_start_sequence IS NULL)
        = (source_span_end_sequence IS NULL)
    ),
    CONSTRAINT ck_data_structure_node_span_range CHECK (
        source_span_start_sequence IS NULL
        OR source_span_start_sequence <= source_span_end_sequence
    ),
    CONSTRAINT uq_data_structure_node_sequence UNIQUE (
        source_document_id,
        sequence_number
    )
);

CREATE INDEX ix_data_structure_nodes_document_id
    ON data.structure_nodes(source_document_id);

CREATE FUNCTION data.current_owner_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('bookwise.owner_id', true), '')::UUID;
$$;

CREATE FUNCTION data.validate_source_document_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM app.book_objects AS object
        WHERE object.id = NEW.source_object_id
            AND object.owner_id = NEW.owner_id
            AND object.book_id = NEW.book_id
            AND object.object_type = 'original'
            AND object.object_key = NEW.source_location
    ) THEN
        RAISE EXCEPTION
            USING ERRCODE = '23503',
                MESSAGE = 'source document must reference its owner book original object';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_data_source_document_provenance
    BEFORE INSERT OR UPDATE ON data.source_documents
    FOR EACH ROW
    EXECUTE FUNCTION data.validate_source_document_provenance();

CREATE FUNCTION data.validate_structure_node_references()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.parent_sequence_number IS NOT NULL
        AND NOT EXISTS (
            SELECT 1
            FROM data.structure_nodes AS parent
            WHERE parent.source_document_id = NEW.source_document_id
                AND parent.sequence_number = NEW.parent_sequence_number
        ) THEN
        RAISE EXCEPTION
            USING ERRCODE = '23503',
                MESSAGE = 'structure node parent must exist in the same source document';
    END IF;

    IF NEW.source_span_start_sequence IS NOT NULL
        AND NOT EXISTS (
            SELECT 1
            FROM data.source_spans AS span
            WHERE span.source_document_id = NEW.source_document_id
                AND span.sequence_number = NEW.source_span_start_sequence
        ) THEN
        RAISE EXCEPTION
            USING ERRCODE = '23503',
                MESSAGE = 'structure node start span must exist in the same source document';
    END IF;

    IF NEW.source_span_end_sequence IS NOT NULL
        AND NOT EXISTS (
            SELECT 1
            FROM data.source_spans AS span
            WHERE span.source_document_id = NEW.source_document_id
                AND span.sequence_number = NEW.source_span_end_sequence
        ) THEN
        RAISE EXCEPTION
            USING ERRCODE = '23503',
                MESSAGE = 'structure node end span must exist in the same source document';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_data_structure_node_references
    AFTER INSERT OR UPDATE ON data.structure_nodes
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION data.validate_structure_node_references();

ALTER TABLE data.source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE data.source_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE data.structure_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_source_documents_owner_policy
    ON data.source_documents
    FOR ALL
    TO data_rw
    USING (owner_id = data.current_owner_id())
    WITH CHECK (owner_id = data.current_owner_id());

CREATE POLICY data_source_spans_owner_policy
    ON data.source_spans
    FOR ALL
    TO data_rw
    USING (
        EXISTS (
            SELECT 1
            FROM data.source_documents AS document
            WHERE document.id = source_document_id
                AND document.owner_id = data.current_owner_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM data.source_documents AS document
            WHERE document.id = source_document_id
                AND document.owner_id = data.current_owner_id()
        )
    );

CREATE POLICY data_structure_nodes_owner_policy
    ON data.structure_nodes
    FOR ALL
    TO data_rw
    USING (
        EXISTS (
            SELECT 1
            FROM data.source_documents AS document
            WHERE document.id = source_document_id
                AND document.owner_id = data.current_owner_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM data.source_documents AS document
            WHERE document.id = source_document_id
                AND document.owner_id = data.current_owner_id()
        )
    );

GRANT SELECT, INSERT ON data.source_documents, data.source_spans, data.structure_nodes
    TO data_rw;
