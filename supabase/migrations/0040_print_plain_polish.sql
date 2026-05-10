-- 0040_print_plain_polish.sql
-- Phase F1 (extension): plain-Polish 4-6 sentence summary aiming at ISO 24495
-- B1/B2 readability + self-classified band. Mirrors 0014 (summary) + 0030
-- (persona_tags) provenance pattern: prompt_version + prompt_sha256 + model
-- bound atomically via CHECK so partial writes cannot enter the table.
--
-- iso24495_class is enum-like text constrained to A1/A2/B1/B2/C1/C2.
-- pending = summary_plain NULL (cheap partial index).

alter table prints
  add column if not exists summary_plain                  text,
  add column if not exists iso24495_class                 text,
  add column if not exists summary_plain_prompt_version   text,
  add column if not exists summary_plain_prompt_sha256    text,
  add column if not exists summary_plain_model            text;

alter table prints drop constraint if exists prints_summary_plain_provenance;
alter table prints add constraint prints_summary_plain_provenance check (
  (summary_plain is null
     and iso24495_class is null
     and summary_plain_prompt_version is null
     and summary_plain_prompt_sha256 is null
     and summary_plain_model is null)
  or
  (summary_plain is not null
     and iso24495_class is not null
     and summary_plain_prompt_version is not null
     and summary_plain_prompt_sha256 is not null
     and summary_plain_model is not null)
);

alter table prints drop constraint if exists prints_iso24495_class_enum;
alter table prints add constraint prints_iso24495_class_enum check (
  iso24495_class is null
  or iso24495_class in ('A1','A2','B1','B2','C1','C2')
);

create index if not exists prints_summary_plain_pending_idx
  on prints (id) where summary_plain is null;
