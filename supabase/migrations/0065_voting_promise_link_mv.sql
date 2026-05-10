-- 0065_voting_promise_link_mv.sql
-- Voting ↔ confirmed-promise bridge for the "what's next" timeline on
-- /watek/[id] and /promise/[slug] pages. One row per (voting, promise);
-- dedupe via DISTINCT ON (voting_id, promise_id) keeping the print with the
-- best role priority so we have something to label in the UI.
--
-- Source tables:
--   voting_print_links(voting_id, print_id, role)   — voting → print
--   promise_print_candidates(promise_id, print_term, print_number, match_status)
--     joins prints by (term, number) — match_status='confirmed' only
--   promises(id, party_code, title)

create materialized view if not exists voting_promise_link_mv as
select distinct on (vpl.voting_id, ppc.promise_id)
  v.term,
  vpl.voting_id,
  ppc.promise_id,
  pr.party_code,
  ppc.match_status,
  p.id           as print_id,
  p.short_title  as print_short_title
from voting_print_links vpl
join votings v   on v.id = vpl.voting_id
join prints p    on p.id = vpl.print_id
join promise_print_candidates ppc
  on ppc.print_term = p.term
 and ppc.print_number = p.number
 and ppc.match_status = 'confirmed'
join promises pr on pr.id = ppc.promise_id
order by vpl.voting_id, ppc.promise_id,
         case when vpl.role = 'main' then 0 else 1 end,
         p.id;

create unique index if not exists voting_promise_link_mv_pk
  on voting_promise_link_mv (voting_id, promise_id);

create index if not exists voting_promise_link_mv_promise_idx
  on voting_promise_link_mv (promise_id);

create index if not exists voting_promise_link_mv_term_voting_idx
  on voting_promise_link_mv (term, voting_id);

create or replace function refresh_voting_promise_link() returns void
language plpgsql as $$
begin
  refresh materialized view concurrently voting_promise_link_mv;
end;
$$;

refresh materialized view voting_promise_link_mv;

comment on materialized view voting_promise_link_mv is
  'Voting ↔ promise bridge via confirmed promise_print_candidates. '
  'DISTINCT ON (voting, promise); print priority: role=main first.';
