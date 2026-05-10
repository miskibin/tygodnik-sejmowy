-- 0013_enrichment_audit.sql
-- Audit trail for enrichment runs and per-row failures.
-- model_runs: one row per fn invocation; status transitions running -> ok|failed.
-- enrichment_failures: one row per (entity, fn, run) failure; cascades on run delete.

create table if not exists model_runs (
  id              bigserial primary key,
  fn_name         text        not null,                -- e.g. 'print_summary', 'embed_print'
  model           text        not null,                -- e.g. 'gemma4:e4b'
  prompt_version  text,                                 -- nullable for non-prompted runs (embed)
  prompt_sha256   text,                                 -- sha of prompt body when applicable
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  status          text        not null default 'running'
                  check (status in ('running','ok','failed')),
  -- Stamp non-trivial environment per run (model swaps mid-batch should be obvious).
  notes           jsonb,
  -- Invariants:
  check (ended_at is null or ended_at >= started_at),
  check (status = 'running' or ended_at is not null)
);
create index if not exists model_runs_fn_idx on model_runs(fn_name, started_at desc);
create index if not exists model_runs_running_idx on model_runs(started_at)
  where status = 'running';

create table if not exists enrichment_failures (
  id            bigserial primary key,
  model_run_id  bigint      not null references model_runs(id) on delete cascade,
  entity_type   text        not null,
  entity_id     text        not null,
  fn_name       text        not null,
  error         text        not null,                  -- truncated repr/traceback summary
  ts            timestamptz not null default now()
);
-- Lookup "what failed for this entity" — common debugging path.
create index if not exists ef_entity_idx on enrichment_failures(entity_type, entity_id);
create index if not exists ef_run_idx on enrichment_failures(model_run_id);

-- Convenience: stamp end + status atomically.
create or replace function model_run_finish(
  p_run_id bigint,
  p_status text,
  p_notes  jsonb default null
) returns void language plpgsql as $$
begin
  if p_status not in ('ok','failed') then
    raise exception 'invalid finish status: %', p_status;
  end if;
  update model_runs
     set status = p_status,
         ended_at = now(),
         notes = coalesce(p_notes, notes)
   where id = p_run_id and status = 'running';
  if not found then
    raise exception 'model_runs row % not in running state', p_run_id;
  end if;
end $$;
