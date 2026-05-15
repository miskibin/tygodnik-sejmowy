-- 0096_voting_pkt_index.sql
-- Partial index supporting the `agenda_point_title` lateral introduced in
-- migration 0092 (viral_quote_agenda_point view).
--
-- The lateral in 0092:
--   left join lateral (
--     select v.title
--     from votings v
--     where v.term = ps.term
--       and v.sitting = ps.sitting
--       and v.date >= ps.date
--       and v.title ~ '^Pkt\.\s+\d+'
--     order by v.date asc
--     limit 1
--   ) ap on true
--
-- Previously the planner used `votings_term_sitting_idx (term, sitting)` then
-- post-sorted by date and applied the regex predicate. On large sittings this
-- ran the regex against every (term, sitting) candidate row, on every
-- statement row in the view — quadratic-ish on /tygodnik/p/<sitting>.
--
-- This partial-index covers exactly the lookup:
--   - filter (term, sitting, date) all in the index → no heap fetches for sort
--   - WHERE predicate restricts to the "Pkt. N" subset, so the index is small
--     and the regex doesn't run at query time (it's evaluated at insert/update
--     against the partial predicate).
--
-- Idempotent. Safe to re-apply.

create index if not exists votings_term_sitting_date_pkt_idx
  on votings(term, sitting, date)
  where title ~ '^Pkt\.\s+\d+';

comment on index votings_term_sitting_date_pkt_idx is
  'Powers agenda_point_title lateral in viral_quote_agenda_point view (mig 0092). Partial on Pkt-prefixed titles.';
