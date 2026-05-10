-- 0007_prints.sql
-- Sejm prints (legislative documents) and their attachment metadata.
-- Phase A: only metadata. Hashes/disk verification belong to Phase B,
-- enrichment (summary, embeddings, stance) to Phase C.
-- Idempotent. Independent of mps/clubs/votings (no FKs into them).

-- ---------- prints ----------
create table if not exists prints (
  id              bigserial primary key,
  term            integer not null references terms(term),
  number          text    not null,                  -- '2074', '1988-A', '2082-A'
  title           text    not null,
  change_date     timestamptz not null,
  delivery_date   date    not null,
  document_date   date    not null,
  process_print   text[]  not null default '{}',     -- referenced process numbers
  source_path     text,
  staged_at       timestamptz,
  loaded_at       timestamptz not null default now(),
  unique (term, number)
);
create index if not exists prints_term_idx on prints(term);
create index if not exists prints_delivery_date_idx on prints(delivery_date);

-- ---------- print_attachments (filename metadata only) ----------
create table if not exists print_attachments (
  id        bigserial primary key,
  print_id  bigint not null references prints(id) on delete cascade,
  ordinal   integer not null,
  filename  text not null,
  unique (print_id, ordinal)
);
create index if not exists print_attachments_print_idx on print_attachments(print_id);

-- ---------- raw stage ----------
create table if not exists _stage_prints (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,                       -- print number (text)
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

-- ---------- load_prints ----------
create or replace function load_prints(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  insert into prints(term, number, title, change_date, delivery_date,
                     document_date, process_print, source_path, staged_at, loaded_at)
  select
    s.term,
    s.payload->>'number',
    s.payload->>'title',
    (s.payload->>'changeDate')::timestamptz,
    (s.payload->>'deliveryDate')::date,
    (s.payload->>'documentDate')::date,
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(s.payload->'processPrint')),
      '{}'
    ),
    s.source_path,
    s.staged_at,
    now()
  from _stage_prints s
  where s.term = p_term
  on conflict (term, number) do update set
    title = excluded.title,
    change_date = excluded.change_date,
    delivery_date = excluded.delivery_date,
    document_date = excluded.document_date,
    process_print = excluded.process_print,
    source_path = excluded.source_path,
    staged_at = excluded.staged_at,
    loaded_at = now();
  get diagnostics affected = row_count;
  return affected;
end $$;

-- ---------- load_print_attachments ----------
-- Replace-all per print: attachments are an ordered list, mid-position changes
-- shouldn't leave stale rows. Delete the print's rows then reinsert.
create or replace function load_print_attachments(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer;
begin
  delete from print_attachments pa
  using prints p
  where pa.print_id = p.id and p.term = p_term;

  insert into print_attachments(print_id, ordinal, filename)
  select
    p.id,
    (ord - 1)::integer,
    fn::text
  from _stage_prints s
  join prints p on p.term = s.term and p.number = s.payload->>'number'
  cross join lateral jsonb_array_elements_text(s.payload->'attachments')
    with ordinality as t(fn, ord)
  where s.term = p_term;
  get diagnostics affected = row_count;
  return affected;
end $$;
