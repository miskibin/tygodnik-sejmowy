-- 0099_mp_office_expenses.sql
-- MP office expense reports ("sprawozdania z wydatkowania kwoty ryczałtu
-- przeznaczonego na prowadzenie biura poselskiego"). Annual reports, one
-- per MP per year, published by Kancelaria Sejmu after approval by
-- Prezydium Sejmu and Komisja Regulaminowa.
--
-- Form is fixed: Załącznik nr 1 do zarządzenia nr 2 Marszałka Sejmu z
-- 31 marca 2017 r. — 23 standardized expense categories + 4 financial
-- summary fields. Source PDF lives on orka.sejm.gov.pl/BOP_info.nsf/.

-- ---------- category lookup ----------
create table if not exists mp_office_expense_categories (
  code          smallint primary key check (code between 1 and 99),
  name_pl       text    not null,
  short_label   text    not null,
  display_order smallint not null
);

insert into mp_office_expense_categories(code, name_pl, short_label, display_order) values
  (1,  'Wynagrodzenia pracowników biura poselskiego zatrudnionych na podstawie umowy o pracę wraz z pochodnymi', 'Wynagrodzenia pracowników (UoP)', 1),
  (2,  'Koszty badań lekarskich i szkoleń pracowników', 'Badania i szkolenia pracowników', 2),
  (3,  'Wynagrodzenia wypłacane na podstawie zawartych przez posła umów zleceń i o dzieło wraz z pochodnymi', 'Umowy zlecenia / o dzieło', 3),
  (4,  'Koszty ekspertyz, opinii, tłumaczeń', 'Ekspertyzy, opinie, tłumaczenia', 4),
  (5,  'Koszty usług telekomunikacyjnych związanych z wykonywaniem mandatu poselskiego', 'Telekomunikacja (mandat)', 5),
  (6,  'Koszty usług telekomunikacyjnych w „Domu Poselskim" oraz w kwaterach prywatnych w Warszawie', 'Telekomunikacja (Dom Poselski)', 6),
  (7,  'Koszty korespondencji i ogłoszeń', 'Korespondencja i ogłoszenia', 7),
  (8,  'Koszty wynajmowania sal na spotkania z wyborcami', 'Wynajem sal na spotkania', 8),
  (9,  'Koszty przejazdów posła w związku z wykonywaniem mandatu samochodem własnym lub innym', 'Przejazdy posła (samochód)', 9),
  (10, 'Koszty przejazdów posła w związku z wykonywaniem mandatu taksówkami', 'Przejazdy posła (taxi)', 10),
  (11, 'Koszty najmu lokalu biura poselskiego (czynsz, media, podatki i opłaty lokalne)', 'Najem lokalu biura', 11),
  (12, 'Koszty konserwacji i naprawy sprzętu technicznego biura oraz koszty jego eksploatacji', 'Konserwacja sprzętu', 12),
  (13, 'Koszty drobnych napraw i remontów lokalu biura poselskiego', 'Naprawy i remonty lokalu', 13),
  (14, 'Zakup materiałów biurowych, prasy, wydawnictw, środków BHP itp.', 'Materiały biurowe i prasa', 14),
  (15, 'Zakup środków trwałych o charakterze wyposażenia', 'Środki trwałe (wyposażenie)', 15),
  (16, 'Koszty podróży służbowych pracowników biura', 'Podróże pracowników', 16),
  (17, 'Odpis na fundusz świadczeń socjalnych', 'ZFŚS', 17),
  (18, 'Świadczenia urlopowe wypłacane pracownikom biura', 'Świadczenia urlopowe', 18),
  (19, 'Koszty obsługi rachunkowo-księgowej i bankowej biura', 'Księgowość i bank', 19),
  (20, 'Koszty wykupu polisy OC z tytułu prowadzenia biura', 'Polisa OC biura', 20),
  (21, 'Koszty abonamentu RTV biura', 'Abonament RTV', 21),
  (22, 'Koszty utworzenia oraz obsługi strony internetowej biura', 'Strona internetowa biura', 22),
  (23, 'Inne wydatki związane z prowadzeniem biura', 'Inne wydatki', 23)
on conflict (code) do update set
  name_pl       = excluded.name_pl,
  short_label   = excluded.short_label,
  display_order = excluded.display_order;

-- ---------- reports ----------
create table if not exists mp_office_expense_reports (
  id                       bigserial primary key,
  term                     integer not null,
  mp_id                    integer not null,
  year                     integer not null check (year between 2015 and 2099),
  period_start             date,
  period_end               date,
  -- four header lines on the form
  funds_allocated          numeric(12,2),
  funds_carryover          numeric(12,2),
  funds_interest           numeric(12,2),
  funds_total              numeric(12,2),
  -- footer totals
  funds_spent              numeric(12,2),
  funds_remaining          numeric(12,2),
  -- provenance / source
  source_url               text    not null,
  source_sha256            text,
  published_at             date,
  approved_by_presidium_at date,
  source_path              text,
  staged_at                timestamptz,
  loaded_at                timestamptz not null default now(),
  unique (term, mp_id, year),
  foreign key (term, mp_id) references mps(term, mp_id) on delete cascade
);
create index if not exists mp_office_expense_reports_term_year_idx
  on mp_office_expense_reports(term, year);
create index if not exists mp_office_expense_reports_mp_idx
  on mp_office_expense_reports(mp_id);

-- ---------- items (one row per (report, category)) ----------
create table if not exists mp_office_expense_items (
  id            bigserial primary key,
  report_id     bigint   not null references mp_office_expense_reports(id) on delete cascade,
  category_code smallint not null references mp_office_expense_categories(code),
  amount        numeric(12,2) not null default 0,
  notes         text,
  unique (report_id, category_code)
);
create index if not exists mp_office_expense_items_cat_amount_idx
  on mp_office_expense_items(category_code, amount desc);

-- ---------- stage ----------
create table if not exists _stage_mp_office_expenses (
  id          bigserial primary key,
  term        integer not null,
  natural_id  text    not null,            -- '{mp_id}__{year}'
  payload     jsonb   not null,
  source_path text    not null,
  captured_at timestamptz,
  staged_at   timestamptz not null default now(),
  unique (term, natural_id)
);

-- ---------- load_mp_office_expenses ----------
-- Idempotent on (term, mp_id, year). After upsert, replaces all items for
-- the report (delete-and-insert pattern keeps the 23 rows consistent with
-- whatever the staged payload currently says — simpler than per-row upsert
-- given the fixed-form input).
create or replace function load_mp_office_expenses(p_term integer default 10)
returns integer language plpgsql as $$
declare
  affected integer := 0;
  rec      record;
  rid      bigint;
begin
  for rec in
    select term,
           (payload->>'mp_id')::int                     as mp_id,
           (payload->>'year')::int                      as year,
           nullif(payload->>'period_start','')::date    as period_start,
           nullif(payload->>'period_end','')::date      as period_end,
           nullif(payload->>'funds_allocated','')::numeric as funds_allocated,
           nullif(payload->>'funds_carryover','')::numeric as funds_carryover,
           nullif(payload->>'funds_interest','')::numeric  as funds_interest,
           nullif(payload->>'funds_total','')::numeric     as funds_total,
           nullif(payload->>'funds_spent','')::numeric     as funds_spent,
           nullif(payload->>'funds_remaining','')::numeric as funds_remaining,
           payload->>'source_url'                       as source_url,
           nullif(payload->>'source_sha256','')         as source_sha256,
           nullif(payload->>'published_at','')::date    as published_at,
           nullif(payload->>'approved_by_presidium_at','')::date as approved_by_presidium_at,
           payload->'items'                             as items_jsonb,
           source_path, staged_at
      from _stage_mp_office_expenses
     where term = p_term
  loop
    insert into mp_office_expense_reports(
      term, mp_id, year, period_start, period_end,
      funds_allocated, funds_carryover, funds_interest, funds_total,
      funds_spent, funds_remaining,
      source_url, source_sha256, published_at, approved_by_presidium_at,
      source_path, staged_at, loaded_at
    ) values (
      rec.term, rec.mp_id, rec.year, rec.period_start, rec.period_end,
      rec.funds_allocated, rec.funds_carryover, rec.funds_interest, rec.funds_total,
      rec.funds_spent, rec.funds_remaining,
      rec.source_url, rec.source_sha256, rec.published_at, rec.approved_by_presidium_at,
      rec.source_path, rec.staged_at, now()
    )
    on conflict (term, mp_id, year) do update set
      period_start             = excluded.period_start,
      period_end               = excluded.period_end,
      funds_allocated          = excluded.funds_allocated,
      funds_carryover          = excluded.funds_carryover,
      funds_interest           = excluded.funds_interest,
      funds_total              = excluded.funds_total,
      funds_spent              = excluded.funds_spent,
      funds_remaining          = excluded.funds_remaining,
      source_url               = excluded.source_url,
      source_sha256            = excluded.source_sha256,
      published_at             = excluded.published_at,
      approved_by_presidium_at = excluded.approved_by_presidium_at,
      source_path              = excluded.source_path,
      staged_at                = excluded.staged_at,
      loaded_at                = now()
    returning id into rid;

    -- Replace items for this report. Items are tightly coupled to the
    -- staged payload — partial updates aren't a real use case here.
    delete from mp_office_expense_items where report_id = rid;
    if rec.items_jsonb is not null and jsonb_typeof(rec.items_jsonb) = 'array' then
      insert into mp_office_expense_items(report_id, category_code, amount, notes)
      select rid,
             (item->>'category_code')::smallint,
             coalesce(nullif(item->>'amount','')::numeric, 0),
             nullif(item->>'notes','')
        from jsonb_array_elements(rec.items_jsonb) as item
       where (item->>'category_code') ~ '^[0-9]+$';
    end if;

    affected := affected + 1;
  end loop;
  return affected;
end $$;
