-- 0099_etl_watermarks.sql
--
-- Smart-skip ETL via sealed-entity watermarks.
--
-- Daily ETL re-walks immutable items every run. Example: morning of
-- 2026-05-14, `fetch_proceeding_bodies` scanned 16,586 NULL-body
-- statements even though most belong to proceedings whose bodies are
-- already fully cached; `capture_votings` re-iterates every voting in
-- every proceeding of current year despite cast votes being immutable
-- seconds after the vote.
--
-- This migration introduces a single sealing-bookkeeping table and a
-- one-shot bulk-seal for everything we already know is immutable. Live
-- term-10 fetchers (proceeding bodies, votings, committee sittings, acts)
-- then add per-entity seal predicates so newly-finalised items get
-- sealed on capture and never re-fetched.
--
-- Closed enum of `entity` values + key format (per fetcher):
--
--   proceeding_body    'term{T}__proc{N}'        sealed when 0 NULL bodies left
--   voting             'term{T}__{S}__{V}'       T=term, S=sitting (proceeding num), V=voting_number
--                                                sealed on capture with non-empty votes
--   committee_sitting  'term{T}__{CODE}__{NUM}'  CODE=committees.code, NUM=sitting num
--                                                sealed when status='FINISHED'
--   act                '{publisher}__{year}__{pos}'   sealed when publication_date < today-14d
--   print              'term{T}__{NUMBER}'       bulk-sealed for term < 10 only (live-term state mutable)
--   process            'term{T}__{NUMBER}'       bulk-sealed for term < 10 only (live-term lifecycle dynamic)
--
-- The table is intentionally additive — never UPDATE rows, never DELETE
-- except for manual recovery. If a bug ships sealed-on-bad-data the
-- recovery path is `DELETE FROM public.etl_watermarks WHERE source = '<bad>'`.

-- ---------- public.etl_watermarks ----------
create table if not exists public.etl_watermarks (
  entity    text        not null,
  key       text        not null,
  sealed_at timestamptz not null default now(),
  source    text        not null,
  primary key (entity, key),
  check (entity in (
    'proceeding_body',
    'voting',
    'committee_sitting',
    'act',
    'print',
    'process'
  ))
);
create index if not exists etl_watermarks_entity_idx on public.etl_watermarks(entity);

comment on table public.etl_watermarks is
  'Sealing-bookkeeping for ETL fetchers. Presence of (entity, key) means '
  'the fetcher should skip re-fetching that item. See migration 0099 '
  'header for the key format per entity. Additive only.';

-- ---------- bulk-seal: terms 1-9 (lifecycle frozen at term boundary) ----------
-- Term 9 ended 2023-11-12. Everything in terms 1-9 is immutable.

insert into public.etl_watermarks (entity, key, source)
select 'proceeding_body',
       'term' || term || '__proc' || number,
       'bulk_migration_0099_terms_1_9'
from proceedings
where term < 10
on conflict do nothing;

insert into public.etl_watermarks (entity, key, source)
select 'voting',
       'term' || term || '__' || sitting || '__' || voting_number,
       'bulk_migration_0099_terms_1_9'
from votings
where term < 10
on conflict do nothing;

insert into public.etl_watermarks (entity, key, source)
select 'print',
       'term' || term || '__' || number,
       'bulk_migration_0099_terms_1_9'
from prints
where term < 10
on conflict do nothing;

insert into public.etl_watermarks (entity, key, source)
select 'process',
       'term' || term || '__' || number,
       'bulk_migration_0099_terms_1_9'
from processes
where term < 10
on conflict do nothing;

-- committee_sittings cascades through committees.code (the natural key on
-- the upstream API). Bulk-seal only sittings whose term < 10.
insert into public.etl_watermarks (entity, key, source)
select 'committee_sitting',
       'term' || cs.term || '__' || c.code || '__' || cs.num,
       'bulk_migration_0099_terms_1_9'
from committee_sittings cs
join committees c on c.id = cs.committee_id
where cs.term < 10
on conflict do nothing;

-- ---------- bulk-seal: live-term historical (term 10) ----------
-- Proceedings whose every statement has body_text NOT NULL.
insert into public.etl_watermarks (entity, key, source)
select 'proceeding_body',
       'term' || p.term || '__proc' || p.number,
       'bulk_migration_0099_term10_complete'
from proceedings p
where p.term = 10
  and not exists (
    select 1
    from proceeding_days pd
    join proceeding_statements ps on ps.proceeding_day_id = pd.id
    where pd.proceeding_id = p.id
      and ps.body_text is null
  )
  and exists (
    select 1
    from proceeding_days pd
    join proceeding_statements ps on ps.proceeding_day_id = pd.id
    where pd.proceeding_id = p.id
  )
on conflict do nothing;

-- Term-10 votings: cast counts are immutable; if a row exists in `votings`
-- with non-zero total_voted it has been captured fully.
insert into public.etl_watermarks (entity, key, source)
select 'voting',
       'term' || term || '__' || sitting || '__' || voting_number,
       'bulk_migration_0099_term10_captured'
from votings
where term = 10
  and total_voted > 0
on conflict do nothing;

-- Term-10 committee sittings whose status is FINISHED.
insert into public.etl_watermarks (entity, key, source)
select 'committee_sitting',
       'term' || cs.term || '__' || c.code || '__' || cs.num,
       'bulk_migration_0099_term10_finished'
from committee_sittings cs
join committees c on c.id = cs.committee_id
where cs.term = 10
  and cs.status = 'FINISHED'
on conflict do nothing;

-- Acts older than 14 days (publication has settled).
insert into public.etl_watermarks (entity, key, source)
select 'act',
       publisher || '__' || year || '__' || position,
       'bulk_migration_0099_act_settled'
from acts
where coalesce(announcement_date, promulgation_date) < (current_date - interval '14 days')
on conflict do nothing;
