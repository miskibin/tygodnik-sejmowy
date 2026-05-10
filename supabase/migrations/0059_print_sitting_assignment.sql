-- 0059_print_sitting_assignment.sql
-- Map each print to a single canonical sitting (posiedzenie) for the Tygodnik
-- per-sitting feed. A print's process can have stages at multiple sittings
-- (1st reading, 2nd reading, vote); we pick the highest sitting_num — i.e.
-- the most recent sitting where the process materially advanced.

create or replace view print_sitting_assignment as
select distinct on (pr.id)
  pr.id        as print_id,
  pr.term      as term,
  ps.sitting_num
from prints pr
join processes p
  on p.term = pr.term and p.number = pr.number
join process_stages ps
  on ps.process_id = p.id
where ps.sitting_num is not null
order by pr.id, ps.sitting_num desc;

comment on view print_sitting_assignment is
  'Each print → its canonical sitting (posiedzenie) number, defined as the highest sitting_num across its process stages. Used by Tygodnik per-sitting feed.';

-- Per-sitting roll-up of eligible Tygodnik prints + proceedings metadata,
-- used to render the prev/next sitting nav and the archive index.
-- "Eligible" matches the same filter the Tygodnik feed uses.
create or replace view tygodnik_sittings as
select
  pc.term,
  pc.number       as sitting_num,
  pc.title        as sitting_title,
  pc.dates        as sitting_dates,
  pc.dates[1]                              as first_date,
  pc.dates[array_length(pc.dates, 1)]      as last_date,
  count(distinct psa.print_id) filter (
    where pr.impact_punch is not null
      and pr.is_meta_document = false
      and coalesce(pr.is_procedural, false) = false
      and pr.document_category = 'projekt_ustawy'
  ) as print_count
from proceedings pc
left join print_sitting_assignment psa
  on psa.term = pc.term and psa.sitting_num = pc.number
left join prints pr
  on pr.id = psa.print_id
group by pc.term, pc.number, pc.title, pc.dates;

comment on view tygodnik_sittings is
  'Per-sitting eligible-print counts + proceedings dates/title for the Tygodnik archive index.';
