-- 0016_print_stance_columns.sql
-- Add stance + confidence + provenance to prints. Stance enum kept as text +
-- CHECK (avoids type pinning before Phase C settles on full enum surface);
-- bump to CREATE TYPE later if needed across other entities.

alter table prints add column if not exists stance               text;
alter table prints add column if not exists stance_confidence    real;
alter table prints add column if not exists stance_prompt_version text;
alter table prints add column if not exists stance_prompt_sha256  text;
alter table prints add column if not exists stance_model         text;

alter table prints drop constraint if exists prints_stance_enum;
alter table prints add constraint prints_stance_enum
  check (stance is null or stance in ('FOR','AGAINST','NEUTRAL','MIXED'));

alter table prints drop constraint if exists prints_stance_confidence_range;
alter table prints add constraint prints_stance_confidence_range
  check (stance_confidence is null or (stance_confidence >= 0.0 and stance_confidence <= 1.0));

-- Provenance non-null when stance is set — same pattern as 0014 summary.
alter table prints drop constraint if exists prints_stance_provenance;
alter table prints add constraint prints_stance_provenance check (
  stance is null
  or (stance_confidence is not null
      and stance_prompt_version is not null
      and stance_prompt_sha256 is not null
      and stance_model is not null)
);

create index if not exists prints_stance_pending_idx on prints(term, number)
  where stance is null;
