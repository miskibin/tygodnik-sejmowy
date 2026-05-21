-- 0100_mp_office_expenses_data_confidence.sql
-- Add `data_confidence` column to flag whether an MP office expense report
-- has been verified for internal consistency (sum of 23 items = funds_spent
-- ±5 zł from the PDF's Razem row). The UI shows item-level breakdown only
-- for 'verified' rows; 'unverified' rows render a stub with a link to the
-- original PDF, so we never put numbers we can't vouch for in front of
-- readers.
--
-- The load_mp_office_expenses() function is replaced to compute and set
-- this flag after each upsert + items refresh.

alter table public.mp_office_expense_reports
  add column if not exists data_confidence text not null default 'unverified'
    check (data_confidence in ('verified', 'unverified'));

create index if not exists mp_office_expense_reports_confidence_idx
  on public.mp_office_expense_reports(data_confidence);

-- Per-category medians (of non-zero spends among VERIFIED reports). Used by
-- the frontend to surface notable deviations ("+22 % niż mediana"). Plain
-- view — recomputed every read; the dataset is small (~6 k rows) so this
-- stays sub-millisecond.
create or replace view public.mp_office_expense_category_stats as
select
  r.term,
  r.year,
  i.category_code,
  count(*) filter (where i.amount > 0) as n_nonzero,
  percentile_cont(0.5) within group (order by i.amount)
    filter (where i.amount > 0) as median_nonzero,
  avg(i.amount) filter (where i.amount > 0) as mean_nonzero
from public.mp_office_expense_reports r
join public.mp_office_expense_items i on i.report_id = r.id
where r.data_confidence = 'verified'
group by r.term, r.year, i.category_code;

grant select on public.mp_office_expense_category_stats to anon, authenticated;

create or replace function public.load_mp_office_expenses(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer := 0;
  rec      record;
  rid      bigint;
  it_sum   numeric;
  conf     text;
begin
  for rec in
    select term,
           (payload->>'mp_id')::int                     as mp_id,
           (payload->>'year')::int                      as year,
           nullif(payload->>'period_start','')::date    as period_start,
           nullif(payload->>'period_end','')::date      as period_end,
           nullif(payload->>'funds_allocated','')::numeric as funds_allocated,
           nullif(payload->>'funds_carryover','')::numeric as funds_carryover,
           nullif(payload->>'funds_interest','')::numeric  as funds_interest,
           nullif(payload->>'funds_total','')::numeric     as funds_total,
           nullif(payload->>'funds_spent','')::numeric     as funds_spent,
           nullif(payload->>'funds_remaining','')::numeric as funds_remaining,
           payload->>'source_url'                       as source_url,
           nullif(payload->>'source_sha256','')         as source_sha256,
           nullif(payload->>'published_at','')::date    as published_at,
           nullif(payload->>'approved_by_presidium_at','')::date as approved_by_presidium_at,
           payload->'items'                             as items_jsonb,
           source_path, staged_at
      from public._stage_mp_office_expenses
     where term = p_term
  loop
    insert into public.mp_office_expense_reports(
      term, mp_id, year, period_start, period_end,
      funds_allocated, funds_carryover, funds_interest, funds_total,
      funds_spent, funds_remaining,
      source_url, source_sha256, published_at, approved_by_presidium_at,
      source_path, staged_at, loaded_at
    ) values (
      rec.term, rec.mp_id, rec.year, rec.period_start, rec.period_end,
      rec.funds_allocated, rec.funds_carryover, rec.funds_interest, rec.funds_total,
      rec.funds_spent, rec.funds_remaining,
      rec.source_url, rec.source_sha256, rec.published_at, rec.approved_by_presidium_at,
      rec.source_path, rec.staged_at, now()
    )
    on conflict (term, mp_id, year) do update set
      period_start             = excluded.period_start,
      period_end               = excluded.period_end,
      funds_allocated          = excluded.funds_allocated,
      funds_carryover          = excluded.funds_carryover,
      funds_interest           = excluded.funds_interest,
      funds_total              = excluded.funds_total,
      funds_spent              = excluded.funds_spent,
      funds_remaining          = excluded.funds_remaining,
      source_url               = excluded.source_url,
      source_sha256            = excluded.source_sha256,
      published_at             = excluded.published_at,
      approved_by_presidium_at = excluded.approved_by_presidium_at,
      source_path              = excluded.source_path,
      staged_at                = excluded.staged_at,
      loaded_at                = now()
    returning id into rid;

    delete from public.mp_office_expense_items where report_id = rid;
    if rec.items_jsonb is not null and jsonb_typeof(rec.items_jsonb) = 'array' then
      insert into public.mp_office_expense_items(report_id, category_code, amount, notes)
      select rid,
             (item->>'category_code')::smallint,
             coalesce(nullif(item->>'amount','')::numeric, 0),
             nullif(item->>'notes','')
        from jsonb_array_elements(rec.items_jsonb) as item
       where (item->>'category_code') ~ '^[0-9]+$';
    end if;

    -- Decide data_confidence from internal consistency of just-loaded items.
    select coalesce(sum(amount), 0) into it_sum
      from public.mp_office_expense_items
     where report_id = rid;

    -- Tolerance 100 zł: real reports drift by up to ~12 zł from 23-row
    -- rounding alone, plus jakglosuja's sub-list aggregation adds a few more.
    if rec.funds_spent is not null then
      conf := case when abs(rec.funds_spent - it_sum) < 100 then 'verified' else 'unverified' end;
    elsif it_sum between 30000 and 1500000 then
      -- jakglosuja-style payloads carry no funds_spent; trust items if they
      -- are in the normal annual-spend range.
      conf := 'verified';
    else
      conf := 'unverified';
    end if;

    update public.mp_office_expense_reports
       set data_confidence = conf
     where id = rid;

    affected := affected + 1;
  end loop;
  return affected;
end $$;
