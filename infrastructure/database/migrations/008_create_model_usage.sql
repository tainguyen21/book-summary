-- Append-only ledger of model provider calls and their estimated cost.
-- Rows deliberately have no foreign keys to books or commands: spend must stay
-- recorded (and count toward the daily budget) even after a book is deleted.
CREATE TABLE data.model_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL,
    command_id UUID NOT NULL,
    operation VARCHAR(32) NOT NULL CHECK (
        operation IN ('evidence', 'summary', 'embedding')
    ),
    provider VARCHAR(100) NOT NULL,
    model VARCHAR(255) NOT NULL,
    input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
    estimated_cost_usd NUMERIC(12, 6) NOT NULL CHECK (estimated_cost_usd >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX ix_data_model_usage_created_at
    ON data.model_usage(created_at);
CREATE INDEX ix_data_model_usage_owner_created_at
    ON data.model_usage(owner_id, created_at);

ALTER TABLE data.model_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_model_usage_owner_policy
    ON data.model_usage
    FOR ALL
    TO data_rw
    USING (owner_id = data.current_owner_id())
    WITH CHECK (owner_id = data.current_owner_id());

GRANT SELECT, INSERT ON data.model_usage TO data_rw;

-- Global spend across all owners for the worker's daily budget. It returns
-- only the total, so callers never see other owners' rows.
CREATE FUNCTION data.model_usage_spent_since(since TIMESTAMPTZ)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, data
AS $$
    SELECT COALESCE(SUM(estimated_cost_usd), 0)
    FROM data.model_usage
    WHERE created_at >= since;
$$;

REVOKE ALL ON FUNCTION data.model_usage_spent_since(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION data.model_usage_spent_since(TIMESTAMPTZ) TO data_rw;

-- Per-owner daily totals (UTC days) for the API; queries filter by owner.
CREATE VIEW data.book_model_usage_daily AS
SELECT
    owner_id,
    (created_at AT TIME ZONE 'UTC')::DATE AS usage_day,
    COUNT(*) AS call_count,
    SUM(input_tokens)::BIGINT AS input_tokens,
    SUM(output_tokens)::BIGINT AS output_tokens,
    SUM(estimated_cost_usd) AS estimated_cost_usd
FROM data.model_usage
GROUP BY owner_id, (created_at AT TIME ZONE 'UTC')::DATE;

GRANT SELECT ON data.book_model_usage_daily TO app_rw;
