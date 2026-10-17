-- An owner's request to retry a permanently failed command. The API (app
-- schema owner) records the request; the Python worker, which owns
-- data.processing_runs, reopens the run when a request is newer than the
-- run's last update. Reopening the run consumes the request.
CREATE TABLE app.processing_retry_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES app.books(id) ON DELETE CASCADE,
    command_id UUID NOT NULL REFERENCES app.processing_commands(id) ON DELETE CASCADE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX ix_app_processing_retry_requests_command
    ON app.processing_retry_requests(command_id, requested_at);
CREATE INDEX ix_app_processing_retry_requests_owner_id
    ON app.processing_retry_requests(owner_id);

GRANT SELECT, INSERT ON app.processing_retry_requests TO app_rw;
GRANT SELECT ON app.processing_retry_requests TO data_rw;
