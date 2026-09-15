CREATE VIEW data.book_current_summaries AS
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
    summary.created_at
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

CREATE VIEW data.book_current_summary_citations AS
SELECT
    summary.id AS generated_summary_id,
    summary.owner_id,
    summary.book_id,
    citation.source_span_id,
    citation.citation_order,
    source_span.location
FROM data.book_current_summaries AS summary
JOIN data.generated_summary_citations AS citation
    ON citation.generated_summary_id = summary.id
    AND citation.owner_id = summary.owner_id
    AND citation.book_id = summary.book_id
    AND citation.source_document_id = summary.source_document_id
JOIN data.source_spans AS source_span
    ON source_span.id = citation.source_span_id
    AND source_span.source_document_id = summary.source_document_id;

GRANT SELECT ON data.book_current_summaries TO app_rw;
GRANT SELECT ON data.book_current_summary_citations TO app_rw;
