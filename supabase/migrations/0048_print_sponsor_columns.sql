-- 0048_print_sponsor_columns.sql
-- Persist what `print_unified.py` already writes. The columns were applied
-- ad-hoc on the live DB earlier in the session (sequence skipped 0043) so
-- prod is fine, but a fresh `supabase db reset` would break every enrichment
-- UPDATE because the DDL never made it into source-controlled migrations.
-- This file is the missing 0043 — renumbered to keep the sequence linear.

alter table prints
  add column if not exists sponsor_authority text,
  add column if not exists sponsor_mps jsonb;

-- Single-source-of-truth for the enum so any future writer (frontend agent,
-- backfill script) hits the same set. Eight values mirror api.sejm.gov.pl
-- process metadata: who initiated the legislative process.
alter table prints drop constraint if exists prints_sponsor_authority_check;
alter table prints add constraint prints_sponsor_authority_check
  check (sponsor_authority is null or sponsor_authority in (
    'rzad',          -- Rada Ministrów
    'klub_poselski', -- caucus-sponsored bill (sygnatariusze in cover-PDF)
    'komisja',       -- standing committee
    'prezydent',     -- President of the Republic
    'senat',         -- Senate amendments returning to Sejm
    'obywatele',     -- citizen-initiated (100k signatures)
    'prezydium',     -- Sejm presidium
    'inne'           -- catch-all incl. opinia organów (override in unified
                     -- enricher when is_meta_document AND opinion_source set)
  ));

-- sponsor_mps is a jsonb array of full names. No FK to mps.id yet —
-- resolver deferred (P1 #7). Frontend treats as opaque string list.
create index if not exists prints_sponsor_authority_idx
  on prints(sponsor_authority) where sponsor_authority is not null;
