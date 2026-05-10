-- 0010_attachments_v2.sql
-- Extend load_print_attachments to also pull additionalPrints[*].attachments.
-- Each child print (loaded by load_prints_additional) gets its own row in prints,
-- so attachments resolve via prints.number lookup just like parents.

create or replace function load_print_attachments(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  -- Wipe-all then reinsert: ordered list, mid-position changes mustn't leak rows.
  delete from print_attachments pa
  using prints p
  where pa.print_id = p.id and p.term = p_term;

  -- Parents
  insert into print_attachments(print_id, ordinal, filename)
  select
    p.id,
    (ord - 1)::integer,
    fn::text
  from _stage_prints s
  join prints p on p.term = s.term and p.number = s.payload->>'number'
  cross join lateral jsonb_array_elements_text(coalesce(s.payload->'attachments','[]'::jsonb))
    with ordinality as t(fn, ord)
  where s.term = p_term;

  -- Children (additionalPrints[*]). Each child's number resolves to a prints row.
  insert into print_attachments(print_id, ordinal, filename)
  select
    p.id,
    (ord - 1)::integer,
    fn::text
  from _stage_prints s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'additionalPrints','[]'::jsonb)) as child
  join prints p on p.term = s.term and p.number = child->>'number'
  cross join lateral jsonb_array_elements_text(coalesce(child->'attachments','[]'::jsonb))
    with ordinality as t(fn, ord)
  where s.term = p_term;

  get diagnostics affected = row_count;
  return affected;
end $$;
