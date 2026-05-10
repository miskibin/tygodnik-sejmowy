-- 0057_update_is_procedural_fn.sql
-- Set-based equivalent of supagraf.backfill.etl_review.backfill_is_procedural_substantive.
-- Original Python loop did N round-trips per row over PostgREST; on a fresh
-- corpus that's ~543 PUT requests instead of 3 SQL UPDATEs.

create or replace function update_is_procedural_substantive()
returns table(gov_bills_fixed integer, topic_fixed integer, categories_fixed integer)
language plpgsql as $$
declare
  a integer; b integer; c integer;
begin
  update prints set is_procedural = false
  where document_category = 'projekt_ustawy'
    and sponsor_authority in ('rzad','prezydent')
    and is_procedural = true;
  get diagnostics a = row_count;

  update prints set is_procedural = false
  where document_category = 'projekt_ustawy'
    and is_procedural = true
    and (
      title ~* 'kodeks(u|ie)?\s+(karny|karnego|karnym|postępowania|cywiln|pracy|spółek|rodzinny)'
      or title ~* '(podatk|akcyz|VAT|PIT|CIT|ZUS|NFZ|emerytur|zasiłk|świadcz|ochron|bezpiecze)'
    );
  get diagnostics b = row_count;

  update prints set is_procedural = true
  where is_procedural is null
    and document_category in (
      'autopoprawka','wniosek_personalny','pismo_marszalka',
      'wniosek_organizacyjny','uchwala_upamietniajaca','uchwala_senatu',
      'wotum_nieufnosci','weto_prezydenta','informacja'
    );
  get diagnostics c = row_count;

  return query select a, b, c;
end $$;
