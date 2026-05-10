-- ============================================================================
-- 0038_process_act_link.sql -- link processes to the ELI act they culminated in.
-- The processes resource already carries the raw `eli` text column (the API
-- returns process.ELI as e.g. "DU/2025/123"). This migration adds a hard FK
-- column eli_act_id that points into acts(id), kept null until backfilled.
-- Backfill SQL is operator job; this migration only ships the slot + index.
-- ============================================================================

alter table processes
  add column if not exists eli_act_id bigint references acts(id) on delete set null;

create index if not exists processes_eli_act_idx
  on processes(eli_act_id) where eli_act_id is not null;

-- Helper: resolve eli_act_id by matching processes.eli to acts.eli_id. Idempotent.
-- Operator can call this (or skip) after fetching acts that cover the relevant ELIs.
create or replace function backfill_process_act_links(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  update processes p
     set eli_act_id = a.id
    from acts a
   where p.term = p_term
     and p.eli is not null
     and p.eli_act_id is distinct from a.id
     and a.eli_id = p.eli;
  get diagnostics affected = row_count;
  return affected;
end $$;
