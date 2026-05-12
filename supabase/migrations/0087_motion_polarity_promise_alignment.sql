-- 0087_motion_polarity_promise_alignment.sql
--
-- Why: a Sejm voting's vote_choice is meaningless without knowing what the
-- motion *was*. NO on "wniosek o odrzucenie projektu" is pro-bill (refuses
-- to reject); NO on "głosowanie nad całością projektu" is anti-bill. The
-- frontend Tab4PromisesPanel was painting MPs "opposed" whenever they
-- voted NO — wrong half the time for reject motions.
--
-- This migration adds:
--   1. votings.motion_polarity     — enum-like text (CHECK), inferred from
--                                    votings.topic via deterministic regex.
--                                    NULL = ambiguous; surfaced as neutral.
--   2. promises.stance             — pro_bill (default) / anti_bill. Curators
--                                    flip for "we will repeal X" promises.
--   3. compute_promise_alignment() — pure SQL function: single source of
--                                    truth for the (vote, polarity, stance)
--                                    → aligned/opposed/neutral/absent table.
--   4. votings_set_motion_polarity_trigger — autoclassify on insert/update.
--   5. voting_promise_link_mv      — recreated with motion_polarity +
--                                    promise_stance projected, so frontend
--                                    can compute alignment without extra joins.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP MATERIALIZED VIEW IF EXISTS + recreate. Safe to re-run.

-- ─── 1. votings.motion_polarity ───────────────────────────────────────────
alter table votings
  add column if not exists motion_polarity text;

do $$ begin
  -- Drop+add CHECK so re-runs after enum tweak don't fail.
  alter table votings drop constraint if exists votings_motion_polarity_check;
  alter table votings add constraint votings_motion_polarity_check
    check (motion_polarity is null or motion_polarity in
           ('pass','reject','amendment','procedural','minority'));
end $$;

comment on column votings.motion_polarity is
  'Bill-advancement polarity inferred from votings.topic. '
  'pass = vote on whole bill; reject = wniosek o odrzucenie; '
  'amendment = poprawka; minority = wniosek mniejszości; '
  'procedural = kworum/kandydatura/etc. NULL = ambiguous (frontend → neutral).';

create index if not exists votings_motion_polarity_idx
  on votings(motion_polarity)
  where motion_polarity is not null;

-- ─── 2. promises.stance ───────────────────────────────────────────────────
alter table promises
  add column if not exists stance text not null default 'pro_bill';

do $$ begin
  alter table promises drop constraint if exists promises_stance_check;
  alter table promises add constraint promises_stance_check
    check (stance in ('pro_bill','anti_bill'));
end $$;

comment on column promises.stance is
  'Promise intent. pro_bill = "we will pass X" (manifesto norm). '
  'anti_bill = "we will repeal/block X". Curator-flipped per row.';

-- ─── 3. classifier (regex on topic) ───────────────────────────────────────
-- Single canonical place for the rule. Mirrored in
-- supagraf/backfill/motion_polarity.py for re-runs after pattern tweaks.
create or replace function classify_motion_polarity(p_topic text)
returns text language sql immutable as $$
  select case
    when p_topic is null or btrim(p_topic) = '' then null
    when lower(p_topic) ~ 'wniosek o odrzuceni|wniosku o odrzuceni|odrzuceni[ea] (projekt|ustaw)'
      then 'reject'
    when lower(p_topic) ~ 'wniosek mniejszo|wnioski mniejszo|wniosku mniejszo'
      then 'minority'
    when lower(p_topic) ~ '^poprawk|^poprawce|^poprawki|^poprawkę'
      then 'amendment'
    when lower(p_topic) ~ 'całość projekt|całości projekt|głosowanie nad całością|całość ustaw'
      then 'pass'
    when lower(p_topic) ~ 'głosowanie kworum|kandydatur|wybór |powołani[ea]|odwołani[ea]|wniosek o przerw|wniosek o uzupełni|porządek dzienn|porządku dzienn|reasumpcj'
      then 'procedural'
    else null
  end;
$$;

comment on function classify_motion_polarity(text) is
  'Deterministic regex classifier for votings.topic → motion_polarity. '
  'NULL on ambiguous (NOT a "default to pass") to avoid false alignment claims.';

-- ─── 4. alignment function (single source of truth) ───────────────────────
create or replace function compute_promise_alignment(
  v_vote vote_choice,
  v_polarity text,
  v_stance text
) returns text language sql immutable as $$
  select case
    when v_vote in ('ABSENT','PRESENT') then 'absent'
    when v_vote = 'ABSTAIN' then 'neutral'
    when v_polarity is null
      or v_polarity in ('amendment','procedural','minority')
      then 'neutral'
    when (v_polarity = 'pass'   and v_vote = 'YES')
      or (v_polarity = 'reject' and v_vote = 'NO')
      then case v_stance when 'pro_bill' then 'aligned' else 'opposed' end
    else
      case v_stance when 'pro_bill' then 'opposed' else 'aligned' end
  end;
$$;

comment on function compute_promise_alignment(vote_choice, text, text) is
  'aligned | opposed | neutral | absent — Frontend mirrors this in '
  'frontend/lib/promiseAlignment.ts; the SQL is canonical.';

-- ─── 5. trigger: autoclassify new/updated votings ─────────────────────────
create or replace function votings_set_motion_polarity()
returns trigger language plpgsql as $$
begin
  -- Only set when NULL or topic changed; never overwrite manual curation
  -- (manual ops can mark via direct UPDATE; the trigger respects existing
  -- values when topic is unchanged).
  if (tg_op = 'INSERT')
     or (new.topic is distinct from old.topic)
     or (new.motion_polarity is null) then
    new.motion_polarity := classify_motion_polarity(new.topic);
  end if;
  return new;
end $$;

drop trigger if exists votings_motion_polarity_trg on votings;
create trigger votings_motion_polarity_trg
  before insert or update of topic on votings
  for each row execute function votings_set_motion_polarity();

-- ─── 6. backfill existing rows ────────────────────────────────────────────
update votings
   set motion_polarity = classify_motion_polarity(topic)
 where motion_polarity is distinct from classify_motion_polarity(topic);

-- ─── 7. recreate MV with polarity + stance projected ──────────────────────
drop materialized view if exists voting_promise_link_mv cascade;

create materialized view voting_promise_link_mv as
select distinct on (vpl.voting_id, ppc.promise_id)
  v.term,
  vpl.voting_id,
  v.motion_polarity,
  ppc.promise_id,
  pr.party_code,
  pr.stance        as promise_stance,
  ppc.match_status,
  p.id             as print_id,
  p.short_title    as print_short_title
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

-- refresh fn from 0065 unchanged; concurrent refresh works thanks to PK index
create or replace function refresh_voting_promise_link() returns void
language plpgsql as $$
begin
  refresh materialized view concurrently voting_promise_link_mv;
end;
$$;

refresh materialized view voting_promise_link_mv;

comment on materialized view voting_promise_link_mv is
  'Voting ↔ promise bridge via confirmed promise_print_candidates. '
  'Carries motion_polarity + promise_stance so consumers can compute '
  'alignment via compute_promise_alignment(vote, polarity, stance) '
  'without re-joining votings/promises.';
