-- 0014_print_enrichment_columns.sql
-- Columns populated by enrich.print_summary (Phase C wires more enrichers).
-- Each enrichment job that writes to prints stamps prompt_version + sha
-- so re-runs are idempotent on (entity_id, prompt_version).

alter table prints add column if not exists summary                 text;
alter table prints add column if not exists short_title             text;
alter table prints add column if not exists summary_prompt_version  text;
alter table prints add column if not exists summary_prompt_sha256   text;
alter table prints add column if not exists summary_model           text;

-- Sanity: when summary is set, the version stamp must be set too. NULL pre-enrich
-- is fine; post-enrich rows must have full provenance.
alter table prints drop constraint if exists prints_summary_provenance;
alter table prints add constraint prints_summary_provenance check (
  summary is null
  or (summary_prompt_version is not null and summary_prompt_sha256 is not null and summary_model is not null)
);

create index if not exists prints_summary_pending_idx on prints(term, number)
  where summary is null;
