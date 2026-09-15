CREATE VIEW data.book_source_document_claim_state AS
SELECT
    owner_id,
    book_id,
    count(*) AS source_document_count,
    (array_agg(id ORDER BY id))[1] AS source_document_id
FROM data.source_documents
GROUP BY owner_id, book_id;

GRANT SELECT ON data.book_source_document_claim_state TO data_rw;
