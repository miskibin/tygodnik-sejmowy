# Zdjęcia w tygodniku — 12.09.2026

Źródła:
- [Galeria Sejmu](https://www.sejm.gov.pl/sejm10.nsf/galleries.xsp): bezpłatne wykorzystanie z podaniem autora. Dobre źródło zdjęć z posiedzeń; obecnie automatyczny dostęp zwraca 403 / human verification, więc scraper nie został włączony.
- [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia): działający provider. [Imageinfo API](https://www.mediawiki.org/wiki/API:Imageinfo) dostarcza autora, licencję, datę, wymiary i źródło. Prawa weryfikujemy dla każdego pliku.
- Gov.pl nie ma jednolitych zasad dla wszystkich fotografii; [Commons opisuje zmianę licencji w 2022](https://commons.wikimedia.org/wiki/Template:Gov.pl/pl). Nie włączamy ogólnego scrapera.

## Dopasowanie

`supagraf/enrich/image_catalog.json` zawiera cztery wizualnie sprawdzone fotografie: wybory, ETPC, kąpieliska i elektrownie wiatrowe. Reguła musi pasować do tytułu dokumentu lub jego krótkiego tytułu. Dwa konkurujące tematy oznaczają brak zdjęcia. Jest to niewielki katalog redakcyjny, nie otwarte wyszukiwanie ani dobór przez LLM. Kolejny temat wymaga sprawdzonego pliku i konkretnej reguły.

Etap `enrich:images` w codziennym ETL działa po podsumowaniach druków, domyślnie dla ostatniego posiedzenia z głosowaniem. Korzysta z tego samego zakresu dokumentów co scoped enrichment. Nie wykonuje archiwalnego backfillu.

```powershell
.venv/Scripts/python.exe -m supagraf enrich images --sitting 64 --dry-run
.venv/Scripts/python.exe -m supagraf enrich images --sitting 64
```

Weryfikacja: autor, CC BY / CC BY-SA / CC0, adres licencji, ograniczenia, typ i rozmiar obrazu. Tabela `print_images` przechowuje matched/no_match, fingerprint tematu i katalogu, datę oraz metadane. RLS daje publiczny odczyt wyłącznie matched; ETL zapisuje przez service role. Niezmienione wyniki pomija przez 30 dni; zmiana tytułu/katalogu wymusza sprawdzenie. Awaria źródła zachowuje wcześniejszy wynik do ponowienia. Zero wywołań LLM.

Migracja `20260912112240_weekly_story_images.sql` została zastosowana w self-hosted DB. Inne instalacje wymagają jej przed uruchomieniem nowego etapu.

Frontend pokazuje najwyżej jedno zdjęcie głównego dokumentu, autora, źródło i licencję w rozwijanym „Źródło zdjęcia”. Next Image optymalizuje rozmiar, ładuje lazy, bez kadrowania. Awaria obrazu chowa fotografię, a awaria zapytania o media nie blokuje artykułów.

## Weryfikacja

Posiedzenie 64: 3 zdjęcia (druki 2670, 2271, 2866), 30 bez dopasowania, 0 błędów. Ponowienie: 33 pominięte. Podsumowania pozostały nietknięte.

8 testów zdjęć; pełny zestaw Python: 478 passed, 11 skipped. TypeScript i celowany ESLint przeszły. Przeglądarka potwierdziła trzy załadowane fotografie oraz brak błędów i overflow na desktop/mobile. Artefakty: `artifacts/ui-cleanup-20260912/images-run.json`, `photos-browser.json`, `photos-desktop.png`, `photos-mobile.png`.

Dane są już w bazie. Kod ETL i frontend wymagają publikacji; w tej sesji nie wdrażano kontenerów.
