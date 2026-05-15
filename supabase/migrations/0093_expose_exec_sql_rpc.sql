-- Admin SQL exec RPC for agent-driven migrations + ad-hoc DDL/queries.
-- Service-role only. PostgREST blocks anon/authenticated automatically because
-- only service_role gets EXECUTE.
--
-- Usage (from any agent w/ service-role JWT):
--   POST /rest/v1/rpc/exec_sql
--   Body: {"query": "<sql>"}
--   - SELECT/WITH: returns jsonb array of rows
--   - DDL/DML: returns {"status":"ok","message":"..."}
--   - SQL error: returns {"status":"error","message":SQLERRM,"sqlstate":SQLSTATE}

CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    result jsonb;
BEGIN
    -- Defense in depth: block obvious nukes. Not a full sandbox — auth model
    -- is "only service_role calls this", so these patterns are belt-and-
    -- suspenders against fat-finger / prompt-injection from a misbehaving
    -- agent rather than a true adversary boundary.
    IF query ~* '(\s|^)(DROP\s+DATABASE|DROP\s+SCHEMA\s+public(\s|;|$)|TRUNCATE\s+auth\.users)' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard';
    END IF;

    -- SELECT/WITH: return rows as jsonb array.
    IF query ~* '^\s*(SELECT|WITH)\s' THEN
        EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (' || query || ') t' INTO result;
        RETURN result;
    END IF;

    -- DDL/DML: execute, return status.
    EXECUTE query;
    RETURN jsonb_build_object('status', 'ok', 'message', 'Statement executed');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status', 'error',
        'message', SQLERRM,
        'sqlstate', SQLSTATE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

COMMENT ON FUNCTION public.exec_sql IS
  'Admin SQL exec for agent migrations. Service-role only. SELECT returns jsonb array; DDL/DML returns status. Dangerous patterns (DROP DATABASE/SCHEMA public, TRUNCATE auth.users) blocked.';
