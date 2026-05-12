-- 0084_polish_fts_extend.sql
-- Extend Polish FTS coverage (introduced in 0073) to votings + committees,
-- and add MPs via existing pg_trgm GIN on mps.normalized_full_name.
-- Replaces polish_fts_search to include 3 new buckets while keeping
-- the (kind, entity_id, rank, headline) row shape so existing callers
-- remain compatible.

-- ---------- votings.search_tsv (title weight A, topic+description weight B)
alter table votings add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('polish_unaccent', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('polish_unaccent',
      coalesce(topic, '') || ' ' || coalesce(description, '')
    ), 'B')
  ) stored;
create index if not exists votings_search_tsv_idx
  on votings using gin (search_tsv);

-- ---------- committees.search_tsv (name weight A, genitive weight B)
alter table committees add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('polish_unaccent', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('polish_unaccent', coalesce(name_genitive, '')), 'B')
  ) stored;
create index if not exists committees_search_tsv_idx
  on committees using gin (search_tsv);

-- mps: no tsvector. Reuses pg_trgm GIN from 0001_core.sql
-- (mps.normalized_full_name already 'lower(unaccent(...))' STORED).

-- ---------- replace polish_fts_search with extended scope
-- Signature unchanged: (text, text, int) → (kind, entity_id, rank, headline).
-- New scope values: 'voting' | 'committee' | 'mp'. 'all' includes all six.
create or replace function polish_fts_search(
  p_query text,
  p_scope text default 'all',
  p_limit int default 20
)
returns table(
  kind text,
  entity_id text,
  rank real,
  headline text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q tsquery;
  q_norm text;
  per_bucket int;
  hl_opts constant text :=
    'StartSel=<mark>,StopSel=</mark>,MaxFragments=1,MaxWords=22,MinWords=8,ShortWord=2,HighlightAll=false';
begin
  q := polish_fts_query(p_query);
  -- MP similarity bucket bypasses tsquery — use direct trigram on
  -- normalized_full_name. Still need a non-null normalized query.
  q_norm := lower(unaccent(coalesce(p_query, '')));
  q_norm := regexp_replace(q_norm, '[^a-z0-9 ]+', ' ', 'g');
  q_norm := trim(regexp_replace(q_norm, '\s+', ' ', 'g'));
  if q is null and length(q_norm) < 2 then
    return;
  end if;
  -- Server-side caps prevent DoS: an unauthenticated caller passing
  -- p_limit=10000 would otherwise trigger 6 buckets × 30000-row scans.
  p_limit := least(greatest(coalesce(p_limit, 20), 1), 100);
  per_bucket := p_limit * 3;

  return query
  with
    print_hits as (
      select
        'print'::text as kind,
        -- Composite (term:number): Sejm print numbers repeat across kadencje.
        -- Caller splits on ':' to fetch the exact (term, number) row.
        (p.term::text || ':' || p.number::text) as entity_id,
        ts_rank_cd(p.search_tsv, q, 32)::real as rank,
        ts_headline('polish_unaccent',
          coalesce(p.impact_punch, p.short_title, p.title, ''),
          q,
          hl_opts
        ) as headline
      from prints p
      where q is not null
        and p_scope in ('all','print')
        and p.is_meta_document = false
        and p.search_tsv @@ q
      order by rank desc
      limit per_bucket
    ),
    promise_hits as (
      select
        'promise'::text as kind,
        pr.id::text as entity_id,
        ts_rank_cd(pr.search_tsv, q, 32)::real as rank,
        ts_headline('polish_unaccent',
          coalesce(pr.title, ''),
          q,
          hl_opts
        ) as headline
      from promises pr
      where q is not null
        and p_scope in ('all','promise')
        and pr.search_tsv @@ q
      order by rank desc
      limit per_bucket
    ),
    statement_hits as (
      select
        'statement'::text as kind,
        s.id::text as entity_id,
        ts_rank_cd(s.search_tsv, q, 32)::real as rank,
        ts_headline('polish_unaccent',
          coalesce(s.body_text, ''),
          q,
          hl_opts
        ) as headline
      from proceeding_statements s
      where q is not null
        and p_scope in ('all','statement')
        and s.search_tsv @@ q
      order by rank desc
      limit per_bucket
    ),
    voting_hits as (
      select
        'voting'::text as kind,
        v.id::text as entity_id,
        ts_rank_cd(v.search_tsv, q, 32)::real as rank,
        ts_headline('polish_unaccent',
          coalesce(v.title, v.topic, ''),
          q,
          hl_opts
        ) as headline
      from votings v
      where q is not null
        and p_scope in ('all','voting')
        and v.search_tsv @@ q
      order by rank desc
      limit per_bucket
    ),
    committee_hits as (
      select
        'committee'::text as kind,
        c.id::text as entity_id,
        ts_rank_cd(c.search_tsv, q, 32)::real as rank,
        ts_headline('polish_unaccent',
          coalesce(c.name, ''),
          q,
          hl_opts
        ) as headline
      from committees c
      where q is not null
        and p_scope in ('all','committee')
        and c.search_tsv @@ q
      order by rank desc
      limit per_bucket
    ),
    -- MPs: trigram similarity on normalized_full_name. Bias rank up by 1.0
    -- so a strong name match (e.g. similarity 0.55) outranks weak FTS hits
    -- and lands in the result page above noisy print/voting matches.
    -- Threshold 0.2 trims long-tail false positives; pg_trgm default is 0.3.
    mp_hits as (
      select
        'mp'::text as kind,
        m.id::text as entity_id,
        (1.0 + similarity(m.normalized_full_name, q_norm))::real as rank,
        m.first_last_name as headline
      from mps m
      where length(q_norm) >= 2
        and p_scope in ('all','mp')
        and m.normalized_full_name % q_norm
        and similarity(m.normalized_full_name, q_norm) > 0.2
      order by similarity(m.normalized_full_name, q_norm) desc
      limit per_bucket
    ),
    all_hits as (
      select * from print_hits
      union all select * from promise_hits
      union all select * from statement_hits
      union all select * from voting_hits
      union all select * from committee_hits
      union all select * from mp_hits
    )
  select all_hits.kind, all_hits.entity_id, all_hits.rank, all_hits.headline
  from all_hits
  order by all_hits.rank desc
  limit p_limit;
end;
$$;

grant execute on function polish_fts_search(text, text, int) to anon, authenticated, service_role;
