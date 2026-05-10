-- 0017_print_mentions.sql
-- Raw mentions extracted from print text via LLM. Phase D resolves
-- person mentions to mp_id and committee mentions to committee codes.
-- Until then these are unresolved candidates with full provenance.

create table if not exists print_mentions (
  id              bigserial primary key,
  print_id        bigint  not null references prints(id) on delete cascade,
  mention_type    text    not null check (mention_type in ('person','committee')),
  raw_text        text    not null,
  span_start      integer not null check (span_start >= 0),
  span_end        integer not null,
  -- Provenance — every row knows which prompt produced it.
  prompt_version  text    not null,
  prompt_sha256   text    not null,
  model           text    not null,
  extracted_at    timestamptz not null default now(),
  -- A given (print, prompt_version) re-extraction replaces previous rows;
  -- we don't dedupe identical raw_text within a single run because span
  -- offsets may legitimately repeat.
  check (span_end >= span_start),
  unique (print_id, prompt_version, mention_type, raw_text, span_start, span_end)
);
create index if not exists print_mentions_print_idx on print_mentions(print_id);
create index if not exists print_mentions_type_idx on print_mentions(mention_type);

-- Add provenance columns on prints to track LATEST mention extraction run.
alter table prints add column if not exists mentions_prompt_version text;
alter table prints add column if not exists mentions_prompt_sha256  text;
alter table prints add column if not exists mentions_model         text;
alter table prints add column if not exists mentions_extracted_at  timestamptz;

alter table prints drop constraint if exists prints_mentions_provenance;
alter table prints add constraint prints_mentions_provenance check (
  mentions_prompt_version is null
  or (mentions_prompt_sha256 is not null and mentions_model is not null and mentions_extracted_at is not null)
);

create index if not exists prints_mentions_pending_idx on prints(term, number)
  where mentions_extracted_at is null;
