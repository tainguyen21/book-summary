CREATE VIEW data.book_processing_status AS
SELECT
    command.book_id,
    command.owner_id,
    command.id AS command_id,
    command.status AS command_status,
    run.status AS run_status,
    latest_event.event_type AS latest_event_type,
    latest_event.created_at AS latest_event_at
FROM app.processing_commands AS command
LEFT JOIN LATERAL (
    SELECT status
    FROM data.processing_runs
    WHERE command_id = command.id
    ORDER BY created_at DESC
    LIMIT 1
) AS run ON TRUE
LEFT JOIN LATERAL (
    SELECT event_type, created_at
    FROM data.processing_events
    WHERE command_id = command.id
    ORDER BY created_at DESC
    LIMIT 1
) AS latest_event ON TRUE;

GRANT SELECT ON data.book_processing_status TO app_rw;
