-- load_prints: coalesce fallback for delivery_date.
--
-- Sejm API edge case observed 2026-05-23: sub-print 2441-A ("Dodatkowe
-- sprawozdanie Komisji Nadzwyczajnej...") arrived without a deliveryDate
-- in its fixture JSON. prints.delivery_date is NOT NULL → daily ETL
-- crashed mid-load_prints, rolled back the whole transaction.
--
-- Fallback chain: deliveryDate → documentDate → changeDate. documentDate
-- is the canonical "issued by Sejm" timestamp and is present on every
-- ELI-tracked print; changeDate is a last-ditch upper bound on when the
-- record entered Sejm's tracking system (always present in the fixture).
--
-- This is a CREATE OR REPLACE of an existing function — body unchanged
-- except the single coalesce wrap on line 11 of the SELECT list.

create or replace function load_prints(p_term integer default 10)
returns integer
language plpgsql
as $function$
declare
  affected integer;
begin
  insert into prints(term, number, title, change_date, delivery_date, document_date,
                     is_primary, is_additional, parent_number,
                     source_path, staged_at, loaded_at)
  select
    s.term,
    s.payload->>'number',
    s.payload->>'title',
    (s.payload->>'changeDate')::timestamptz,
    coalesce(
      (s.payload->>'deliveryDate')::date,
      (s.payload->>'documentDate')::date,
      (s.payload->>'changeDate')::date
    ),
    (s.payload->>'documentDate')::date,
    -- is_primary: processPrint exists and first element equals own number
    coalesce((s.payload->'processPrint'->>0) = s.payload->>'number', false),
    false,                          -- is_additional: parents
    null::text,                     -- parent_number: parents have none
    s.source_path,
    s.staged_at,
    now()
  from _stage_prints s
  where s.term = p_term
  on conflict (term, number) do update set
    title = excluded.title,
    change_date = excluded.change_date,
    delivery_date = excluded.delivery_date,
    document_date = excluded.document_date,
    is_primary = excluded.is_primary,
    -- is_additional/parent_number untouched on parents path
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;
  return affected;
end $function$;
