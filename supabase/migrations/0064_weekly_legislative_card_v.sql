-- 0064_weekly_legislative_card_v.sql
--
-- One-card-per-bill collapse of weekly votings.
--
-- vote_events_v emits one row per voting; many bills generate 5-6 vote rows
-- (poprawka 1..N + głosowanie nad całością) all sharing the same procedural
-- title ("Pkt N Sprawozdanie..."). This view groups by linked print and
-- surfaces:
--   * the decisive vote (final_passage / rejection / no_confidence) with
--     final_passed normalised so true == subject (bill / minister) survives
--   * an amendments tally (passed / rejected)
--   * the full per-vote list as jsonb for an expandable detail panel
--
-- Card subjects covered: projekt_ustawy, wotum_nieufnosci, uchwala_senatu.
--
-- Per (voting_id, document_category) dedup keeps the canonical print:
--   * for projekt_ustawy: original draft over sprawozdanie_komisji
--     (sprawozdanie_komisji is excluded from the allowlist anyway, but a
--     single voting can link to both — only the original survives)
--   * for wotum_nieufnosci: the wniosek (is_primary=true) over the opinia
--     komisji (is_primary=false) so the card headline is the actual motion
--   * for uchwala_senatu: the Senate resolution print itself
--
-- impact_punch is required for projekt_ustawy / uchwala_senatu (filters out
-- ungenriched cruft) but relaxed for wotum_nieufnosci because the original
-- motion typically has none — and we still want it as the headline.
--
-- Vote classification is by `topic` regex, not voting_stage_summary.stage_type
-- (which exposes raw process_stages values like 'Voting'/'CommitteeReport'
-- — useless for distinguishing rejection-motion from final-passage votes).

drop view if exists weekly_legislative_card_v;

create view weekly_legislative_card_v as
with link_dedup as (
  select distinct on (vpl.voting_id, pr.document_category)
    vpl.voting_id,
    vpl.print_id,
    vpl.role,
    pr.document_category
  from voting_print_links vpl
  join prints pr on pr.id = vpl.print_id
  where pr.document_category in ('projekt_ustawy', 'wotum_nieufnosci', 'uchwala_senatu')
    and coalesce(pr.is_meta_document, false) = false
    and (pr.document_category = 'wotum_nieufnosci' or pr.impact_punch is not null)
  order by vpl.voting_id, pr.document_category,
    coalesce(pr.is_primary, false) desc,
    case vpl.role
      when 'main' then 1 when 'sprawozdanie' then 2
      when 'joint' then 3 when 'autopoprawka' then 4
      else 9
    end,
    pr.id
),
vote_with_print as (
  select
    v.id              as voting_id,
    v.term,
    v.sitting         as sitting_num,
    v.sitting_day,
    v.date,
    v.voting_number,
    v.title,
    v.topic,
    v.yes, v.no, v.abstain, v.not_participating, v.total_voted,
    ld.print_id,
    ld.role,
    case
      when v.topic ilike '%odrzucenie%' and v.topic ilike '%całoś%' then 'rejection_total'
      when v.topic ilike '%odrzucenie%'                              then 'rejection'
      when v.topic ilike '%całoś%'                                   then 'final_passage'
      when v.topic ilike '%wotum%'                                   then 'no_confidence'
      when v.topic ilike '%popraw%'                                  then 'amendment'
      when v.topic ilike '%skierowanie%'                             then 'committee_referral'
      else 'other'
    end as vote_kind
  from votings v
  join link_dedup ld on ld.voting_id = v.id
),
ranked as (
  select *,
    case vote_kind
      when 'final_passage'      then 1
      when 'rejection_total'    then 2
      when 'rejection'          then 3
      when 'no_confidence'      then 4
      when 'committee_referral' then 5
      else 9
    end as decisive_rank
  from vote_with_print
),
final_vote as (
  select distinct on (term, sitting_num, print_id)
    term, sitting_num, print_id,
    voting_id, voting_number, yes, no, abstain, total_voted,
    topic, title, vote_kind, decisive_rank, role
  from ranked
  order by term, sitting_num, print_id, decisive_rank, voting_number desc
),
agg as (
  select term, sitting_num, print_id,
    count(*) filter (where vote_kind = 'amendment')               as n_amendments,
    count(*) filter (where vote_kind = 'amendment' and yes >  no) as n_amendments_passed,
    count(*) filter (where vote_kind = 'amendment' and yes <= no) as n_amendments_rejected,
    min(voting_number) as voting_number_first,
    max(voting_number) as voting_number_last,
    count(*)           as n_votings
  from vote_with_print
  group by 1,2,3
),
votings_json as (
  select term, sitting_num, print_id,
    jsonb_agg(jsonb_build_object(
      'voting_id',     voting_id,
      'voting_number', voting_number,
      'topic',         topic,
      'vote_kind',     vote_kind,
      'role',          role,
      'yes',           yes,
      'no',            no,
      'abstain',       abstain,
      'passed',        yes > no
    ) order by voting_number) as votings
  from vote_with_print
  group by 1,2,3
)
select
  fv.term,
  fv.sitting_num,
  fv.print_id,
  pr.number                        as print_number,
  pr.short_title,
  pr.title                         as print_title,
  pr.impact_punch,
  pr.summary_plain,
  pr.citizen_action,
  pr.affected_groups,
  pr.persona_tags,
  pr.topic_tags,
  pr.document_category,
  ph.homepage_score                as impact_score,

  case when fv.decisive_rank < 9 then fv.voting_id    end as final_voting_id,
  case when fv.decisive_rank < 9 then fv.voting_number end as final_voting_number,
  case when fv.decisive_rank < 9 then fv.vote_kind     end as final_vote_kind,
  case when fv.decisive_rank < 9 then fv.topic         end as final_topic,
  case when fv.decisive_rank < 9 then fv.yes           end as final_yes,
  case when fv.decisive_rank < 9 then fv.no            end as final_no,
  case when fv.decisive_rank < 9 then fv.abstain       end as final_abstain,
  case when fv.decisive_rank < 9 then fv.total_voted   end as final_total_voted,
  -- Normalised: final_passed = true means the SUBJECT survives/holds.
  --   final_passage: bill passes        → yes > no
  --   rejection:     bill survives      → no  > yes  (rejection motion failed)
  --   no_confidence: minister survives  → no  > yes  (wotum failed)
  case
    when fv.decisive_rank < 9 and fv.vote_kind in ('rejection','rejection_total','no_confidence')
      then fv.no > fv.yes
    when fv.decisive_rank < 9
      then fv.yes > fv.no
  end                              as final_passed,

  coalesce(a.n_amendments,          0) as n_amendments,
  coalesce(a.n_amendments_passed,   0) as n_amendments_passed,
  coalesce(a.n_amendments_rejected, 0) as n_amendments_rejected,

  a.voting_number_first,
  a.voting_number_last,
  a.n_votings,
  vj.votings                        as all_votings,

  ('/druk/' || fv.term || '/' || pr.number) as source_url
from final_vote fv
join agg a using (term, sitting_num, print_id)
join votings_json vj using (term, sitting_num, print_id)
join prints pr on pr.id = fv.print_id
left join print_homepage_score ph on ph.print_id = fv.print_id;

comment on view weekly_legislative_card_v is
  'One row per (term, sitting, print). Includes projekt_ustawy + wotum_nieufnosci + uchwala_senatu. Per (voting_id, document_category) dedup keeps the is_primary print so wotum-nieufnosci wniosek wins over opinia komisji. final_passed normalised: true = subject (bill / minister) survives.';
