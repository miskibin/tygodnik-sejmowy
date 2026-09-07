-- 0105 — updater rewrite: run ledger, delta cursors, proceeding gap probe.
--
-- etl_runs      one row per `python -m supagraf daily` (or `sync`) run with
--               per-step timings/counters/errors as jsonb. The CLI exit code
--               mirrors `status` so cron notices failures.
-- etl_cursors   high-water marks for upstream delta endpoints
--               (processes?modifiedSince, interpellations/writtenQuestions
--               ?modifiedSince, videos?since, /eli/changes/acts?since).
--               Only advanced after a clean resource sync.
-- proceeding_day_gaps(p_term)
--               sitting days of the last 90 days that still have no
--               statements or statements without bodies — the updater
--               re-pulls those transcripts even outside its window.

create table if not exists public.etl_runs (
  id          bigserial primary key,
  kind        text        not null,
  term        integer,
  status      text        not null default 'running'
              check (status in ('running', 'ok', 'partial', 'failed')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  args        jsonb,
  steps       jsonb,
  errors      jsonb,
  host        text,
  git_sha     text,
  check (finished_at is null or finished_at >= started_at),
  check (status = 'running' or finished_at is not null)
);
create index if not exists etl_runs_kind_started_idx on public.etl_runs (kind, started_at desc);
comment on table public.etl_runs is 'Updater run ledger: one row per daily/sync run, per-step jsonb.';

create table if not exists public.etl_cursors (
  name       text        primary key,
  value      text        not null,
  updated_at timestamptz not null default now()
);
comment on table public.etl_cursors is 'Delta cursors for upstream endpoints supporting modifiedSince/since.';

create or replace function public.proceeding_day_gaps(p_term integer)
returns table (number integer, date date, statements bigint, missing_bodies bigint)
language sql
stable
as $$
  select p.number,
         d.date,
         count(s.id)                                        as statements,
         count(s.id) filter (where s.body_text is null)     as missing_bodies
  from public.proceedings p
  join public.proceeding_days d on d.proceeding_id = p.id
  left join public.proceeding_statements s on s.proceeding_day_id = d.id
  where p.term = p_term
    and d.date <= current_date
    and d.date >= current_date - 90
  group by p.number, d.date
  having count(s.id) = 0
      or count(s.id) filter (where s.body_text is null) > 0
$$;
comment on function public.proceeding_day_gaps(integer) is
  'Recent sitting days lacking statements or bodies; consumed by supagraf.sync.resources.proceedings.';

-- Stale-ELI refresher: bounded re-check cadence needs an index on the stamp.
create index if not exists processes_stale_eli_idx
  on public.processes (term, last_refreshed_at)
  where passed = true and eli_act_id is null;
