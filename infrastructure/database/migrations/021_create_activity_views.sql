-- Activity page: the owner's processing runs and model spend. The API reads
-- these views and always filters by owner; error codes are the bounded,
-- non-sensitive codes the worker already records in event payloads.
CREATE VIEW data.book_processing_runs AS
SELECT
    run.id AS run_id,
    run.owner_id,
    run.book_id,
    command.command_type::text AS command_type,
    run.status::text AS status,
    run.started_at,
    run.completed_at,
    run.updated_at,
    latest_event.event_type AS latest_event_type,
    latest_event.created_at AS latest_event_at,
    failure.error_code
FROM data.processing_runs AS run
JOIN app.processing_commands AS command ON command.id = run.command_id
LEFT JOIN LATERAL (
    SELECT event_type, created_at
    FROM data.processing_events
    WHERE command_id = run.command_id
    ORDER BY created_at DESC
    LIMIT 1
) AS latest_event ON TRUE
LEFT JOIN LATERAL (
    SELECT payload ->> 'error_code' AS error_code
    FROM data.processing_events
    WHERE command_id = run.command_id
      AND event_type IN ('command_failed', 'budget_paused')
    ORDER BY created_at DESC
    LIMIT 1
) AS failure ON TRUE;

GRANT SELECT ON data.book_processing_runs TO app_rw;

CREATE VIEW data.app_model_usage AS
SELECT owner_id, book_id, operation, model, input_tokens, output_tokens,
       estimated_cost_usd, created_at
FROM data.model_usage;

GRANT SELECT ON data.app_model_usage TO app_rw;
