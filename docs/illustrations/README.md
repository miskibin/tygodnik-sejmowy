# Pipeline ilustracji artykułów

Pipeline działa z repozytorium przez `supagraf enrich images-pipeline`. Przygotowuje gotowe pliki, wybór i galerię do oceny. Nie zmienia `print_images`, ETL harmonogramu ani fotografii na stronie produkcyjnej; dotychczasowa komenda `enrich images` zachowuje swoje działanie.

## Uruchomienie

W ignorowanym przez Git `.env` wymagany jest `DEEPSEEK_API_KEY`. `PIXABAY_API_KEY` umożliwia wyszukiwanie stocków. Klucze nie są kopiowane na SFGPU ani do raportów.

```powershell
# Tylko pierwsze przygotowanie lub zmiana workera/modelu (bez inferencji GPU):
powershell -ExecutionPolicy Bypass -File scripts/illustrations/prepare-runtime.ps1

# Pełny przebieg dla podanych artykułów:
uv run python -m supagraf enrich images-pipeline --input docs/illustrations/articles.example.json --output artifacts/illustrations/my-run --generate
```

Plik wejściowy to lista 1–20 obiektów:

```json
[{"term":10,"number":"2866","title":"Jakość wody w kąpieliskach — nowe obowiązki","summary":""}]
```

`summary` jest opcjonalnym rzeczywistym streszczeniem artykułu, nie polem do dopisywania brakujących faktów. Bez `--generate` lokalny model nie jest wywoływany; pozyskanie fotografii dla tematów wymagających autentycznego źródła nadal działa.

## Kolejne etapy

1. **DeepSeek Flash — plan.** Krótki, wersjonowany prompt daje strukturę: temat, uzasadnienie, trasa, prompt lub maksymalnie dwa zapytania. Sceny ogólne mogą być generowane. Nazwana instytucja, konkretne miejsce, osoba lub wydarzenie wymagają rzeczywistego źródła. Brak odpowiedniej ilustracji może zakończyć się bez obrazu.
2. **Wybór źródła.** Dla ETPC rejestr `sourcing.AUTHENTIC_SOURCES` wskazuje wcześniej potwierdzone zdjęcie budynku w Strasburgu. Inne tematy korzystają z wyszukiwania Commons lub Pixabay. Autor, licencja i opis pochodzą z odpowiedzi źródła, nigdy z promptu. Filtr `photo` Pixabay nie dowodzi, że zdjęcie nie jest generowane.
3. **SFGPU.** FLUX.2 klein 4B, snapshot `e7b7dc27f91deacad38e78976d1f2b499d76a294`, cztery kroki, 1536×1024, deterministyczne seedy, maksymalnie dwa obrazy na artykuł. Odrębny kontener bez sieci; model z własnego cache. Kontrola wolnej pamięci przed startem. Pipeline nie przerywa cudzych procesów. UID/GID 1000 oraz alias `sfgpu` opisują obecne środowisko.
4. **DeepSeek vision — kontrola pełnego kadru i czterech ćwiartek.** Wymagana jest kompletna, płaska odpowiedź JSON. Ocena dotyczy zgodności tematu, geometrii, ludzi/twarzy, napisów/logo oraz widocznych artefaktów. Dla konkretnej instytucji wymagane są zgodne metadane źródłowe. Samo pochodzenie AI nie dyskwalifikuje wygenerowanej ilustracji. Niepewność nie jest akceptacją.
5. **Wybór.** Pierwszy kandydat, który przeszedł wszystkie wymagane kontrole, trafia do `selected.json`. Jeśli żaden nie przejdzie, pipeline nie wymyśla zastępczego zdjęcia. Zapisana decyzja nie uruchamia publikacji.

## Wyniki i koszty

- `index.html` — przenośna galeria z obrazami i powodami decyzji.
- `report.json` — cały audyt, prompty, źródła, parametry modelu, hashe i tokeny; `metrics.llm_usage.estimated_usd` to estymacja istniejącego klienta DeepSeek, nie faktura.
- `selected.json` — wybrane kandydatury i metadane do późniejszego podłączenia publikacji.
- `assets/` — pobrane i wygenerowane pliki, bez hotlinkowania obrazów stockowych.
- Cache planów, kandydatów i recenzji pomija ponowne wywołania przy niezmienionym wejściu. Zmiana promptu, wersji modelu/runtime'u, polityki odrzuceń lub bajtów obrazu unieważnia odpowiedni etap. Fotografie źródłowe są ponownie sprawdzane po 24 godzinach. Brak pliku unieważnia cache.

Jedno nowe wejście wykorzystuje jedną krótką ocenę planującą i maksymalnie dwie oceny obrazów. Wspólny klient DeepSeek ma ograniczone ponowienia błędów przejściowych, więc liczba płatnych wywołań w `llm_usage.calls` może przekroczyć liczbę logicznych etapów. Brak niekończącego się dobierania seedów lub automatycznego podnoszenia modelu do Pro. Błąd infrastruktury zapisuje raport i powoduje kod wyjścia 3.

## Feedback i ograniczenia

Dwa odrzucone przez użytkownika wnętrza z pierwszej próby mają zapisane SHA-256 w `review.REJECTED_SHA256`. Ten sam plik nie wróci po zmianie nazwy. Prompty nie proponują fikcyjnych sal sądowych. Tę regułę można z czasem zastąpić większym, ocenionym zestawem przykładów.

Model kontrolny pozostaje omylny. `approved` oznacza przejście kontroli automatycznej, nie dowód realności sceny. Utrzymujemy osobny podgląd przed ewentualną publikacją. Testy obejmują błędne instytucje, niepewne oceny, brak obrazu, uszkodzony cache, geometrię danych wejściowych, sekrety w błędach i ograniczenia zasobów.

## Źródła techniczne

- FLUX.2 klein 4B: https://huggingface.co/black-forest-labs/FLUX.2-klein-4B
- DeepSeek JSON: https://api-docs.deepseek.com/guides/json_mode/
- Pixabay API: https://pixabay.com/api/docs/
- Commons Imageinfo: https://www.mediawiki.org/wiki/API:Imageinfo

## Zweryfikowany przebieg — 12 września 2026

Trzy artykuły, sześciu kandydatów: cztery generacje (jezioro/wiatrak) oraz dwa autentyczne zdjęcia ETPC. Kontrola szczegółów odrzuciła fotografię `(2).jpg` z widocznym graffiti i wybrała `(1).jpg`. Wszystkie trzy artykuły otrzymały kandydaturę w `selected.json`; odrzucone wnętrza są wyłączone trwałą polityką redakcyjną. Galeria wyników: `artifacts/image-trial-20260912/pipeline-v1/index.html`.

Pełna ocena sześciu kandydatów z analizą zbliżeń zużyła 18 001 tokenów wejścia i 662 wyjścia; estymacja klienta wyniosła około 0,0028 USD za ten etap (bez wcześniejszych prób deweloperskich). Ponowne wykonanie tego samego przebiegu korzysta z cache; osobny `cached-run.json` dokumentuje zerowe wywołania.
