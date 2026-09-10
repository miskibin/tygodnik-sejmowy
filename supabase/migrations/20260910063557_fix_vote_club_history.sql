-- Use the club recorded on each vote.  mp_club_membership is a term-level set
-- and cannot identify which of an MP's clubs applied on a given date.
-- A modal choice is meaningful only for at least five participating members
-- and when exactly one choice has the highest count.  Rows from smaller clubs
-- and tied club ballots are omitted rather than labelled aligned arbitrarily.
create or replace view public.mp_vote_discipline as
with choice_counts as (
  select
    v.voting_id,
    v.term,
    v.club_ref,
    v.vote,
    count(*)::integer as choice_count
  from public.votes v
  join public.votings vt on vt.id = v.voting_id
  where vt.kind = 'ELECTRONIC'::public.voting_kind
    and v.vote in (
      'YES'::public.vote_choice,
      'NO'::public.vote_choice,
      'ABSTAIN'::public.vote_choice
    )
    and v.club_ref is not null
  group by v.voting_id, v.term, v.club_ref, v.vote
), choice_stats as (
  select
    cc.*,
    sum(cc.choice_count) over (
      partition by cc.voting_id, cc.term, cc.club_ref
    ) as club_size,
    max(cc.choice_count) over (
      partition by cc.voting_id, cc.term, cc.club_ref
    ) as max_count
  from choice_counts cc
), club_modal as (
  select
    voting_id,
    term,
    club_ref,
    (array_agg(vote) filter (where choice_count = max_count))[1] as modal_choice
  from choice_stats
  group by voting_id, term, club_ref, club_size
  having club_size >= 5
     and count(*) filter (where choice_count = max_count) = 1
)
select
  v.voting_id,
  v.mp_id,
  v.term,
  c.id                    as club_id_at_vote,
  cm.modal_choice         as club_modal_choice,
  v.vote                  as mp_choice,
  (v.vote = cm.modal_choice) as aligned
from public.votes v
join club_modal cm
  on cm.voting_id = v.voting_id
 and cm.term = v.term
 and cm.club_ref = v.club_ref
join public.clubs c
  on c.term = v.term
 and c.club_id = v.club_ref
where v.vote in (
  'YES'::public.vote_choice,
  'NO'::public.vote_choice,
  'ABSTAIN'::public.vote_choice
);

comment on view public.mp_vote_discipline is
  'Per-vote-per-MP alignment against the unique club modal choice. Club at vote '
  'comes from votes.club_ref. Includes electronic YES/NO/ABSTAIN ballots only; '
  'excludes tied ballots and clubs with fewer than five participating members.';

-- Keep every adjacent club change.  The old rn_in_club=1 filter discarded a
-- later return to a previously represented club (for example A -> B -> A).
create or replace function public.detect_mp_club_transitions(p_term integer)
returns table (
  mp_id integer,
  change_date date,
  from_club_short text,
  to_club_short text
)
language sql
stable
as $$
  with sorted_votes as (
    select
      v.mp_id,
      vt.id as voting_id,
      vt.date::date as voting_date,
      v.club_ref as club_short,
      lag(v.club_ref) over (
        partition by v.mp_id order by vt.date, vt.id
      ) as prev_club
    from public.votes v
    join public.votings vt on vt.id = v.voting_id
    where vt.term = p_term
      and v.club_ref is not null
  ), transitions as (
    select mp_id, voting_id, voting_date, prev_club, club_short
    from sorted_votes
    where prev_club is distinct from club_short
  )
  select distinct on (mp_id, voting_date, club_short)
    mp_id,
    voting_date as change_date,
    prev_club as from_club_short,
    club_short as to_club_short
  from transitions
  order by mp_id, voting_date, club_short, voting_id;
$$;

comment on function public.detect_mp_club_transitions(integer) is
  'Returns the initial club and every adjacent club transition per MP, including returns to a previous club.';

alter function public.detect_mp_club_transitions(integer) set statement_timeout = '60s';

-- Detect watermarks created by the old "votes array is non-empty" predicate
-- without transferring every full ballot JSON document through PostgREST.
create or replace function public.incomplete_staged_votings(p_term integer)
returns table (natural_id text)
language sql
stable
security invoker
as $$
  select s.natural_id
  from public._stage_votings s
  where s.term = p_term
    and not case
      when jsonb_typeof(s.payload->'votes') = 'array'
       and jsonb_typeof(s.payload->'totalVoted') = 'number'
       and jsonb_typeof(s.payload->'notParticipating') = 'number'
      then jsonb_array_length(s.payload->'votes')
             = (s.payload->>'totalVoted')::integer + (s.payload->>'notParticipating')::integer
       and (select count(*) from jsonb_array_elements(s.payload->'votes') row
            where row->>'vote' = 'ABSENT') = (s.payload->>'notParticipating')::integer
       and (select count(*) from jsonb_array_elements(s.payload->'votes') row
            where row->>'vote' <> 'ABSENT') = (s.payload->>'totalVoted')::integer
      else false
    end;
$$;

revoke all on function public.incomplete_staged_votings(integer) from public;
grant select on table public._stage_votings to service_role;
grant execute on function public.incomplete_staged_votings(integer) to service_role;

comment on function public.incomplete_staged_votings(integer) is
  'Service-role ETL repair helper: returns only natural IDs of staged ballots whose vote rows disagree with participation totals.';
