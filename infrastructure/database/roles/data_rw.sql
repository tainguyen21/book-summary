GRANT USAGE ON SCHEMA data TO data_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA data TO data_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA data TO data_rw;

GRANT USAGE ON SCHEMA app TO data_rw;
GRANT SELECT ON app.books, app.book_objects, app.processing_commands TO data_rw;

REVOKE UPDATE, DELETE ON data.source_documents, data.source_spans, data.structure_nodes
    FROM data_rw;

REVOKE UPDATE, DELETE ON
    data.generated_evidence,
    data.generation_validation_outcomes,
    data.generated_summary_citations,
    data.generated_evidence_citations,
    data.embedding_records
    FROM data_rw;

REVOKE INSERT ON
    data.generated_summary_citations,
    data.generated_evidence_citations
    FROM data_rw;

REVOKE UPDATE, DELETE ON data.generated_summaries FROM data_rw;
GRANT UPDATE (superseded_by_id) ON data.generated_summaries TO data_rw;
