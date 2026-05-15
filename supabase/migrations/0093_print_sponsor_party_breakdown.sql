-- 0093_print_sponsor_party_breakdown.sql
-- Add `sponsor_party_breakdown` to prints: for "Poselski projekt" druki,
-- jsonb {club_ref: count} aggregating sponsor_mps[] over mps.club_ref.
--
-- Why a denormalized column instead of a runtime join: sponsor_mps is a
-- jsonb array of name strings (no FK), and the join requires per-print
-- iteration. Computing once on backfill / per-enrichment and caching
-- means the frontend renders the chip from one column read.
--
-- Why nullable: only "Poselski projekt" druki have sponsors (mps); for
-- rzad/senat/obywatele the field stays NULL. Frontend treats NULL as
-- "no breakdown to show" (just sponsor_authority label).

alter table prints
  add column if not exists sponsor_party_breakdown jsonb;

comment on column prints.sponsor_party_breakdown is
  'For Poselski projekt: {club_ref: count} over sponsor_mps. NULL otherwise.';
