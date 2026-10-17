-- The library's daily budget card must show the same number the worker
-- pauses on: global spend since local midnight. The function returns only a
-- total, so granting it to the API role exposes no per-owner rows.
GRANT EXECUTE ON FUNCTION data.model_usage_spent_since(TIMESTAMPTZ) TO app_rw;
