-- 0089_print_committee_sitting_links.sql
-- Link prints to real committee sittings when agenda_html references
-- specific "druk nr ..." numbers.

create table if not exists print_committee_sitting_links (
  id                    bigserial primary key,
  print_id              bigint not null references prints(id) on delete cascade,
  sitting_id            bigint not null references committee_sittings(id) on delete cascade,
  source                text   not null default 'agenda_regex',
  confidence            numeric(3,2) not null default 0.85,
  matched_print_number  text   not null,
  linked_at             timestamptz not null default now(),
  unique (print_id, sitting_id, source),
  check (source in ('agenda_regex', 'manual')),
  check (confidence >= 0 and confidence <= 1)
);

create index if not exists print_committee_sitting_links_print_idx
  on print_committee_sitting_links(print_id);
create index if not exists print_committee_sitting_links_sitting_idx
  on print_committee_sitting_links(sitting_id);

-- Flattened read model for frontend print page.
create or replace view print_committee_sittings_v as
select
  l.print_id,
  l.sitting_id,
  l.source,
  l.confidence,
  l.matched_print_number,
  cs.term,
  cs.num as sitting_num,
  cs.date,
  cs.start_at,
  cs.end_at,
  cs.room,
  cs.status,
  cs.closed,
  cs.remote,
  cs.agenda_html,
  c.id as committee_id,
  c.code as committee_code,
  c.name as committee_name,
  (
    select v.player_link
    from committee_sitting_videos v
    where v.sitting_id = cs.id
    order by
      case when v.video_type = 'komisja' then 0 else 1 end,
      v.id
    limit 1
  ) as video_player_link
from print_committee_sitting_links l
join committee_sittings cs on cs.id = l.sitting_id
join committees c on c.id = cs.committee_id;

