-- 0027_promises.sql
-- Party-promise corpus (manually curated). Powers the "promise vs. vote"
-- ledger. Independent of the Sejm-API pipeline -- no FK dependencies on
-- prints/votings/processes. Linkage to votes/prints happens later via the
-- separate promise_print_candidates table (see 0028_promise_matcher.sql).
--
-- Sources are external manifestos, "100 konkretow", coalition agreements,
-- post-election ministerial declarations. Reviewer workflow: each row is
-- inserted by a curator with confidence + source_url; reviewers update
-- status as the legislative ledger evolves.

-- ---------- promises ----------
create table if not exists promises (
  id                bigserial primary key,
  party_code        text    not null,
  slug              text    not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title             text    not null,
  normalized_text   text    not null,
  source_year       integer not null check (source_year >= 1991),
  source_url        text    not null,
  source_quote      text,
  status            text    not null,
  confidence        numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  reviewer          text,
  last_reviewed_at  timestamptz,
  source_path       text,
  staged_at         timestamptz,
  loaded_at         timestamptz not null default now(),
  unique (party_code, slug),
  check (status in ('fulfilled','in_progress','broken','contradicted_by_vote','no_action'))
);
create index if not exists promises_party_idx on promises(party_code);
create index if not exists promises_status_idx on promises(status);

-- ---------- raw stage ----------
create table if not exists _stage_promises (
  id          bigserial primary key,
  term        integer not null,                       -- term column kept for stage symmetry; promises themselves are term-agnostic
  natural_id  text    not null,                       -- "{party_code}__{slug(title)}"
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

-- ---------- load_promises ----------
-- Idempotent on (party_code, title). Term param is a no-op for the data but
-- kept for orchestrator-signature symmetry with other load_* fns.
create or replace function load_promises(p_term integer default 10)
returns integer language plpgsql as $$
declare affected integer;
begin
  insert into promises(party_code, slug, title, normalized_text, source_year,
                       source_url, source_quote, status, confidence,
                       reviewer, last_reviewed_at,
                       source_path, staged_at, loaded_at)
  select
    s.payload->>'party_code',
    s.payload->>'slug',
    s.payload->>'title',
    s.payload->>'normalized_text',
    (s.payload->>'source_year')::int,
    s.payload->>'source_url',
    s.payload->>'source_quote',
    s.payload->>'status',
    nullif(s.payload->>'confidence','')::numeric,
    s.payload->>'reviewer',
    nullif(s.payload->>'last_reviewed_at','')::timestamptz,
    s.source_path, s.staged_at, now()
  from _stage_promises s
  where s.term = p_term
  on conflict (party_code, slug) do update set
    title = excluded.title,
    normalized_text = excluded.normalized_text,
    source_year = excluded.source_year,
    source_url = excluded.source_url,
    source_quote = excluded.source_quote,
    status = excluded.status,
    confidence = excluded.confidence,
    reviewer = excluded.reviewer,
    last_reviewed_at = excluded.last_reviewed_at,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;
  return affected;
end $$;
