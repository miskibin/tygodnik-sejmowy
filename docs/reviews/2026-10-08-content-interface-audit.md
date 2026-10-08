# Audyt treści i interfejsu — 8 października 2026

Zakres: kod frontendu, publiczny widok procesu 10/3030, historia zmian interfejsu i źródła urzędowe. Przegląd obejmuje reguły prezentacji danych oraz teksty interfejsu. Nie jest potwierdzeniem poprawności wszystkich historycznych streszczeń zapisanych w bazie.

## Znalezione i poprawione problemy

| Problem | Poprawka |
| --- | --- |
| Zakładki ukrywały historię, głosowania, wypowiedzi i dokumenty procesu. | Jeden widok renderowany na serwerze, z linkami do sekcji. |
| Głosowanie wybierano według roli i numeru, który zaczyna się od nowa na każdym posiedzeniu. | Chronologia: data, posiedzenie, numer. Wyraźna etykieta „Ostatnie głosowanie” i treść wniosku. |
| Dawne głosowanie mogło zastępować aktualny status sprawy. | Oddzielne informacje o ostatnim odnotowanym etapie, głosowaniu i publikacji. |
| Przyszłe lub niedatowane etapy wyglądały jak dokonany postęp. | Status opiera się na datowanych zdarzeniach do dzisiejszego dnia w Warszawie. Przyszłe wpisy są oznaczone jako zaplanowane. Dotyczy także zapytań katalogu. |
| Głosowanie przypisywano do etapu tylko dlatego, że odbyło się tego samego dnia. | Wymagane zgodne posiedzenie i numer głosowania w źródle. |
| Katalog nadawał każdemu przyjętemu dokumentowi etap „Promulgation”. | Samo zakończenie postępowania nie generuje informacji o publikacji. |
| Rozpatrywanie stanowiska Senatu lub weta przypisywano niewłaściwemu organowi. | Etapy rozpatrywane przez Sejm trafiają do grupy sejmowej; odrzucone i wycofane sprawy mają osobną grupę. |
| Niepełne dane mogły dać pozornie pewny wynik głosowania. | Brak wymaganej większości przy wecie/poprawkach Senatu, zerowe wyniki i nieprawidłowy próg nie generują rozstrzygnięcia. |
| Klasyfikacja AI mogła zamienić wniosek proceduralny w uchwalenie ustawy. | Jednoznaczna treść proceduralna ma pierwszeństwo. Nieznany rodzaj projektu nie jest automatycznie ustawą. |
| Liczebność całej grupy społecznej wyglądała jak liczba osób objętych projektem. | Usunięte nieudokumentowane liczby i generowane „co możesz zrobić”. |
| Daty bez czasu mogły przesuwać się zależnie od strefy serwera. | Daty procesu i głosowań formatowane w Europe/Warsaw. |
| Etapy pracy komisji przedstawiano jako liczbę jej posiedzeń. | Oddzielone rzeczywiste posiedzenia od wpisów w historii procesu; głębokość rekordu nie udaje numeru etapu. |
| Pusty wynik zapytania i błąd pobierania danych bywały nierozróżnialne. | Katalog procesów, posłów i wypowiedzi nie zamienia błędów w zera lub zapowiedzi funkcji. |
| Cytaty z listy wypowiedzi nie były sprawdzane względem stenogramu. | Sprawdzenie dosłownego wystąpienia w wypowiedzi wskazanego mówcy. Fragment zastępczy pochodzi z jego tekstu, poza wtrąceniami. |
| Sondaże odwoływały się do „15. kadencji” i deklarowanego składu rządu z Razem. | Jawne zestawy partii jako scenariusze arytmetyczne, bez przypisywania im statusu bieżącej koalicji. |
| Opis modelu mandatowego obiecywał próg 8%, którego kod nie stosuje. | Jawny opis uproszczenia: 5% dla każdej listy, jeden okręg, największe reszty; brak realnych okręgów, D’Hondta i wyjątków ustawowych. To nadal model ilustracyjny. |
| TD i jej składowe mogły dostawać mandaty jednocześnie. | Usunięcie podwójnego liczenia wspólnej listy i jej części. |
| Opis komisji śledczej sugerował funkcję sądu. | Opis ograniczony do badania określonej sprawy. |

## Zmiany interfejsu

- Wspólny nagłówek, szerokość treści, typografia i kolory katalogów. Proces i tygodnik korzystają ze wspólnych zmiennych motywu zamiast osobnych palet.
- Cztery główne linki: Tygodnik, Procesy, Prawo, Posłowie. Pozostałe sekcje w grupach: Prace Sejmu, Analizy, Serwis. Ta sama struktura na telefonie i komputerze.
- Lista wypowiedzi bez automatycznej karuzeli, ozdobnych haseł i ujawniania wewnętrznego `viral_score`.
- Usunięte puste zapowiedzi, powtarzane nagłówki i dekoracyjne opisy. Zachowane daty, źródła, zakres danych i ograniczenia metody.

## Weryfikacja

- 46 testów offline: `test_process_view.mjs`, `test_legislative_facts.mjs`, `test_weekly_stories.mjs`, `test_weekly_markdown.mjs`.
- Test renderowania procesu potwierdza obecność sekcji w HTML bez stanu zakładek, jeden nagłówek H1, oznaczenie przyszłego zdarzenia i prawidłową datę dokumentu.
- TypeScript: `tsc --noEmit`.
- ESLint zmienionych plików TypeScript/TSX i testów.
- Kompilacja tras: `next build --experimental-build-mode compile`. Ten tryb nie wykonuje prerenderowania z produkcyjnej bazy.

## Źródła i ograniczenia

- [Konstytucja RP — urzędowy tekst na stronie Senatu](https://www.senat.gov.pl/o-senacie/wybrane-akty-prawne/konstytucja/), szczególnie art. 111, 120–123 i 223–224.
- [API Sejmu: proces 10/3030](https://api.sejm.gov.pl/sejm/term10/processes/3030): rozdzielenie daty dokumentu, zdarzeń w historii i statusu projektu.
- Kod zapytań, klasyfikacji i modelu mandatowego w repozytorium.

Brak dostępu do produkcyjnej bazy uniemożliwił pełne testy integracyjne, prerenderowanie z rzeczywistymi danymi i audyt wszystkich zapisanych streszczeń AI. Nie zmieniano rekordów bazy ani treści historycznych analiz. Lokalny podgląd nie był osiągalny z przeglądarki; nie potwierdzono wizualnie nowego układu na urządzeniach. Przed wdrożeniem należy obejrzeć preview procesu, menu oraz katalogów na telefonie i komputerze.
