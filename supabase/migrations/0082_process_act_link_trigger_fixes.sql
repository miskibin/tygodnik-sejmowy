-- Address review feedback on 0081:
--
-- 1. The acts trigger fires `UPDATE processes WHERE eli = NEW.eli_id` on
--    every act insert/update. processes had no index on (eli) — only on
--    (eli_act_id) — so this is a seq scan per acts write. Cheap today
--    (~700 rows) but unbounded as we backfill historical terms. Add a
--    partial b-tree on (eli) where eli is not null.
--
-- 2. `link_act_on_process_eli_change` short-circuited when NEW.eli was
--    null and only resolved eli_act_id when it was already null. That
--    leaves stale linkage when:
--      a) NEW.eli is set to NULL (eli_act_id stays pointing at the old act)
--      b) NEW.eli changes to a different eli (eli_act_id stays pointing
--         at the previous act)
--    Recompute eli_act_id on every eli change instead.

create index if not exists processes_eli_idx
  on processes(eli) where eli is not null;

create or replace function link_act_on_process_eli_change()
returns trigger language plpgsql as $$
begin
  if NEW.eli is null then
    NEW.eli_act_id := null;
    return NEW;
  end if;
  if TG_OP = 'INSERT' or NEW.eli is distinct from OLD.eli then
    select a.id into NEW.eli_act_id
      from acts a
     where a.eli_id = NEW.eli
     limit 1;
  end if;
  return NEW;
end $$;
