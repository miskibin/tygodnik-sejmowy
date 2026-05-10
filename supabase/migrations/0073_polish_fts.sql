-- Polish full-text search via simple+unaccent + prefix-rewrite query.
--
-- Supabase Postgres ships no `polish` text search config (verified via
-- pg_ts_config — only english/german/finnish/etc + simple). We approximate
-- Polish stemming by:
--   1. Custom config `polish_unaccent` = simple + unaccent dictionary —
--      lowercases + strips diacritics (ą→a, ż→z, ś→s).
--   2. Helper `polish_fts_query(text)` rewrites every input token with
--      `:*` prefix → catches Polish suffix-inflection (ustawa/ustawy/
--      ustawami → all match `ustaw:*`).
--
-- Tradeoff: no real lemmatization (Hunspell pl_PL would need filesystem
-- upload to PG share dir, not available on managed Supabase). Prefix
-- matching covers most Polish word families since inflection is suffixal.

CREATE TEXT SEARCH CONFIGURATION polish_unaccent (COPY = simple);
ALTER TEXT SEARCH CONFIGURATION polish_unaccent
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, simple;

-- Generated tsvector columns. Weights:
--   A = title (most authoritative)
--   B = short_title / impact_punch / speaker function
--   C = body text
ALTER TABLE prints ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('polish_unaccent', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('polish_unaccent',
      coalesce(short_title, '') || ' ' || coalesce(impact_punch, '')
    ), 'B')
  ) STORED;

ALTER TABLE promises ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('polish_unaccent', coalesce(title, '')), 'A')
  ) STORED;

ALTER TABLE proceeding_statements ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('polish_unaccent',
      coalesce(speaker_name, '') || ' ' || coalesce(function, '')
    ), 'B') ||
    setweight(to_tsvector('polish_unaccent', coalesce(body_text, '')), 'C')
  ) STORED;

CREATE INDEX prints_search_tsv_idx
  ON prints USING gin (search_tsv);
CREATE INDEX promises_search_tsv_idx
  ON promises USING gin (search_tsv);
CREATE INDEX proceeding_statements_search_tsv_idx
  ON proceeding_statements USING gin (search_tsv);

-- Rewrite plain user input to a prefix tsquery.
-- "ustawa o świadczeniach" → 'ustawa:* & o:* & swiadczeniach:*' on simple
-- config (already lowercased + unaccented). Returns NULL when the input
-- has no usable tokens — caller must short-circuit.
CREATE OR REPLACE FUNCTION polish_fts_query(p_input text)
RETURNS tsquery
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_clean text;
  v_terms text[];
BEGIN
  IF p_input IS NULL OR length(trim(p_input)) = 0 THEN
    RETURN NULL;
  END IF;
  v_clean := lower(unaccent(p_input));
  v_clean := regexp_replace(v_clean, '[^a-z0-9 ]+', ' ', 'g');
  v_terms := ARRAY(
    SELECT t || ':*'
    FROM unnest(string_to_array(v_clean, ' ')) AS t
    WHERE length(t) >= 2
  );
  IF array_length(v_terms, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN to_tsquery('simple', array_to_string(v_terms, ' & '));
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Unified search RPC. Returns top-N hits across prints/promises/statements
-- with rank + ts_headline snippet (HTML <mark> highlight on body field).
-- p_scope: 'all' | 'print' | 'promise' | 'statement'.
CREATE OR REPLACE FUNCTION polish_fts_search(
  p_query text,
  p_scope text DEFAULT 'all',
  p_limit int DEFAULT 20
)
RETURNS TABLE(
  kind text,
  entity_id text,
  rank real,
  headline text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q tsquery;
  per_bucket int;
  hl_opts constant text :=
    'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MaxWords=22,MinWords=8,ShortWord=2,HighlightAll=false';
BEGIN
  q := polish_fts_query(p_query);
  IF q IS NULL THEN
    RETURN;
  END IF;
  per_bucket := greatest(p_limit, 5) * 3;

  RETURN QUERY
  WITH
    print_hits AS (
      SELECT
        'print'::text AS kind,
        p.number::text AS entity_id,
        ts_rank_cd(p.search_tsv, q, 32)::real AS rank,
        ts_headline('polish_unaccent',
          coalesce(p.impact_punch, p.short_title, p.title, ''),
          q,
          hl_opts
        ) AS headline
      FROM prints p
      WHERE p_scope IN ('all','print')
        AND p.is_meta_document = false
        AND p.search_tsv @@ q
      ORDER BY rank DESC
      LIMIT per_bucket
    ),
    promise_hits AS (
      SELECT
        'promise'::text AS kind,
        pr.id::text AS entity_id,
        ts_rank_cd(pr.search_tsv, q, 32)::real AS rank,
        ts_headline('polish_unaccent',
          coalesce(pr.title, ''),
          q,
          hl_opts
        ) AS headline
      FROM promises pr
      WHERE p_scope IN ('all','promise')
        AND pr.search_tsv @@ q
      ORDER BY rank DESC
      LIMIT per_bucket
    ),
    statement_hits AS (
      SELECT
        'statement'::text AS kind,
        s.id::text AS entity_id,
        ts_rank_cd(s.search_tsv, q, 32)::real AS rank,
        ts_headline('polish_unaccent',
          coalesce(s.body_text, ''),
          q,
          hl_opts
        ) AS headline
      FROM proceeding_statements s
      WHERE p_scope IN ('all','statement')
        AND s.search_tsv @@ q
      ORDER BY rank DESC
      LIMIT per_bucket
    ),
    all_hits AS (
      SELECT * FROM print_hits
      UNION ALL SELECT * FROM promise_hits
      UNION ALL SELECT * FROM statement_hits
    )
  SELECT all_hits.kind, all_hits.entity_id, all_hits.rank, all_hits.headline
  FROM all_hits
  ORDER BY all_hits.rank DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION polish_fts_query(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION polish_fts_search(text, text, int) TO anon, authenticated, service_role;
