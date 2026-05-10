-- 0041_print_impact.sql
-- Phase F1 (extension): impact_punch (≤200-char headline) + affected_groups
-- (jsonb array of {tag, severity, est_population:int|null}). Tag taxonomy
-- overlaps with persona_tags (25-tag set in 0030); the array shape is policed
-- by Pydantic on the write side rather than by jsonb_typeof CHECKs to keep
-- the SQL simple and the validation source-of-truth in one place.
--
-- est_population is NULL by default (GUS lookup deferred). When non-NULL it
-- must be a positive integer; severity is constrained to high/medium/low.
-- pending = impact_punch NULL.

alter table prints
  add column if not exists impact_punch                 text,
  add column if not exists affected_groups              jsonb,
  add column if not exists impact_prompt_version        text,
  add column if not exists impact_prompt_sha256         text,
  add column if not exists impact_model                 text;

alter table prints drop constraint if exists prints_impact_provenance;
alter table prints add constraint prints_impact_provenance check (
  (impact_punch is null
     and affected_groups is null
     and impact_prompt_version is null
     and impact_prompt_sha256 is null
     and impact_model is null)
  or
  (impact_punch is not null
     and affected_groups is not null
     and impact_prompt_version is not null
     and impact_prompt_sha256 is not null
     and impact_model is not null)
);

alter table prints drop constraint if exists prints_impact_punch_length;
alter table prints add constraint prints_impact_punch_length check (
  impact_punch is null or char_length(impact_punch) <= 200
);

alter table prints drop constraint if exists prints_affected_groups_shape;
alter table prints add constraint prints_affected_groups_shape check (
  affected_groups is null or jsonb_typeof(affected_groups) = 'array'
);

create index if not exists prints_impact_pending_idx
  on prints (id) where impact_punch is null;

-- GIN over affected_groups for "give me prints affecting tag=rolnik" filters.
create index if not exists prints_affected_groups_gin_idx
  on prints using gin (affected_groups);
