-- Self-healing eli_act_id linkage.
--
-- backfill_process_act_links (0038) was only called explicitly at the tail
-- of `supagraf daily`. After the 2026-05-09 DB migration to a fresh project,
-- 307 processes with both processes.eli set and a matching acts row sat
-- unlinked because the post-load backfill never ran on the new DB. The
-- frontend then renders "Uchwalono — oczekuje na publikację" even though
-- the act is in our DB and indexable.
--
-- These triggers make the linkage self-healing: whenever an act lands, or a
-- process gets its eli populated, the FK is resolved immediately. The
-- explicit `backfill_process_act_links` RPC stays in daily as a tail-fix
-- safety net for any rows that slipped past the triggers (e.g. bulk
-- restores done with `session_replication_role=replica`).

create or replace function link_process_on_act_change()
returns trigger language plpgsql as $$
begin
  update processes p
     set eli_act_id = NEW.id
   where p.eli = NEW.eli_id
     and p.eli_act_id is distinct from NEW.id;
  return NEW;
end $$;

drop trigger if exists trg_link_process_on_act_change on acts;
create trigger trg_link_process_on_act_change
  after insert or update of eli_id on acts
  for each row execute function link_process_on_act_change();

create or replace function link_act_on_process_eli_change()
returns trigger language plpgsql as $$
begin
  if NEW.eli is null then
    return NEW;
  end if;
  if NEW.eli_act_id is null then
    select a.id into NEW.eli_act_id
      from acts a
     where a.eli_id = NEW.eli
     limit 1;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_link_act_on_process_eli on processes;
create trigger trg_link_act_on_process_eli
  before insert or update of eli on processes
  for each row execute function link_act_on_process_eli_change();
