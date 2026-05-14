-- 0091_etl_data_integrity_fixes.sql
--
-- Two ETL bugs surfaced while running the Phase 2 direct-stage daily on
-- 2026-05-14:
--
--   1. `prints.document_category` was populated by a one-shot UPDATE in
--      migration 0042. Every print loaded after that migration landed with
--      `document_category=NULL` until manually re-classified. Symptom:
--      tygodnik/p/<sitting> returned 0 print events for the latest sittings
--      because `print_events_v` filters on `document_category='projekt_ustawy'`.
--      FIX: BEFORE INSERT/UPDATE trigger that runs the same CASE expression
--      whenever `title` changes or `document_category` is NULL. The
--      `is_meta_document` trigger from 0050 already depends on this column
--      so chaining is fine.
--
--   2. `load_proceedings` wiped + reinserted proceeding_days (cascading to
--      proceeding_statements). Every daily load destroyed the LLM
--      enrichment columns added in 0061 (viral_score, viral_quote, tone,
--      topic_tags, mentioned_entities, key_claims, addressee,
--      summary_one_line) plus embedding state from `enrich-statements`.
--      Symptom: ran enrich-utterances on sitting 57, ran cmd_load — every
--      viral_score went NULL again. weekly_events_v sitting 57 dropped to
--      0 viral_quote events.
--      FIX: rewrite load_proceedings to UPSERT proceeding_days on
--      `(proceeding_id, date)` and proceeding_statements on
--      `(proceeding_day_id, num)`, preserving enrichment columns by
--      omitting them from the DO UPDATE SET clause.

-- ---------- 1. document_category trigger ----------

create or replace function _set_print_document_category()
returns trigger language plpgsql as $$
begin
  -- Skip work when title is unchanged AND document_category already set.
  -- INSERT path: old is undefined → always classify.
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.document_category is not null then
    return new;
  end if;

  -- Only auto-classify when value is NULL — don't stomp manual overrides
  -- from migration backfills or operator corrections.
  if new.document_category is null then
    new.document_category := case
      when new.title ~* '^autopoprawka' then 'autopoprawka'
      when new.title ~* '^wniosek\s+prezydenta\s+(rp\s+)?o\s+ponowne\s+rozpatrzenie' then 'weto_prezydenta'
      when new.title ~* 'wotum\s+nieufności' then 'wotum_nieufnosci'
      when new.title ~* '^wniosek\s+(o\s+)?(powołani[ae]|odwołani[ae]|wybór)' then 'wniosek_personalny'
      when new.title ~* '^kandydat\s+na\s+stanowisko' then 'wniosek_personalny'
      when new.title ~* '^opinia\s+komisji.*wniosk.*(wybor|powołani|odwołani|sędzi)' then 'wniosek_personalny'
      when new.title ~* '^pismo\s+(marszał|prezydent|prezesa)' then 'pismo_marszalka'
      when new.title ~* '(upamiętni|rokiem\s+\w)' then 'uchwala_upamietniajaca'
      when new.title ~* '^uchwała\s+senatu\s+w\s+sprawie\s+ustawy' then 'uchwala_senatu'
      when new.title ~* '^(opinia|stanowisko|uwagi)(\s|$)' then 'opinia_organu'
      when new.parent_number is not null then 'opinia_organu'
      when new.title ~* 'wniosek\s+w\s+sprawie\s+(zmian\s+w\s+składach|wyboru\s+składu)' then 'wniosek_organizacyjny'
      when new.title ~* '^przedstawiony\s+przez\s+prezydium\s+sejmu\s+wniosek' then 'wniosek_organizacyjny'
      when new.title ~* '^przedstawiony\s+przez\s+prezydium\s+sejmu\s+projekt\s+uchwały\s+w\s+sprawie\s+zmiany\s+regulaminu' then 'wniosek_organizacyjny'
      when new.title ~* '^wniosek\s+rady\s+ministrów' then 'wniosek_organizacyjny'
      when new.title ~* '^informacja(\s|$)' then 'informacja'
      when new.title ~* '^sprawozdanie\s+z\s+działalności' then 'informacja'
      when new.title ~* '^sprawozdanie\s+ministra' then 'informacja'
      when new.title ~* '^sprawozdanie\s+o\s+stanie' then 'informacja'
      when new.title ~* '^sprawozdanie\s+ze\s+stanu' then 'informacja'
      when new.title ~* '^zawiadomienie\s+prezesa\s+rady\s+ministrów' then 'informacja'
      when new.title ~* '^przegląd\s+funkcjonowania' then 'informacja'
      when new.title ~* '^(dodatkowe\s+)?sprawozdanie\s+komisji' then 'sprawozdanie_komisji'
      when new.title ~* '^(rządowy|poselski|senacki|komisyjny|prezydencki|obywatelski|przedstawiony\s+przez\s+prezydenta|przedstawiony\s+przez\s+prezydium\s+sejmu)\s+projekt\s+(ustawy|uchwały)' then 'projekt_ustawy'
      else 'inne'
    end;
  end if;
  return new;
end $$;

drop trigger if exists trg_print_document_category on prints;
create trigger trg_print_document_category
  before insert or update of title, parent_number, document_category on prints
  for each row execute function _set_print_document_category();

comment on function _set_print_document_category() is
  'Auto-classify prints.document_category from prints.title on INSERT/UPDATE. Mirrors the CASE expression from migration 0042 which was a one-shot UPDATE. Fires when title or parent_number changes, or when document_category is explicitly set to NULL (e.g. fresh INSERT from load_prints). Never stomps a non-NULL document_category — manual overrides are preserved. Chains into trg_print_is_meta_document (0050) which reads document_category to maintain is_meta_document.';

-- Backfill any rows currently NULL (carry-overs from daily loads between
-- 0042 and this migration).
update prints set document_category = null where document_category is null;  -- noop, but triggers re-eval if needed
-- The trigger only fires on UPDATE OF title/parent_number/document_category;
-- forcing a no-op update doesn't trigger because old.<col> = new.<col>.
-- Manual one-shot classifier for legacy NULL rows:
update prints set document_category = case
  when title ~* '^autopoprawka' then 'autopoprawka'
  when title ~* '^wniosek\s+prezydenta\s+(rp\s+)?o\s+ponowne\s+rozpatrzenie' then 'weto_prezydenta'
  when title ~* 'wotum\s+nieufności' then 'wotum_nieufnosci'
  when title ~* '^wniosek\s+(o\s+)?(powołani[ae]|odwołani[ae]|wybór)' then 'wniosek_personalny'
  when title ~* '^kandydat\s+na\s+stanowisko' then 'wniosek_personalny'
  when title ~* '^opinia\s+komisji.*wniosk.*(wybor|powołani|odwołani|sędzi)' then 'wniosek_personalny'
  when title ~* '^pismo\s+(marszał|prezydent|prezesa)' then 'pismo_marszalka'
  when title ~* '(upamiętni|rokiem\s+\w)' then 'uchwala_upamietniajaca'
  when title ~* '^uchwała\s+senatu\s+w\s+sprawie\s+ustawy' then 'uchwala_senatu'
  when title ~* '^(opinia|stanowisko|uwagi)(\s|$)' then 'opinia_organu'
  when parent_number is not null then 'opinia_organu'
  when title ~* 'wniosek\s+w\s+sprawie\s+(zmian\s+w\s+składach|wyboru\s+składu)' then 'wniosek_organizacyjny'
  when title ~* '^przedstawiony\s+przez\s+prezydium\s+sejmu\s+wniosek' then 'wniosek_organizacyjny'
  when title ~* '^przedstawiony\s+przez\s+prezydium\s+sejmu\s+projekt\s+uchwały\s+w\s+sprawie\s+zmiany\s+regulaminu' then 'wniosek_organizacyjny'
  when title ~* '^wniosek\s+rady\s+ministrów' then 'wniosek_organizacyjny'
  when title ~* '^informacja(\s|$)' then 'informacja'
  when title ~* '^sprawozdanie\s+z\s+działalności' then 'informacja'
  when title ~* '^sprawozdanie\s+ministra' then 'informacja'
  when title ~* '^sprawozdanie\s+o\s+stanie' then 'informacja'
  when title ~* '^sprawozdanie\s+ze\s+stanu' then 'informacja'
  when title ~* '^zawiadomienie\s+prezesa\s+rady\s+ministrów' then 'informacja'
  when title ~* '^przegląd\s+funkcjonowania' then 'informacja'
  when title ~* '^(dodatkowe\s+)?sprawozdanie\s+komisji' then 'sprawozdanie_komisji'
  when title ~* '^(rządowy|poselski|senacki|komisyjny|prezydencki|obywatelski|przedstawiony\s+przez\s+prezydenta|przedstawiony\s+przez\s+prezydium\s+sejmu)\s+projekt\s+(ustawy|uchwały)' then 'projekt_ustawy'
  else 'inne'
end
where document_category is null;

-- ---------- 2. load_proceedings preserves enrichment ----------

-- Drop the wipe-and-reinsert version and replace with UPSERT semantics.
-- Statements that vanish from the upstream payload (extremely rare — Sejm
-- doesn't retract spoken statements) are left in place; their enrichment
-- columns persist. agenda_items are still wiped+reinserted since they
-- carry no per-row enrichment.
create or replace function load_proceedings(p_term integer default 10)
returns integer language plpgsql as $$
declare
  s record; d_obj jsonb; stmt jsonb; ai jsonb; r text;
  pid bigint; did bigint; aid bigint; affected integer := 0;
begin
  for s in select * from _stage_proceedings where term = p_term order by number loop
    insert into proceedings(term, number, title, current, dates, agenda_html,
                            source_path, staged_at, loaded_at)
    values (s.term,
            (s.payload->>'number')::int,
            s.payload->>'title',
            (s.payload->>'current')::boolean,
            (select array_agg((d::text)::date order by (d::text)::date)
             from jsonb_array_elements_text(s.payload->'dates') d),
            s.payload->>'agenda_html',
            s.source_path, s.staged_at, now())
    on conflict (term, number) do update set
      title = excluded.title,
      current = excluded.current,
      dates = excluded.dates,
      agenda_html = excluded.agenda_html,
      source_path = excluded.source_path,
      staged_at = excluded.staged_at,
      loaded_at = now()
    returning id into pid;

    -- Days: UPSERT on (proceeding_id, date) so existing day rows keep their
    -- bigserial id. Statements FK proceeding_day_id stays valid across runs.
    for d_obj in select * from jsonb_array_elements(s.payload->'days') loop
      insert into proceeding_days(proceeding_id, date, source_path)
      values (pid, (d_obj->>'date')::date, d_obj->>'source_path')
      on conflict (proceeding_id, date) do update set
        source_path = excluded.source_path
      returning id into did;

      -- Statements: UPSERT on (proceeding_day_id, num). DO UPDATE SET
      -- only the upstream-sourced columns; LLM enrichment columns
      -- (viral_*, tone, topic_tags, mentioned_entities, key_claims,
      -- addressee, summary_one_line, embedded_at, embedding_model,
      -- enrichment_*) and full-text search vector (search_tsv,
      -- auto-maintained by trigger) are deliberately omitted so the
      -- enrich-utterances + enrich-statements work survives every load.
      for stmt in select * from jsonb_array_elements(d_obj->'statements') loop
        insert into proceeding_statements(
          proceeding_day_id, num, term, mp_id, speaker_name, function,
          rapporteur, secretary, unspoken,
          start_datetime, end_datetime, body_text, body_html
        ) values (
          did,
          (stmt->>'num')::int,
          s.term,
          nullif((stmt->>'mp_id')::int, 0),
          stmt->>'speaker_name',
          coalesce(stmt->>'function',''),
          (stmt->>'rapporteur')::boolean,
          (stmt->>'secretary')::boolean,
          (stmt->>'unspoken')::boolean,
          nullif(stmt->>'start_datetime','')::timestamptz,
          nullif(stmt->>'end_datetime','')::timestamptz,
          stmt->>'body_text',
          stmt->>'body_html'
        )
        on conflict (proceeding_day_id, num) do update set
          term = excluded.term,
          mp_id = excluded.mp_id,
          speaker_name = excluded.speaker_name,
          function = excluded.function,
          rapporteur = excluded.rapporteur,
          secretary = excluded.secretary,
          unspoken = excluded.unspoken,
          start_datetime = excluded.start_datetime,
          end_datetime = excluded.end_datetime,
          body_text = excluded.body_text,
          body_html = excluded.body_html;
      end loop;
    end loop;

    -- agenda_items: still wipe+reinsert since no enrichment columns live here.
    delete from agenda_items where proceeding_id = pid;
    for ai in select * from jsonb_array_elements(coalesce(s.payload->'agenda_items','[]'::jsonb)) loop
      insert into agenda_items(proceeding_id, ord, title, raw_html)
      values (pid, (ai->>'ord')::int, ai->>'title', ai->>'raw_html')
      returning id into aid;

      for r in select jsonb_array_elements_text(coalesce(ai->'process_refs','[]'::jsonb)) loop
        if exists (select 1 from processes where term = p_term and number = r) then
          insert into agenda_item_processes(agenda_item_id, term, process_id)
          values (aid, p_term, r)
          on conflict do nothing;
        else
          insert into unresolved_agenda_process_refs(agenda_item_id, term, process_id)
          values (aid, p_term, r)
          on conflict (agenda_item_id, term, process_id) do update set
            detected_at = now(), resolved_at = null;
        end if;
      end loop;

      for r in select jsonb_array_elements_text(coalesce(ai->'print_refs','[]'::jsonb)) loop
        if exists (select 1 from prints where term = p_term and number = r) then
          insert into agenda_item_prints(agenda_item_id, term, print_number)
          values (aid, p_term, r)
          on conflict do nothing;
        else
          insert into unresolved_agenda_print_refs(agenda_item_id, term, print_number)
          values (aid, p_term, r)
          on conflict (agenda_item_id, term, print_number) do update set
            detected_at = now(), resolved_at = null;
        end if;
      end loop;
    end loop;

    affected := affected + 1;
  end loop;
  return affected;
end $$;

comment on function load_proceedings(integer) is
  'Idempotent load. UPSERTs proceedings + days + statements so LLM enrichment columns survive every run. agenda_items still wipe+reinsert (no enrichment). Returns count of proceedings processed.';
