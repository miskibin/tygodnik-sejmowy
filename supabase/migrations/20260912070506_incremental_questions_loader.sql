-- Remove an uncorrelated DELETE join from the full loader. Signature/grants stay.
-- Add an incremental loader preserving unchanged questions and child identities.
-- Rollback: restore load_questions from the prior migration; stop selecting the
-- incremental function in Python. No table schema or stored data format changes.
CREATE OR REPLACE FUNCTION public.load_questions(p_term integer DEFAULT 10)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
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
  where ql.parent_kind = 'reply'
    and ql.parent_id in (
      select qr.id from question_replies qr
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
end $function$;

CREATE OR REPLACE FUNCTION public.load_questions_changed(p_term integer DEFAULT 10)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  affected integer;
begin
  -- Snapshot changed sources; replace their children in the same transaction.
  create temporary table supagraf_questions_delta on commit drop as
  select s.* from public._stage_questions s
  left join public.questions q on q.term = s.term and q.kind = s.kind
    and q.num = (s.payload->>'num')::integer
  where s.term = p_term and (q.id is null or q.staged_at is distinct from s.staged_at);
  select count(*) into affected from pg_temp.supagraf_questions_delta;
  if affected = 0 then
    drop table pg_temp.supagraf_questions_delta;
    return 0;
  end if;
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
  from pg_temp.supagraf_questions_delta s
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
  where qa.question_id = q.id and q.term = p_term and exists (select 1 from pg_temp.supagraf_questions_delta d where d.term = q.term and d.kind = q.kind and (d.payload->>'num')::integer = q.num);

  insert into question_authors(question_id, term, mp_id)
  select
    q.id,
    q.term,
    (fid::text)::integer
  from pg_temp.supagraf_questions_delta s
  join questions q on q.term = s.term and q.kind = s.kind
                  and q.num = (s.payload->>'num')::integer
  cross join lateral jsonb_array_elements_text(coalesce(s.payload->'from','[]'::jsonb)) as fid
  where s.term = p_term
  on conflict (question_id, mp_id) do nothing;

  -- 3) recipients: replace-all
  delete from question_recipients qr
  using questions q
  where qr.question_id = q.id and q.term = p_term and exists (select 1 from pg_temp.supagraf_questions_delta d where d.term = q.term and d.kind = q.kind and (d.payload->>'num')::integer = q.num);

  insert into question_recipients(question_id, ord, name, sent_date, answer_delayed_days)
  select
    q.id,
    (rd.ord - 1)::integer,
    rd.elem->>'name',
    nullif(rd.elem->>'sent','')::date,
    nullif(rd.elem->>'answerDelayedDays','')::integer
  from pg_temp.supagraf_questions_delta s
  join questions q on q.term = s.term and q.kind = s.kind
                  and q.num = (s.payload->>'num')::integer
  cross join lateral jsonb_array_elements(coalesce(s.payload->'recipientDetails','[]'::jsonb))
              with ordinality as rd(elem, ord)
  where s.term = p_term;

  -- 4a) wipe existing replies/attachments/links for this term (cascades attachments,
  --     question_links rows for replies are wiped explicitly below since they have no FK).
  delete from question_links ql
  where ql.parent_kind = 'reply'
    and ql.parent_id in (
      select qr.id from question_replies qr
      join questions q2 on q2.id = qr.question_id
      where q2.term = p_term and exists (select 1 from pg_temp.supagraf_questions_delta d where d.term = q2.term and d.kind = q2.kind and (d.payload->>'num')::integer = q2.num)
    );
  delete from question_links ql
  using questions q
  where ql.parent_kind = 'question'
    and ql.parent_id = q.id and q.term = p_term and exists (select 1 from pg_temp.supagraf_questions_delta d where d.term = q.term and d.kind = q.kind and (d.payload->>'num')::integer = q.num);
  delete from question_replies qr
  using questions q
  where qr.question_id = q.id and q.term = p_term and exists (select 1 from pg_temp.supagraf_questions_delta d where d.term = q.term and d.kind = q.kind and (d.payload->>'num')::integer = q.num);

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
  from pg_temp.supagraf_questions_delta s
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
  from pg_temp.supagraf_questions_delta s
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
  from pg_temp.supagraf_questions_delta s
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
  from pg_temp.supagraf_questions_delta s
  join questions q on q.term = s.term and q.kind = s.kind
                  and q.num = (s.payload->>'num')::integer
  cross join lateral jsonb_array_elements(coalesce(s.payload->'replies','[]'::jsonb))
              with ordinality as r(elem, ord)
  join question_replies qr on qr.question_id = q.id and qr.ord = (r.ord - 1)::integer
  cross join lateral jsonb_array_elements(coalesce(r.elem->'links','[]'::jsonb))
              with ordinality as l(elem, ord)
  where s.term = p_term;

  drop table pg_temp.supagraf_questions_delta;
  return affected;
end $function$;

REVOKE ALL ON FUNCTION public.load_questions_changed(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_questions_changed(integer) TO service_role;
NOTIFY pgrst, 'reload schema';
