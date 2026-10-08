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
