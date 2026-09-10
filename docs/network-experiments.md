# Sieć polityków: eksperyment odczytowy

`supagraf.network.build_network()` tworzy mały, JSON-serializowalny snapshot z odczytów PostgREST. Nie zapisuje do bazy i nie zmienia ETL. Uruchomienie zapisuje podgląd do `.tmp_supagraf/network-preview.json`.

```powershell
uv run python -m supagraf.network
```

Nie przekierowuj wyniku do repozytorium. Błąd autoryzacji jest błędem konfiguracji; nie wypisuj kluczy ani pełnego obiektu błędu.

## Warstwy

`layers.questions.edges` to projekcja wieloautorskich interpelacji i zapytań. Każda para z pytania podpisanego przez `k` osób dostaje wagę `1/(k-1)`, aby długa lista autorów nie dominowała nad małą wspólną inicjatywą. Dowód to do pięciu linków do oficjalnego API Sejmu.

`layers.votes.edges` to zgodność par posłów w maksymalnie 120 najnowszych elektronicznych głosowaniach merytorycznych. Uwzględnia tylko `YES`, `NO` i `ABSTAIN`; nieobecności, obecność bez głosu i głosy listowe są wyłączone. Krawędź wymaga 20 wspólnych głosów. `baseline_agreement` jest zgodnością większości klubów zapisanych w `votes.club_ref` w chwili głosowania, a `excess` to różnica względem tej bazy. Nie jest to miara współpracy ani prognoza.

Próba wybiera jeden głos na powiązany blok druku, gdy taki blok istnieje. Payload ujawnia zakres skanu, kandydatów i wybór oraz `ballot_transport`. Karty głosowania pochodzą najpierw z surowego etapu ETL (`_stage_votings.payload`), a gdy jest niepełny — z oficjalnego API Sejmu. Snapshot powstaje tylko wtedy, gdy liczba rekordów odpowiada sumie głosujących i niegłosujących, identyfikatory posłów są unikalne, a wybory poprawne. Pomija głosowania, w których co najmniej 95% ważnych głosów było identycznych. `mp_deviations` liczy modalny głos klubu leave-one-out, bez remisów, przy co najmniej pięciu innych ważnych głosach klubowych.

## Język interfejsu

Używaj „współautorzy pytania”, „głosowali tak samo” i „inaczej niż większość klubu w porównywalnych głosowaniach”. Nie używaj języka sugerującego korupcję, nieformalny wpływ ani przyszłą zmianę klubu.

Źródło: [API Sejmu](https://api.sejm.gov.pl/sejm.html).

## Uruchomienie widoku

Nowa strona: `/powiazania`, dostępna również przez Atlas i menu „Więcej”.
Portrety pochodzą z `mps.photo_url`; brak lub błąd zdjęcia zastępują inicjały.
Na telefonie mapa zmienia się w listę z rozwijanymi pod osobą źródłami.
Tryb lokalnego podglądu korzysta wyłącznie z jawnie wskazanego pliku wynikowego;
nie działa w buildzie produkcyjnym i nie wprowadza przykładowych danych do bazy.

```powershell
uv run python -m supagraf network --output .tmp_supagraf/network-preview.json
cd frontend
$env:SUPAGRAF_NETWORK_PREVIEW_FILE = 'D:/tygodnik-sejmowy/.tmp_supagraf/network-preview.json'
node node_modules/next/dist/bin/next dev
```

Przy wdrożeniu należy zastosować obie nowe migracje przez zatwierdzony w tym
repo proces direct psql na mixvm (nie przez MCP zarządzanego Supabase):

- `20260910063533_politician_network_snapshots.sql`
- `20260910063557_fix_vote_club_history.sql`

Po migracji `uv run python -m supagraf network --publish` publikuje pierwszy
wynik. Kolejne zwykłe przebiegi `daily` odświeżają sieć automatycznie. Samo
`network --output ...` nie publikuje do bazy. Ta implementacja nie została
jeszcze wdrożona na produkcję.

Wersja eksperymentalna przelicza ograniczoną próbę po każdym poprawnym przebiegu
ETL. Dzięki temu ponawia nieudaną publikację i usuwa dokumenty wypadające z okna
czasu także w dni bez nowych danych. To ograniczony pełny przelicznik, nie
inkrementalna aktualizacja każdej krawędzi. Nie wymaga nowej bazy grafowej ani
modelu językowego. Snapshot publikuje się jednym upsertem; awaria zachowuje
poprzedni wynik. Publiczna rola ma tylko SELECT, zapisy wykonuje ETL.

## Pierwszy odczyt, 10 września 2026

Odczytowa próba na rzeczywistych danych: 499 osób (także z zakończonym mandatem),
2000 najnowszych interpelacji/zapytań z okna 180 dni, w tym 406 dokumentów
wieloautorskich. Wszystkie 2000 miały autorów; odczytano 3881 przypisań autorstwa.
Limit dokumentów został osiągnięty, więc nie jest to pełny zbiór z tego okresu.

Z 600 najnowszych kandydatów na głosowania 491 miało kwalifikującą klasyfikację.
Wybrano 120 głosowań z ograniczeniem powtarzających się powiązanych druków,
a następnie pominięto niemal jednomyślne głosowania w obliczeniach.
Odczyt tabeli `votes` zwracał 503; kompletne karty pobrano z `_stage_votings`.
Nie opublikowano niekompletnych kart i nie zastosowano migracji w produkcji.

Wynik po zachowaniu najmocniejszych relacji poszczególnych osób: 1144 krawędzie
wspólnego autorstwa i 3429 krawędzi podobieństwa głosów. Liczba krawędzi nie jest
liczbą statystycznie potwierdzonych nietypowych relacji. Wybór na podstawie
najwyższej nadwyżki sam podwyższa jej rozkład w wyświetlanej próbie.

Kolejne eksperymenty przed szerszymi wnioskami: stabilność w rozłącznych okresach,
próba po całkowitym odrzuceniu głosowań bez powiązanego druku, model losowy
zachowujący aktywność posłów i rozmiary grup autorów. Nie dodano jeszcze
klasteryzacji, prognoz odejścia, podpisów projektów ustaw ani relacji do spółek.

## Weryfikacja

```powershell
uv run pytest tests/supagraf/unit -q
node scripts/test_network_migrations.mjs
cd frontend
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build
```

Test SQL potrzebuje lokalnego `@electric-sql/pglite@0.5.8` w ignorowanym
`.tmp_supagraf/sql-test/node_modules` (np. instalacja `pnpm --dir
.tmp_supagraf/sql-test add @electric-sql/pglite@0.5.8`). Nie używa produkcji.
Testy kontraktowe tego repo mogą wykonywać RPC odświeżające produkcyjne widoki;
nie należą do lokalnej ścieżki weryfikacji tej funkcji.
