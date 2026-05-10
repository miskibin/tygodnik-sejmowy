-- 0050_is_meta_document_trigger.sql
-- Replace STORED generated column with a trigger-maintained boolean.
--
-- The 0045 STORED form rewrites the entire prints table when first added
-- (PG materialises every row's value at column-add time). On a 543-row dev
-- corpus that's invisible; on a 50k+ row prod corpus the migration would
-- hold an ACCESS EXCLUSIVE lock for minutes. PG 17 ships VIRTUAL generated
-- columns which would dodge this, but Supabase still runs PG 15.
--
-- Approach:
--   1. Drop the STORED column.
--   2. Re-add as a plain boolean.
--   3. BEFORE INSERT/UPDATE trigger keeps it in sync with document_category
--      and title — same expression as the original generated column.
--   4. One-shot UPDATE backfills existing rows.
--   5. Recreate the partial index on the plain column.
--
-- Trigger runs only when document_category or title actually changes (per
-- WHEN clause in WHEN OF), so business UPDATEs that touch unrelated columns
-- don't recompute the flag.

-- print_homepage_score (0045) selects is_meta_document; CASCADE drop kills
-- the view, recreated identically below.
alter table prints drop column if exists is_meta_document cascade;

alter table prints add column if not exists is_meta_document boolean;

create or replace function _set_print_is_meta_document() returns trigger
  language plpgsql as $$
begin
  new.is_meta_document := (
    new.document_category in (
      'opinia_organu','autopoprawka','wniosek_organizacyjny','pismo_marszalka'
    )
    or new.title ~* '^Do druku nr'
  );
  return new;
end $$;

drop trigger if exists trg_print_is_meta_document on prints;
create trigger trg_print_is_meta_document
  before insert or update of document_category, title on prints
  for each row execute function _set_print_is_meta_document();

-- Backfill (set-based, single statement — fast even at 50k rows).
update prints set is_meta_document = (
  document_category in (
    'opinia_organu','autopoprawka','wniosek_organizacyjny','pismo_marszalka'
  )
  or title ~* '^Do druku nr'
)
where is_meta_document is null
   or is_meta_document is distinct from (
        document_category in (
          'opinia_organu','autopoprawka','wniosek_organizacyjny','pismo_marszalka'
        )
        or title ~* '^Do druku nr'
      );

drop index if exists prints_is_meta_document_idx;
create index if not exists prints_is_meta_document_idx
  on prints (is_meta_document, term) where is_meta_document = false;

-- Recreate the homepage-score view that CASCADE dropped above. Identical
-- definition to 0045 — single source of truth lives there but PG forces
-- redefinition after column-type change.
create or replace view print_homepage_score as
select
  p.id as print_id,
  p.number as print_number,
  p.term,
  (
    case when exists (
      select 1 from jsonb_array_elements(p.affected_groups) ag
      where ag->>'severity' = 'high'
    ) then 0.5 else 0.0 end
    + case when p.citizen_action is not null then 0.3 else 0.0 end
    + case when array_length(p.persona_tags, 1) >= 1 then 0.2 else 0.0 end
  ) as homepage_score,
  p.is_meta_document,
  coalesce(p.is_procedural, false) as is_procedural
from prints p
where p.document_category = 'projekt_ustawy';
