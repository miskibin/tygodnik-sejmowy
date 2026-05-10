-- 0031_print_citizen_action.sql
-- Phase F2: per-print citizen action hint produced by LLM. Unlike summary/stance,
-- the action itself MAY legitimately be NULL after a successful run (e.g. ratification
-- prints have no actionable citizen step). Therefore "pending" is keyed off provenance
-- (model NULL) rather than off the action column.

alter table prints
  add column if not exists citizen_action text,
  add column if not exists citizen_action_prompt_version text,
  add column if not exists citizen_action_prompt_sha256 text,
  add column if not exists citizen_action_model text;

alter table prints drop constraint if exists prints_citizen_action_provenance;
alter table prints add constraint prints_citizen_action_provenance check (
  (citizen_action_prompt_version is null
     and citizen_action_prompt_sha256 is null
     and citizen_action_model is null)
  or
  (citizen_action_prompt_version is not null
     and citizen_action_prompt_sha256 is not null
     and citizen_action_model is not null)
);

alter table prints drop constraint if exists prints_citizen_action_length;
alter table prints add constraint prints_citizen_action_length check (
  citizen_action is null or char_length(citizen_action) <= 140
);

create index if not exists prints_citizen_action_pending_idx
  on prints (id) where citizen_action_model is null;
