-- 0030_print_persona_tags.sql
-- Persona-tagging columns + provenance on prints. Mirrors 0014/0016 pattern
-- (CHECK binds tags + all provenance cols together). Per-element CHECK on a
-- text[] would need a plpgsql trigger; instead we enforce the 25-tag taxonomy
-- in Pydantic (Literal on the field) where it's cheaper to evolve.

alter table prints
  add column if not exists persona_tags                 text[],
  add column if not exists persona_tags_prompt_version  text,
  add column if not exists persona_tags_prompt_sha256   text,
  add column if not exists persona_tags_model           text;

alter table prints drop constraint if exists prints_persona_tags_provenance;
alter table prints add constraint prints_persona_tags_provenance check (
  (persona_tags is null
     and persona_tags_prompt_version is null
     and persona_tags_prompt_sha256 is null
     and persona_tags_model is null)
  or
  (persona_tags is not null
     and persona_tags_prompt_version is not null
     and persona_tags_prompt_sha256 is not null
     and persona_tags_model is not null)
);

create index if not exists prints_persona_tags_pending_idx
  on prints (id) where persona_tags is null;

-- GIN for Brief filter "personas[] && ARRAY['najemca']" (?| / @> ops).
create index if not exists prints_persona_tags_gin_idx
  on prints using gin (persona_tags);
