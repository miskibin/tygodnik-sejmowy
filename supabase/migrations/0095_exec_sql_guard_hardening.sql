-- 0095_exec_sql_guard_hardening.sql
-- Harden the exec_sql RPC guard introduced in 0093.
--
-- Two classes of fixes:
--
-- 1) search_path: prepend pg_catalog. SECURITY DEFINER functions resolve
--    unqualified names against search_path; without pg_catalog first, a
--    caller-controlled public-schema function could in theory shadow a
--    builtin. Postgres docs recommend pg_catalog be listed first.
--
-- 2) Expanded deny-list. The 0093 regex only caught DROP DATABASE,
--    DROP SCHEMA public, TRUNCATE auth.users. Real fat-finger surface is
--    much wider:
--      - DROP SCHEMA <any system schema> CASCADE  (auth, storage, ...)
--      - DROP TABLE auth.users (and cousins)
--      - TRUNCATE on core domain tables (prints, votings, ...)
--      - ALTER ROLE / DROP ROLE on superuser-equivalent roles
--      - REVOKE ALL ON SCHEMA auth ...
--      - UPDATE <table> SET ... (no WHERE)  => total column overwrite
--      - DELETE FROM <table>     (no WHERE) => effective TRUNCATE
--
--    POSIX regex (Postgres) has no lookahead, so the no-WHERE checks are
--    expressed as two separate IFs: (a) query starts with UPDATE/DELETE,
--    AND (b) query does NOT match `\yWHERE\y` (Postgres ARE uses \y for
--    word boundary; \b is backspace in ARE — easy gotcha, fixed here from
--    the prior 0093 attempt). CTE-prefixed forms (`WITH ... UPDATE`)
--    bypass the simple anchor; accepted gap — fat-finger guard, not
--    adversary boundary.
--
-- 3) SELECT detection improvement. The 0093 regex `^\s*(SELECT|WITH)\s`
--    misclassifies legitimate readers as DDL: leading SQL comments
--    (`-- foo\nSELECT 1`, `/* */ SELECT 1`), EXPLAIN, VALUES, TABLE
--    shorthand, SHOW. Strip leading comments and whitespace before the
--    keyword match.

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
    -- ---------------------------------------------------------------
    -- Deny-list: obvious destructive patterns.
    -- ---------------------------------------------------------------
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

    -- Core domain tables: wholesale TRUNCATE is almost certainly a mistake.
    -- Match optional `table`/`only` keywords and pick the first comma-separated target.
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

    -- UPDATE without WHERE. POSIX regex has no lookahead, so this is two-step:
    --   (a) anchored UPDATE form,
    --   (b) AND the query body has no WHERE token.
    -- Misses CTE-prefixed (`WITH ... UPDATE ...`); accepted gap, see header.
    IF query ~* '^\s*UPDATE\s+(only\s+)?\w+(\.\w+)?\s' AND query !~* '\yWHERE\y' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: UPDATE without WHERE';
    END IF;

    -- DELETE FROM without WHERE.
    IF query ~* '^\s*DELETE\s+FROM\s+(only\s+)?\w+(\.\w+)?' AND query !~* '\yWHERE\y' THEN
        RAISE EXCEPTION 'Dangerous statement blocked by exec_sql guard: DELETE without WHERE';
    END IF;

    -- ---------------------------------------------------------------
    -- SELECT-shaped detection (return rows). Strip leading line comments
    -- (`-- ...\n`) and block comments (`/* ... */`) plus whitespace before
    -- matching the keyword. Recognize SELECT, WITH, VALUES, TABLE (shorthand
    -- for SELECT * FROM), EXPLAIN, SHOW.
    --
    -- Edge case: nested block comments (`/* /* */ */`) aren't stripped — they
    -- would fall through to the DDL/DML branch. Postgres supports them but
    -- they're rare in agent-emitted SQL; left as accepted shortcoming.
    -- ---------------------------------------------------------------
    -- Strip leading whitespace + leading comments by iterative peeling.
    -- Postgres ARE supports `*?` non-greedy; the `s` flag makes `.` match newlines.
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

    IF stripped ~* '^\s*(SELECT|WITH|VALUES|TABLE|EXPLAIN|SHOW)\y' THEN
        -- EXPLAIN / SHOW cannot be used as a subquery in Postgres; collect
        -- their output rows via a CURSOR fetched into a text array, then
        -- pack as jsonb.
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

    -- DDL/DML fallthrough.
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
  'Admin SQL exec for agent migrations. Service-role only. SELECT/WITH/VALUES/TABLE/EXPLAIN/SHOW return jsonb rows; DDL/DML returns status. Deny-list: DROP DATABASE; DROP SCHEMA on system/core schemas; DROP TABLE auth.*; TRUNCATE auth.users or core domain tables; ALTER/DROP ROLE on superuser; REVOKE ALL ON SCHEMA auth; UPDATE/DELETE without WHERE. Fat-finger guard, not adversary boundary.';
