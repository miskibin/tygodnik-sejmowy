-- 0061_proceeding_statements_enrichment.sql
--
-- Multi-purpose LLM enrichment columns on proceeding_statements. One LLM call
-- per statement extracts everything that's useful downstream — viral signal
-- for Tygodnik, plus tone/topic/entities/claims/addressee/summary that future
-- features (MP profiles, party-style analytics, fact-checking, search snippets)
-- can use without a second pass.
--
-- Filled by supagraf/enrich/utterance_enrich.py (see prompts/utterance_enrich/v1.md).
-- Provenance columns mirror the print enrichment pattern (impact_prompt_*).

alter table proceeding_statements
  add column if not exists viral_score numeric,
  add column if not exists viral_quote text,
  add column if not exists viral_reason text,
  add column if not exists tone text,
  add column if not exists topic_tags text[],
  add column if not exists mentioned_entities jsonb,
  add column if not exists key_claims text[],
  add column if not exists addressee text,
  add column if not exists summary_one_line text,
  add column if not exists enrichment_model text,
  add column if not exists enrichment_prompt_version text,
  add column if not exists enrichment_prompt_sha256 text;

-- viral_score is the only signal used by Tygodnik; constrain to [0,1] so the
-- ranking view doesn't have to coalesce against bad data.
alter table proceeding_statements
  drop constraint if exists proceeding_statements_viral_score_range;
alter table proceeding_statements
  add constraint proceeding_statements_viral_score_range
  check (viral_score is null or (viral_score >= 0 and viral_score <= 1));

-- tone enum (free text but bounded). Mirrors prompts/utterance_enrich/v1.md.
alter table proceeding_statements
  drop constraint if exists proceeding_statements_tone_check;
alter table proceeding_statements
  add constraint proceeding_statements_tone_check
  check (tone is null or tone in (
    'konfrontacyjny','merytoryczny','populistyczny',
    'emocjonalny','techniczny','proceduralny'
  ));

-- addressee enum: who the speaker is talking to.
alter table proceeding_statements
  drop constraint if exists proceeding_statements_addressee_check;
alter table proceeding_statements
  add constraint proceeding_statements_addressee_check
  check (addressee is null or addressee in (
    'rzad','opozycja','konkretna_osoba','spoleczenstwo',
    'marszalek','klub','komisja','inne'
  ));

-- Provenance columns must travel together. Either all set or all null.
alter table proceeding_statements
  drop constraint if exists proceeding_statements_enrichment_provenance;
alter table proceeding_statements
  add constraint proceeding_statements_enrichment_provenance
  check (
    (enrichment_model is null
       and enrichment_prompt_version is null
       and enrichment_prompt_sha256 is null)
    or
    (enrichment_model is not null
       and enrichment_prompt_version is not null
       and enrichment_prompt_sha256 is not null)
  );

-- Tygodnik viral-quote section ranks by viral_score DESC. Partial index is
-- the right shape: only the (small) enriched subset matters.
create index if not exists ps_viral_score_idx
  on proceeding_statements (viral_score desc nulls last)
  where viral_score is not null;

-- topic_tags + mentioned_entities are array/jsonb — use GIN so cross-statement
-- queries ("co Sejm mówił o mieszkaniach", "kto wspomniał posła X") stay cheap.
create index if not exists ps_topic_tags_gin
  on proceeding_statements using gin (topic_tags);

create index if not exists ps_mentioned_entities_gin
  on proceeding_statements using gin (mentioned_entities);

comment on column proceeding_statements.viral_score is
  '0..1 score from utterance_enrich LLM pass — quotability/share-worthiness. Top-N per sitting feeds Tygodnik viral_quote section.';
comment on column proceeding_statements.viral_quote is
  'Best ≤200-char excerpt from body_text picked by LLM as the share-worthy line. Surfaced verbatim in Tygodnik.';
comment on column proceeding_statements.tone is
  'LLM-classified rhetorical mode. Bounded enum — see CHECK constraint.';
comment on column proceeding_statements.topic_tags is
  '25-tag taxonomy from prints (persona/topic). Used for "co MP X mówi o Y" queries.';
comment on column proceeding_statements.mentioned_entities is
  '{mps:[], parties:[], ministers:[], prints:[]} — graf wzajemnych referencji. prints[] strings (e.g. "druk 123") are raw mentions, resolved later.';
comment on column proceeding_statements.key_claims is
  '1–3 zwięzłe stwierdzenia faktyczne wyodrębnione z wystąpienia. Future fact-check pipeline.';
comment on column proceeding_statements.addressee is
  'Do kogo mówi: rzad/opozycja/konkretna_osoba/spoleczenstwo/marszalek/klub/komisja/inne.';
comment on column proceeding_statements.summary_one_line is
  '≤120-char streszczenie czego dotyczyło wystąpienie. Preview/listing/search snippets.';
