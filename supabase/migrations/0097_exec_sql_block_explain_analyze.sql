-- 0097_exec_sql_block_explain_analyze.sql
-- Block EXPLAIN ANALYZE in exec_sql RPC.
--
-- Problem: in Postgres, EXPLAIN ANALYZE on a mutating statement
-- (UPDATE/DELETE/INSERT/MERGE) actually EXECUTES that statement. The
-- 0095 guard classifies anything starting with EXPLAIN as "SELECT-shaped"
-- and routes it through the cursor branch (OPEN rcur FOR EXECUTE query),
-- which dutifully runs it. So:
--
--   EXPLAIN ANALYZE UPDATE prints SET title = null
--
-- bypasses the `UPDATE without WHERE` deny check (the regex anchors on
-- `^\s*UPDATE`) and silently writes. Fat-finger surface, exactly the
-- threat model 0095 claims to cover.
--
-- Fix: reject EXPLAIN ANALYZE before the SELECT-shaped branch. EXPLAIN
-- without ANALYZE is preserved (plan-only, no execution).
--
-- Regex matches both forms:
--   * keyword:  EXPLAIN ANALYZE ...
--   * options:  EXPLAIN (ANALYZE) ... / EXPLAIN (BUFFERS, ANALYZE) ...

CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    result jsonb;
    stripped text;
BEGIN
    IF query ~* '(\s|^)DROP\s+DATABASE\y' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: DROP DATABASE';
    END IF;

    IF query ~* '(\s|^)DROP\s+SCHEMA\s+(public|auth|storage|realtime|graphql|extensions|cron|pgsodium|vault)\y' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: DROP SCHEMA on system/core schema';
    END IF;

    IF query ~* '(\s|^)DROP\s+TABLE\s+(if\s+exists\s+)?auth\.' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: DROP TABLE auth.*';
    END IF;

    IF query ~* '(\s|^)TRUNCATE\s+(table\s+)?(only\s+)?auth\.users\y' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: TRUNCATE auth.users';
    END IF;

    IF query ~* '(\s|^)TRUNCATE\s+(table\s+)?(only\s+)?(public\.)?(prints|votings|votes|proceedings|proceeding_statements|mps|clubs)\y' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: TRUNCATE on core domain table';
    END IF;

    IF query ~* '(\s|^)ALTER\s+ROLE\s+(postgres|service_role|supabase_admin)\y' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: ALTER ROLE on superuser';
    END IF;

    IF query ~* '(\s|^)DROP\s+ROLE\s+(postgres|service_role|supabase_admin)\y' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: DROP ROLE on superuser';
    END IF;

    IF query ~* '(\s|^)REVOKE\s+ALL\s+(PRIVILEGES\s+)?ON\s+SCHEMA\s+auth\y' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: REVOKE ALL ON SCHEMA auth';
    END IF;

    IF query ~* '^\s*UPDATE\s+(only\s+)?\w+(\.\w+)?\s' AND query !~* '\yWHERE\y' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: UPDATE without WHERE';
    END IF;

    IF query ~* '^\s*DELETE\s+FROM\s+(only\s+)?\w+(\.\w+)?' AND query !~* '\yWHERE\y' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: DELETE without WHERE';
    END IF;

    -- Strip leading whitespace + leading comments by iterative peeling.
    stripped := query;
    LOOP
        DECLARE
            next_stripped text;
        BEGIN
            next_stripped := regexp_replace(stripped, '^\s+', '');
            next_stripped := regexp_replace(next_stripped, '^--[^\n]*(\n|$)', '');
            next_stripped := regexp_replace(next_stripped, '^/\*.*?\*/', '', 's');
            EXIT WHEN next_stripped = stripped;
            stripped := next_stripped;
        END;
    END LOOP;

    -- NEW (0097): EXPLAIN ANALYZE executes the underlying statement,
    -- bypassing the UPDATE/DELETE-without-WHERE guards. Reject both
    -- the bare-keyword and parenthesised-options forms.
    IF stripped ~* '^EXPLAIN\s*(\([^)]*\bANALYZE\b[^)]*\)|ANALYZE\y)' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: EXPLAIN ANALYZE (executes the underlying statement)';
    END IF;

    IF stripped ~* '^\s*(SELECT|WITH|VALUES|TABLE|EXPLAIN|SHOW)\y' THEN
        IF stripped ~* '^\s*(EXPLAIN|SHOW)\y' THEN
            DECLARE
                lines text[] := ARRAY[]::text[];
                line text;
                rcur refcursor;
            BEGIN
                OPEN rcur FOR EXECUTE query;
                LOOP
                    FETCH rcur INTO line;
                    EXIT WHEN NOT FOUND;
                    lines := array_append(lines, line);
                END LOOP;
                CLOSE rcur;
                RETURN to_jsonb(lines);
            END;
        END IF;
        EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (' || query || ') t' INTO result;
        RETURN result;
    END IF;

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
  'Admin SQL exec for agent migrations. Service-role only. SELECT/WITH/VALUES/TABLE/EXPLAIN/SHOW return jsonb rows; DDL/DML returns status. Deny-list: DROP DATABASE; DROP SCHEMA on system/core schemas; DROP TABLE auth.*; TRUNCATE auth.users or core domain tables; ALTER/DROP ROLE on superuser; REVOKE ALL ON SCHEMA auth; UPDATE/DELETE without WHERE; EXPLAIN ANALYZE (it executes the wrapped statement). Fat-finger guard, not adversary boundary.';
