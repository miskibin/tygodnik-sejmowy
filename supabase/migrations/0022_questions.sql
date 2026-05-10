-- 0022_questions.sql
-- E1: Sejm questions (interpellations + writtenQuestions, polymorphic).
--
-- Audit (1066 entity files = 632 interpellation + 434 written, term=10 only):
--   * num: inter 14441..15086, written 3011..3444, no overlap (UNIQUE (term,kind,num))
--   * from[]: 286 distinct mp ids; ALL resolve in mps(term=10) -> hard FK, no queue
--   * Reply.key absent in 300/1181 (prolongation entries) -> nullable
--   * Reply.attachments absent in 426/1181 -> 0..N
--   * recipientDetails[] mirrors to[] but with sent date + delay
--   * repeatedInterpellation[] preserved as jsonb on questions row (informational)
--
-- Design:
--   * questions: top-level row; UNIQUE (term, kind, num); kind set by stage from source dir.
--   * question_authors: M:N to mps via composite (term, mp_id); hard FK.
--   * question_recipients: 1:N detail with sent date.
--   * question_replies: 1:N; key may be NULL (prolongation entries).
--   * question_reply_attachments: 1:N from replies.
--   * question_links: polymorphic over questions|replies; orphan invariant tracks integrity.
--   * No unresolved queue: all from[] ids resolve cleanly in current data.

-- ---------- questions ----------
create table if not exists questions (
  id                    bigserial primary key,
  term                  integer not null references terms(term),
  kind                  text    not null,
  num                   integer not null,
  title                 text    not null,
  sent_date             date,
  receipt_date          date,
  last_modified         timestamptz,
  answer_delayed_days   integer,
  recipient_titles      text[]  not null,                  -- raw `to[]` array
  repeated_interpellation jsonb,                           -- preserved as-is (23 docs)
  source_path           text,
  staged_at             timestamptz,
  loaded_at             timestamptz not null default now(),
  unique (term, kind, num),
  check (term > 0),
  check (kind in ('interpellation','written'))
);
create index if not exists questions_term_idx on questions(term);
create index if not exists questions_term_kind_idx on questions(term, kind);

-- ---------- question_authors (M:N to mps) ----------
-- Composite hard FK to mps(term, mp_id) — mirrors committee_members.
create table if not exists question_authors (
  id            bigserial primary key,
  question_id   bigint  not null references questions(id) on delete cascade,
  mp_id         integer not null,
  term          integer not null,
  loaded_at     timestamptz not null default now(),
  unique (question_id, mp_id),
  foreign key (term, mp_id) references mps(term, mp_id) on delete restrict
);
create index if not exists question_authors_question_idx on question_authors(question_id);
create index if not exists question_authors_mp_idx on question_authors(term, mp_id);

-- ---------- question_recipients ----------
-- Free-text minister title + sent date. NOT FK (no clean person/dept id in API).
create table if not exists question_recipients (
  id                    bigserial primary key,
  question_id           bigint  not null references questions(id) on delete cascade,
  ord                   integer not null,
  name                  text    not null,
  sent_date             date,
  answer_delayed_days   integer,
  unique (question_id, ord)
);
create index if not exists question_recipients_question_idx on question_recipients(question_id);

-- ---------- question_replies ----------
-- key is the natural API id within a question (e.g. 'DS8KLF') BUT it's NULL
-- for prolongation entries (300/1181). UNIQUE includes key, but partial idx
-- enforces uniqueness only when present; multiple prolongations per question
-- are possible (rare in current data but allowed).
create table if not exists question_replies (
  id              bigserial primary key,
  question_id     bigint  not null references questions(id) on delete cascade,
  ord             integer not null,                        -- preserve order
  key             text,                                    -- nullable: prolongation has none
  from_text       text    not null,                        -- free-text "Sekretarz stanu ..."
  only_attachment boolean not null,
  prolongation    boolean not null,
  receipt_date    date,
  last_modified   timestamptz,
  loaded_at       timestamptz not null default now(),
  unique (question_id, ord)
);
create unique index if not exists question_replies_qid_key_uq
  on question_replies(question_id, key) where key is not null;
create index if not exists question_replies_question_idx on question_replies(question_id);

-- ---------- question_reply_attachments ----------
create table if not exists question_reply_attachments (
  id              bigserial primary key,
  reply_id        bigint  not null references question_replies(id) on delete cascade,
  ord             integer not null,
  name            text    not null,
  url             text    not null,
  last_modified   timestamptz,
  unique (reply_id, ord)
);
create index if not exists question_reply_attachments_reply_idx on question_reply_attachments(reply_id);

-- ---------- question_links (polymorphic question|reply) ----------
-- No FK due to polymorphism; orphan invariants below enforce integrity.
create table if not exists question_links (
  id           bigserial primary key,
  parent_kind  text    not null,
  parent_id    bigint  not null,
  ord          integer not null,
  href         text    not null,
  rel          text,
  check (parent_kind in ('question','reply'))
);
create index if not exists question_links_parent_idx on question_links(parent_kind, parent_id);

-- ---------- raw stage table ----------
-- Single staging table for both kinds; kind set per-row at stage time.
create table if not exists _stage_questions (
  id          bigserial primary key,
  term        integer not null,
  kind        text    not null check (kind in ('interpellation','written')),
  natural_id  text    not null,                            -- '<kind>:<num>'
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

-- ---------- load_questions ----------
-- Atomic. Pipeline:
--   1) upsert questions
--   2) replace-all authors (snapshot semantics)
--   3) replace-all recipients
--   4) replace-all replies + reply attachments + reply links + question links
-- Hard FK on authors enforced by referenced FK constraint.
create or replace function load_questions(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  -- 1) questions
  insert into questions(
    term, kind, num, title,
    sent_date, receipt_date, last_modified, answer_delayed_days,
    recipient_titles, repeated_interpellation,
    source_path, staged_at, loaded_at
  )
  select
    s.term,
    s.kind,
    (s.payload->>'num')::integer,
    s.payload->>'title',
    nullif(s.payload->>'sentDate','')::date,
    nullif(s.payload->>'receiptDate','')::date,
    nullif(s.payload->>'lastModified','')::timestamptz,
    nullif(s.payload->>'answerDelayedDays','')::integer,
    case when s.payload ? 'to'
         then array(select jsonb_array_elements_text(s.payload->'to'))
         else array[]::text[] end,
    s.payload->'repeatedInterpellation',
    s.source_path,
    s.staged_at,
    now()
  from _stage_questions s
  where s.term = p_term
  on conflict (term, kind, num) do update set
    title = excluded.title,
    sent_date = excluded.sent_date,
    receipt_date = excluded.receipt_date,
    last_modified = excluded.last_modified,
    answer_delayed_days = excluded.answer_delayed_days,
    recipient_titles = excluded.recipient_titles,
    repeated_interpellation = excluded.repeated_interpellation,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;

  -- 2) authors: replace-all per term
  delete from question_authors qa
  using questions q
  where qa.question_id = q.id and q.term = p_term;

  insert into question_authors(question_id, term, mp_id)
  select
    q.id,
    q.term,
    (fid::text)::integer
  from _stage_questions s
  join questions q on q.term = s.term and q.kind = s.kind
                  and q.num = (s.payload->>'num')::integer
  cross join lateral jsonb_array_elements_text(coalesce(s.payload->'from','[]'::jsonb)) as fid
  where s.term = p_term
  on conflict (question_id, mp_id) do nothing;

  -- 3) recipients: replace-all
  delete from question_recipients qr
  using questions q
  where qr.question_id = q.id and q.term = p_term;

  insert into question_recipients(question_id, ord, name, sent_date, answer_delayed_days)
  select
    q.id,
    (rd.ord - 1)::integer,
    rd.elem->>'name',
    nullif(rd.elem->>'sent','')::date,
    nullif(rd.elem->>'answerDelayedDays','')::integer
  from _stage_questions s
  join questions q on q.term = s.term and q.kind = s.kind
                  and q.num = (s.payload->>'num')::integer
  cross join lateral jsonb_array_elements(coalesce(s.payload->'recipientDetails','[]'::jsonb))
              with ordinality as rd(elem, ord)
  where s.term = p_term;

  -- 4a) wipe existing replies/attachments/links for this term (cascades attachments,
  --     question_links rows for replies are wiped explicitly below since they have no FK).
  delete from question_links ql
  using questions q
  where ql.parent_kind = 'reply'
    and ql.parent_id in (
      select id from question_replies qr
      join questions q2 on q2.id = qr.question_id
      where q2.term = p_term
    );
  delete from question_links ql
  using questions q
  where ql.parent_kind = 'question'
    and ql.parent_id = q.id and q.term = p_term;
  delete from question_replies qr
  using questions q
  where qr.question_id = q.id and q.term = p_term;

  -- 4b) replies (one row per replies[] entry); attachments come via insert below
  insert into question_replies(
    question_id, ord, key, from_text, only_attachment, prolongation,
    receipt_date, last_modified
  )
  select
    q.id,
    (r.ord - 1)::integer,
    r.elem->>'key',
    r.elem->>'from',
    (r.elem->>'onlyAttachment')::boolean,
    (r.elem->>'prolongation')::boolean,
    nullif(r.elem->>'receiptDate','')::date,
    nullif(r.elem->>'lastModified','')::timestamptz
  from _stage_questions s
  join questions q on q.term = s.term and q.kind = s.kind
                  and q.num = (s.payload->>'num')::integer
  cross join lateral jsonb_array_elements(coalesce(s.payload->'replies','[]'::jsonb))
              with ordinality as r(elem, ord)
  where s.term = p_term;

  -- 4c) reply attachments
  insert into question_reply_attachments(reply_id, ord, name, url, last_modified)
  select
    qr.id,
    (a.ord - 1)::integer,
    a.elem->>'name',
    a.elem->>'URL',
    nullif(a.elem->>'lastModified','')::timestamptz
  from _stage_questions s
  join questions q on q.term = s.term and q.kind = s.kind
                  and q.num = (s.payload->>'num')::integer
  cross join lateral jsonb_array_elements(coalesce(s.payload->'replies','[]'::jsonb))
              with ordinality as r(elem, ord)
  join question_replies qr on qr.question_id = q.id and qr.ord = (r.ord - 1)::integer
  cross join lateral jsonb_array_elements(coalesce(r.elem->'attachments','[]'::jsonb))
              with ordinality as a(elem, ord)
  where s.term = p_term;

  -- 4d) question-level links (parent_kind='question')
  insert into question_links(parent_kind, parent_id, ord, href, rel)
  select
    'question',
    q.id,
    (l.ord - 1)::integer,
    l.elem->>'href',
    l.elem->>'rel'
  from _stage_questions s
  join questions q on q.term = s.term and q.kind = s.kind
                  and q.num = (s.payload->>'num')::integer
  cross join lateral jsonb_array_elements(coalesce(s.payload->'links','[]'::jsonb))
              with ordinality as l(elem, ord)
  where s.term = p_term;

  -- 4e) reply-level links (parent_kind='reply')
  insert into question_links(parent_kind, parent_id, ord, href, rel)
  select
    'reply',
    qr.id,
    (l.ord - 1)::integer,
    l.elem->>'href',
    l.elem->>'rel'
  from _stage_questions s
  join questions q on q.term = s.term and q.kind = s.kind
                  and q.num = (s.payload->>'num')::integer
  cross join lateral jsonb_array_elements(coalesce(s.payload->'replies','[]'::jsonb))
              with ordinality as r(elem, ord)
  join question_replies qr on qr.question_id = q.id and qr.ord = (r.ord - 1)::integer
  cross join lateral jsonb_array_elements(coalesce(r.elem->'links','[]'::jsonb))
              with ordinality as l(elem, ord)
  where s.term = p_term;

  return affected;
end $$;

-- ---------- assert_invariants extension ----------
-- Append questions fields. Existing fields preserved verbatim from 0021.
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
    'print_cycles_count', process_edge_cycle_count(p_term),
    'committees_total',
        (select count(*) from committees where term = p_term),
    'committees_first_class',
        (select count(*) from committees where term = p_term and not is_stub),
    'committees_stub',
        (select count(*) from committees where term = p_term and is_stub),
    'committee_members_total',
        (select count(*) from committee_members where term = p_term),
    'committee_member_orphans',
        (select count(*) from committee_members cm
         left join mps m on m.term = cm.term and m.mp_id = cm.mp_id
         where cm.term = p_term and m.id is null),
    'committee_subcommittees_total',
        (select count(*) from committee_subcommittees sub
         join committees p on p.id = sub.parent_id
         where p.term = p_term),
    'committee_subcommittee_self_refs',
        (select count(*) from committee_subcommittees where parent_id = child_id),
    'processes_total',
        (select count(*) from processes where term = p_term),
    'process_stages_total',
        (select count(*) from process_stages ps
         join processes p on p.id = ps.process_id
         where p.term = p_term),
    'process_stages_orphan_committee',
        (select count(*) from process_stages ps
         join processes p on p.id = ps.process_id
         where p.term = p_term
           and ps.committee_code is not null
           and ps.committee_id is null),
    'process_stages_resolved_print_count',
        (select count(*) from process_stages ps
         join processes p on p.id = ps.process_id
         where p.term = p_term and ps.print_id is not null),
    'process_stages_unresolved_print_count',
        (select count(*) from process_stages ps
         join processes p on p.id = ps.process_id
         where p.term = p_term and ps.print_number is not null and ps.print_id is null),
    'process_stage_cycles_count', process_stage_cycle_count(p_term),
    'unresolved_process_print_refs_open',
        (select count(*) from unresolved_process_print_refs
         where term = p_term and resolved_at is null),
    -- questions (added in 0022)
    'questions_total',
        (select count(*) from questions where term = p_term),
    'questions_interpellation',
        (select count(*) from questions where term = p_term and kind = 'interpellation'),
    'questions_written',
        (select count(*) from questions where term = p_term and kind = 'written'),
    'question_authors_total',
        (select count(*) from question_authors qa
         join questions q on q.id = qa.question_id
         where q.term = p_term),
    'question_author_orphans',
        (select count(*) from question_authors qa
         left join mps m on m.term = qa.term and m.mp_id = qa.mp_id
         join questions q on q.id = qa.question_id
         where q.term = p_term and m.id is null),
    'question_recipients_total',
        (select count(*) from question_recipients qr
         join questions q on q.id = qr.question_id
         where q.term = p_term),
    'question_replies_total',
        (select count(*) from question_replies qr
         join questions q on q.id = qr.question_id
         where q.term = p_term),
    'question_reply_attachments_total',
        (select count(*) from question_reply_attachments qra
         join question_replies qr on qr.id = qra.reply_id
         join questions q on q.id = qr.question_id
         where q.term = p_term),
    'question_links_total',
        (select count(*) from question_links ql
         where (ql.parent_kind = 'question'
                and ql.parent_id in (select id from questions where term = p_term))
            or (ql.parent_kind = 'reply'
                and ql.parent_id in (select qr.id from question_replies qr
                                     join questions q on q.id = qr.question_id
                                     where q.term = p_term))),
    'question_link_orphans_question',
        (select count(*) from question_links ql
         where ql.parent_kind = 'question'
           and not exists (select 1 from questions q where q.id = ql.parent_id)),
    'question_link_orphans_reply',
        (select count(*) from question_links ql
         where ql.parent_kind = 'reply'
           and not exists (select 1 from question_replies qr where qr.id = ql.parent_id))
  ) into result;
  return result;
end $$;
