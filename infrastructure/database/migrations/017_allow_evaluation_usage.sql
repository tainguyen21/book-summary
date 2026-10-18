-- On-demand answer evaluation (the judge's model calls) is recorded in the
-- usage ledger like any other API spend, so it counts toward the daily budget.
ALTER TABLE data.model_usage DROP CONSTRAINT model_usage_operation_check;
ALTER TABLE data.model_usage ADD CONSTRAINT model_usage_operation_check CHECK (
    operation IN (
        'evidence', 'summary', 'embedding', 'query_embedding', 'answer', 'evaluation'
    )
);
