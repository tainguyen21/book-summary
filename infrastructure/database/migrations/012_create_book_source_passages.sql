-- Source passages for the citation viewer. The API filters by owner and book,
-- like the summary projections in migration 006; the owner reads text from
-- their own book only.
CREATE VIEW data.book_source_passages AS
SELECT
    span.id AS source_span_id,
    document.owner_id,
    document.book_id,
    span.source_document_id,
    span.sequence_number,
    span.content,
    span.location
FROM data.source_spans AS span
JOIN data.source_documents AS document
    ON document.id = span.source_document_id;

GRANT SELECT ON data.book_source_passages TO app_rw;
