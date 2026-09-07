-- 0107 — ON_LIST votings (elections of the Marshal etc.) arrive without
-- `topic` upstream; `votings.topic` is NOT NULL, so load_votings aborted on
-- them and the whole sitting's votings never loaded. Fall back to the title.
-- Body otherwise identical to 0002_core_load_fns.sql.
create or replace function public.load_votings(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  insert into votings(term, sitting, sitting_day, voting_number, date, title,
                      topic, description, kind, majority_type, majority_votes,
                      yes, no, abstain, present, not_participating,
                      total_voted, source_path, staged_at, loaded_at)
  select
    s.term,
    (s.payload->>'sitting')::integer,
    (s.payload->>'sittingDay')::integer,
    (s.payload->>'votingNumber')::integer,
    (s.payload->>'date')::timestamptz,
    s.payload->>'title',
    coalesce(s.payload->>'topic', s.payload->>'title'),
    s.payload->>'description',
    (s.payload->>'kind')::voting_kind,
    (s.payload->>'majorityType')::majority_type,
    (s.payload->>'majorityVotes')::integer,
    (s.payload->>'yes')::integer,
    (s.payload->>'no')::integer,
    (s.payload->>'abstain')::integer,
    (s.payload->>'present')::integer,
    (s.payload->>'notParticipating')::integer,
    (s.payload->>'totalVoted')::integer,
    s.source_path,
    s.staged_at,
    now()
  from _stage_votings s
  where s.term = p_term
  on conflict (term, sitting, voting_number) do update set
    sitting_day = excluded.sitting_day,
    date = excluded.date,
    title = excluded.title,
    topic = excluded.topic,
    description = excluded.description,
    kind = excluded.kind,
    majority_type = excluded.majority_type,
    majority_votes = excluded.majority_votes,
    yes = excluded.yes,
    no = excluded.no,
    abstain = excluded.abstain,
    present = excluded.present,
    not_participating = excluded.not_participating,
    total_voted = excluded.total_voted,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;
  return affected;
end $$;
