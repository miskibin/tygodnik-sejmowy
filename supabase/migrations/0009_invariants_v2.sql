-- 0009_invariants_v2.sql
-- Extend assert_invariants with prints relationships counts + cycle invariant.
-- Existing fields preserved verbatim; new fields appended.

create or replace function assert_invariants(p_term integer default 10)
returns jsonb language plpgsql stable as $$
declare result jsonb;
begin
  with vsizes as (
    select voting_id, count(*) n from votes group by voting_id
  ),
  agg as (
    select voting_id,
      count(*) filter (where vote='YES')      as yes_a,
      count(*) filter (where vote='NO')       as no_a,
      count(*) filter (where vote='ABSTAIN')  as abstain_a,
      count(*) filter (where vote='PRESENT')  as present_a,
      count(*) filter (where vote='ABSENT')   as absent_a,
      count(*)                                as total_a
    from votes group by voting_id
  ),
  mismatches as (
    select count(*) filter (where v.yes <> a.yes_a)                         as yes_mismatch,
           count(*) filter (where v.no <> a.no_a)                           as no_mismatch,
           count(*) filter (where v.abstain <> a.abstain_a)                 as abstain_mismatch,
           count(*) filter (where v.present <> a.present_a)                 as present_mismatch,
           count(*) filter (where v.not_participating <> a.absent_a)        as not_participating_mismatch,
           count(*) filter (where v.total_voted <> (a.yes_a+a.no_a+a.abstain_a+a.present_a)) as total_voted_mismatch
    from votings v join agg a on a.voting_id = v.id
    where v.term = p_term
  )
  select jsonb_build_object(
    'mps_total',          (select count(*) from mps where term = p_term),
    'clubs_total',        (select count(*) from clubs where term = p_term),
    'inferred_clubs',     (select count(*) from clubs where term = p_term and is_inferred),
    'votings_total',      (select count(*) from votings where term = p_term),
    'votes_total',        (select count(*) from votes where term = p_term),
    'memberships_total',  (select count(*) from mp_club_membership where term = p_term),
    'mps_with_multiple_memberships',
        (select count(*) from (select mp_id from mp_club_membership
                               where term = p_term group by mp_id
                               having count(*) > 1) x),
    'distinct_mps_voted', (select count(distinct mp_id) from votes where term = p_term),
    'orphan_votes_no_voting',
        (select count(*) from votes v
         left join votings vt on vt.id = v.voting_id
         where v.term = p_term and vt.id is null),
    'orphan_votes_no_mp',
        (select count(*) from votes v
         left join mps m on m.term = v.term and m.mp_id = v.mp_id
         where v.term = p_term and m.id is null),
    'orphan_membership_no_mp',
        (select count(*) from mp_club_membership x
         left join mps m on m.term = x.term and m.mp_id = x.mp_id
         where x.term = p_term and m.id is null),
    'orphan_membership_no_club',
        (select count(*) from mp_club_membership x
         left join clubs c on c.term = x.term and c.club_id = x.club_id
         where x.term = p_term and c.id is null),
    'votings_where_yes_no_abstain_present_neq_total_voted',
        (select count(*) from votings v
         where v.term = p_term and (v.yes+v.no+v.abstain+v.present) <> v.total_voted),
    'votings_where_total_voted_plus_not_participating_neq_voting_size',
        (select count(*) from votings v
         left join vsizes vs on vs.voting_id = v.id
         where v.term = p_term and vs.n is not null
           and (v.total_voted + v.not_participating) <> vs.n),
    'tally_mismatches', (select to_jsonb(m.*) from mismatches m),
    'min_voting_date',  (select min(date) from votings where term = p_term),
    'max_voting_date',  (select max(date) from votings where term = p_term),
    -- prints fields (added in 0009)
    'prints_total',
        (select count(*) from prints where term = p_term),
    'prints_primary_count',
        (select count(*) from prints where term = p_term and is_primary),
    'prints_additional_count',
        (select count(*) from prints where term = p_term and is_additional),
    'print_relationships_total',
        (select count(*) from print_relationships where term = p_term),
    'unresolved_print_refs_open',
        (select count(*) from unresolved_print_refs where term = p_term and resolved_at is null),
    'prints_additional_orphan',
        (select count(*) from prints c
         where c.term = p_term and c.is_additional
           and not exists (
             select 1 from prints p
             where p.term = c.term and p.number = c.parent_number
           )),
    'print_cycles_count', process_edge_cycle_count(p_term)
  ) into result;
  return result;
end $$;
