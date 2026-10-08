# Wspólna baza prawa

Najbliższa wcześniejsza próba to import metadanych ELI przez `acts.changes`, bez treści przepisów i bez pełnego importu początkowego; ta implementacja dodaje niezmienne dokumenty, artykuły, odrębne sprawdzanie aktualności i wspólny kontrakt odczytu.

## Warunki odbioru

- Dokument i artykuł zachowują oficjalny URL, hash pobranych bajtów, metodę ekstrakcji, kontekst i identyfikator wersji. Ponowne pobranie nie nadpisuje wcześniejszych wersji.
- Potwierdzenie pochodzenia tekstu nie oznacza potwierdzenia jego obowiązywania. `text.html` pierwotnego Kodeksu pracy zawiera brzmienie z 1974 r.; nie wolno oznaczyć go jako aktualnego z powodu świeżej daty pobrania.
- Zmiana metadanych lub zależności unieważnia potwierdzenie aktualności przed próbą przetworzenia nowego dokumentu. Błąd ekstrakcji zachowuje poprzedni dokument i zapisuje brak nowej wersji.
- Wyszukiwanie tekstowe działa bez encoderów. Wektory dokumentu i zapytania muszą pochodzić z tego samego, wersjonowanego indeksu i mieć dokładny wymiar; nie ma paddingu.
- Asystent używa tego samego odczytu co strona. Tekst przepisu przechodzi w kompletnych jednostkach; przy przekroczeniu budżetu odrzucana jest cała jednostka i jawnie sygnalizowany brak kontekstu.
- Historia obowiązywania jest dostępna tylko dla wersji z potwierdzonym zakresem dat. Wersje dokumentów można porównać bez udawania historii prawa.

## Zamrożony zakres pierwszego importu

Rodziny: Kodeks pracy (`DU/1974/141`), Kodeks cywilny (`DU/1964/93`), prawa konsumenta (`DU/2014/827`) i Kodeks postępowania administracyjnego (`DU/1960/168`). Katalog zależności obejmuje zmiany, uchylenia, teksty jednolite, przepisy wprowadzające i akty wykonawcze; limit lub niedostępna zależność oznaczają niepełne pokrycie. To zakres demonstracyjny, nie deklaracja znajomości całego prawa w tych obszarach.

Źródła: oficjalne ELI, dokumenty HTML z zachowaną strukturą, następnie PDF z tekstem. OCR nie jest automatycznie dopuszczany do odpowiedzi. Projekty, prawo UE, prawo miejscowe i orzecznictwo pozostają poza tym indeksem.

## Modele i pomiar

Qwen `qwen3-embedding:0.6b`, 1024 wymiary, jest punktem odniesienia. Inny model ma odrębny indeks z hashem modelu i transformacją zapytań; sama nazwa nie wystarcza. Reranker nie kwalifikuje wersji prawa i nie daje prawdopodobieństwa poprawności porady.

Porównanie jakości wymaga niezależnego zbioru 100–200 pytań zaakceptowanych przez człowieka, z rozdzielonymi częściami do strojenia i odbioru. Automatyczne testy regresji oraz propozycje pytań nie stanowią takiego zbioru. Raport nie ogłasza zwycięzcy bez zaakceptowanych etykiet. Mierniki: Recall@10, nDCG@10, zgodność wersji i daty, kompletność kontekstu, cytowania, odmowa przy brakach i p95 opóźnienia.

Dokumentacja źródłowa: [ELI OpenAPI](https://api.sejm.gov.pl/eli/openapi/), [wyszukiwanie hybrydowe w Supabase](https://supabase.com/docs/guides/ai/hybrid-search), [Qwen3 Reranker](https://huggingface.co/Qwen/Qwen3-Reranker-0.6B).

## Obsługa

Migracja `20261008091449_versioned_law.sql` jest przeznaczona do jednokrotnego zastosowania przez `psql` na self-hostowanej bazie. Na mixvm została już zastosowana 8 października 2026 wraz z uzupełnieniami z tego samego wdrożenia; nie uruchamiać jej ponownie na tym hoście. CLI Supabase wykorzystano do nadania nazwy pliku. Nie kierować operacji do zarządzanego projektu Asystenta.

`uv run python -m supagraf law bootstrap --year-from 1918 --year-to 2026` importuje katalog niezależnie od daty ostatniej zmiany; zakres lat dobrać świadomie. Pierwszy test katalogu `DU/1918` pobrał wszystkie 76 rekordów. Nie oznacza to importu całego historycznego katalogu. `law sync` pobiera metadane wybranych rodzin i ich bezpośrednich zależności, zachowuje oryginalny dokument i najnowszy znaleziony tekst jednolity. Limit nie stanowi dowodu kompletności. Źródła i raporty są w `artifacts/law-20261008/`.

`law embed --activate` buduje odrębny indeks artykułów. Model jest przypięty przez digest, wymiar, transformację zapytania i jawny limit natywnego kontekstu. Cache wiąże wektor z hashem całego wejścia, więc identyczne jednostki w nowej wersji można wykorzystać ponownie. Błędy przejściowe bramy są ponawiane dla idempotentnych zapisów; nieudany przebieg nie promuje indeksu i ma własny wpis `law_embed` w rejestrze ETL. `SUPAGRAF_ENABLE_LAW=1` włącza etap w istniejącym przebiegu dziennym; `--skip-embed` pozostaje respektowane. Domyślnie etap jest wyłączony do odbioru zakresu.

Potwierdzenie wersji wymaga zapisania zakresu dat, recenzenta, daty kontroli, rozstrzygniętych nowelizacji i uzasadnienia. `context_verified` i `coverage_verified` ustawia się po kontroli braków. Potrzebne definicje, wyjątki i przepisy przejściowe zapisuje się przez dokładne, niezmienne powiązania `law_context_links` ze źródłem kontroli; automatyczne odwołania wewnątrz dokumentu są jedynie kandydatami. Nie nadaje ich ETL ani model.

`/api/prawo/search`, `/api/prawo/unit/[id]` i `/api/prawo/changes` stanowią wspólny kontrakt strony i Asystenta. Zmiany są stronicowane. Pobranie jednostki może wymagać wskazanej wersji i odrzuca rozbieżność. Całe jednostki i kontekst przechodzą w jawnym budżecie; pominięcie blokuje oznaczenie kompletnej podstawy odpowiedzi. `OLLAMA_BASE_URL` udostępnia encoder zapytań przy infrastrukturze strony; brak encodera daje jawny wariant tekstowy. Opcjonalny reranker i bramka odbioru są opisane w [scripts/law/README.md](../scripts/law/README.md).

Pierwszy import: 4 rodziny, 8 dokumentów, 3429 jednostek; wszystkie wersje mają aktualność niepotwierdzoną, a ekstrakcje PDF wymagają kontroli. Pobrano metadane wszystkich bezpośrednich zależności w wybranym zakresie, ale nie potwierdzono zależności przechodnich ani pełnych tekstów wszystkich nowelizacji i rozporządzeń. To warunek dalszego odbioru, nie gotowa baza obowiązującego prawa.

## Pełny katalog ustaw

`uv run python -m supagraf law fulltext --workers 3 --output artifacts/law-fulltext` pobiera cały katalog ELI o typie `Ustawa`, bez filtra obowiązywania i bez ograniczenia do ostatnio zmienionych aktów. Zachowuje oryginalny tekst każdej ustawy i najnowszy wskazany przez ELI tekst jednolity. Manifest `catalog.json` wiąże import z datą, liczbą rekordów i hashem; duplikaty, zmiana liczby rekordów podczas stronicowania oraz przedwczesna pusta strona blokują uznanie katalogu za kompletny. `--refresh-catalog` odświeża manifest; `--limit` służy do próby i nigdy nie oznacza kompletnego importu.

Importer wznawia dokumenty potwierdzone w bazie z tą samą wersją parsera i metadanymi. Nie opiera wznowienia wyłącznie na lokalnym liczniku. Nieudany dokument pozostawia wcześniejszy tekst; błąd trafia do `law_roots.last_error`, `results.jsonl`, `progress.json` i rejestru `law_fulltext`. Końcowe `all_statutes_complete` jest prawdziwe tylko przy pokryciu całego zamrożonego katalogu bez błędów źródeł. Pliki źródłowe są archiwizowane pod hashem bajtów.

Pełny odczyt dokumentu, łącznie z tekstem poza artykułami, jest zapisany w `law_versions.notes.document_text`; artykuły pozostają jednostkami wyszukiwania. Dla nieznanej struktury zachowany jest tekst całego dokumentu lub jego stron. Skany są odczytywane lokalnym Tesseractem z językiem polskim, z pojedynczym aktywnym OCR. Takie jednostki mają jakość `needs_review`, nigdy automatyczne potwierdzenie brzmienia prawa. Niewystarczający OCR jest brakiem, a nie sukcesem importu. `--no-ocr` pozostawia skany jako jawne błędy.

`SUPAGRAF_ENABLE_LAW=1` i `SUPAGRAF_LAW_SCOPE=all_statutes` włączają pełny katalog w przebiegu dziennym. `SUPAGRAF_LAW_OUTPUT` wskazuje trwały katalog manifestu i źródeł, zamontowany poza jednorazowym kontenerem. W tym zakresie teksty od razu korzystają z indeksu pełnotekstowego; masowe embeddingi nie są uruchamiane przez import dokumentów ani automatycznie przez ten etap dzienny. Mają odrębny przebieg i nie stanowią kryterium kompletności pełnych tekstów.

Zakres dotyczy ustaw opublikowanych w ELI, w tym uchylonych i z przyszłym wejściem w życie. Nie oznacza pełnych tekstów wszystkich rozporządzeń, prawa UE, prawa miejscowego, orzeczeń ani automatycznie odtworzonego aktualnego brzmienia ustaw po wszystkich zmianach. Katalog strony jest stronicowany i przeszukiwany po nazwie; odnośniki między ustawami pobierają dane tylko wskazanych aktów.
