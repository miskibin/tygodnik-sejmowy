# Tygodnik: układ redakcyjny i powiązania danych — 9 września 2026

Sprawdzone na rzeczywistych danych self-hosted Supabase i lokalnym Next.js. Po wyraźnej zgodzie użytkownika zastosowano poniższą naprawę relacji dla posiedzenia 64 w produkcyjnej bazie.

## Ustalona przyczyna braków

- Posiedzenie 64 ma 950 wypowiedzi, w tym 395 z `viral_quote`, oraz 65 głosowań. Wszystkie wypowiedzi miały puste `primary_print_id`, a głosowania nie miały `voting_print_links`.
- Początkowy porządek obrad w `agenda_items` ma 16 pozycji i inną numerację od stenogramu. Planowany punkt 1 dotyczył szkód wyrządzanych przez ptaki; rzeczywisty punkt 1 dotyczył reklamy politycznej, a ptaki punktu 31. Samo połączenie po numerze punktu błędnie przypisuje wypowiedzi do projektów.
- `viral_quote_events_v` przypisuje temat przez następne chronologicznie głosowanie. Ta heurystyka nie identyfikuje debaty, do której należy wypowiedź.
- Codzienny etap ładowania nie uruchamiał uzupełnienia relacji wypowiedź–druk i głosowanie–druk.
- Głosowania `ON_LIST` mają zerowe zbiorcze `yes/no/abstain`; wyniki dotyczą poszczególnych kandydatur i nie są zapisane w znormalizowanej tabeli `votings`.

## Widok

Jedna zajawka odpowiada punktowi rzeczywistych obrad. Wspólna debata nad kilkoma projektami pozostaje jedną zajawką. Układ to spokojna kolumna artykułów z delikatnymi separatorami, krótkim omówieniem, wynikiem i cytatem; bez kart, ciemnego hero, osobnych sekcji na każdy rodzaj danych i rzędów filtrów. Archiwum jest jednym wyborem posiedzenia, filtry otwierają się jednym przyciskiem.

Wyniki mają kolorowe paski za/przeciw/wstrzymanie, a weto także znacznik wymaganej większości. Kandydatury mają osobne paski z liczbą głosów; poprawki Senatu — kolorowe znaczniki wyników poszczególnych głosowań. Druki są podpisane krótkimi tytułami, z numerem w podpowiedzi. Filtry otwierają wyśrodkowany dialog na desktopie i panel przy dolnej krawędzi na telefonie. Sprawdzono pozycję obu wariantów oraz zamknięcie klawiszem Escape z powrotem fokusu na przycisk.

`lib/db/weekly-stories.ts` pobiera wszystkie strony stenogramów i głosowań; pełne stenogramy zostają na serwerze. `lib/weekly-stories.ts` łączy dane na podstawie faktycznych nagłówków i jawnych numerów druków. Cytat pochodzi dosłownie z wypowiedzi, z pominięciem powitań i wtrąceń innych mówców. Brak `viral_quote` nie blokuje użycia prawdziwego zdania ze stenogramu. Posiedzenie 64 daje 33 zajawki i 31 cytatów; nie wymuszamy cytatu z samego proceduralnego wyliczenia ani z punktu bez zapisanej wypowiedzi.

Wynik opisuje przedmiot głosowania: upadek wniosku o odrzucenie nie oznacza odrzucenia projektu, uchwała nie jest ustawą, a weto wymaga kwalifikowanej większości. Poprawki Senatu są przyjęte, jeśli wniosek o ich odrzucenie nie uzyska bezwzględnej większości — również przy skróconym temacie „poprawka 1”. Zbiorcze omówienie uwzględnia wszystkie głosowania nad poprawkami. Kandydatury i ich wyniki są pobierane z oficjalnego API Sejmu; przy jego niedostępności pozostaje neutralna etykieta i link do źródła, bez interpretowania zer.

Założenia projektu są opisane jako założenia, oddzielnie od rozstrzygnięcia Sejmu. Samo uchwalenie ustawy nie jest przedstawiane jako jej wejście w życie.

## Przygotowana naprawa ETL

`supagraf/backfill/sitting_links.py` tworzy relacje z jawnych numerów druków w nagłówku stenogramu. Pomija przypadkowe wzmianki z treści przemówienia i nie wykorzystuje nieaktualnego numeru z planu. Raport komisji nie jest traktowany jak konkurencyjny projekt. Pojedynczy rozpoznany projekt pozwala uzupełnić pusty `primary_print_id`; wspólne debaty zachowują wiele powiązań bez zgadywania głównego projektu. Zapisy ignorują istniejące relacje i nie zastępują istniejącego przypisania głównego projektu.

Etap jest podłączony do codziennego importu dla zmienionych posiedzeń, z ponowieniem dla ostatnich 14 dni, gdy zmieniły się tylko druki. Poprawiono także stary backfill, aby nie odtwarzał błędnych relacji z planowanego numeru punktu.

Audyt bez zapisu:

```powershell
.venv/Scripts/python.exe -m supagraf.backfill.sitting_links --sitting 64
```

Zastosowano skrypt z `--apply`. Osobny odczyt zweryfikował wszystkie 1373 relacje wypowiedź–druk, 124 relacje głosowanie–druk i 495 przypisań głównego projektu. Pozostało 0 pustych przypisań, które ten algorytm może rozstrzygnąć jednoznacznie.

Użytkownik zatwierdził naprawę po pierwotnym zatrzymaniu zapisu przez automatyczną kontrolę uprawnień. Zapis zakończył się poprawnie. Nie wykonywano DDL, wdrożenia frontendu ani płatnych wywołań LLM.

Zgodnie z korektą użytkownika wybór cytatów preferuje emocjonalne fragmenty `viral_quote`, następnie najwyższy `viral_score`. Dopasowanie słów do tytułu rozstrzyga tylko remisy; zwykłe zdanie jest opcją zastępczą. Cytat nadal musi dosłownie występować w wypowiedzi właściwego autora, w tej samej debacie. Fragment urwany w połowie zdania jest uzupełniany do końca zdania z oryginału, z zachowaniem limitu długości zajawki.

## Pozostałe usunięte dane zastępcze

- Patronite: przy braku danych nie pokazujemy zer, procentów ani zmyślonych progów i etykiety „najpopularniejszy”. Pozostaje informacja o niedostępności i link do aktualnych warunków.
- Koszty 100 + 100 + 400 zł są oznaczone jako szacunki; usunięto fikcyjną sumę sześciu miesięcy. Dane rzeczywiste sumują pozycje ostatniego miesiąca.
- Atlas: brak klubu/frekwencji to `null` i neutralna prezentacja, bez statycznych zastępczych wartości dla 41 okręgów.

## Weryfikacja

- `node frontend/scripts/test_weekly_stories.mjs`: 16 testów rzeczywistej implementacji TS, w tym progi weta, odrzucenie projektu, poprawki Senatu, kandydatury, wspólna debata, autorstwo cytatów oraz pierwszeństwo i kompletność fragmentów viralowych.
- `pytest tests/supagraf/unit tests/supagraf/contract -q`: 405 zaliczonych, 11 pominiętych; 2 istniejące ostrzeżenia klienta Supabase.
- TypeScript `tsc --noEmit` i ESLint zmienionych modułów tygodnika: zaliczone.
- Playwright na lokalnej aplikacji: 33 unikalne zajawki, rozwijanie głosowań i kolejnych spraw, filtry i ich URL, archiwalne posiedzenie 63, przyszłe 65, mobilny panel filtrów, brak poziomego przewijania, jasny/ciemny motyw, brak błędów przeglądarki.
- Poprzednia weryfikacja budżetu, manifestu i Atlasu pozostaje aktualna; te zmiany nie były ponownie modyfikowane przy korekcie układu.
- Zrzuty lokalne: `.tmp-preview/editorial-desktop.png`, `.tmp-preview/editorial-mobile.png`, `.tmp-preview/editorial-dark.png`. Serwer: `http://127.0.0.1:3000/tygodnik`.
