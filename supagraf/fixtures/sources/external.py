"""Prepare external fixtures (districts, postcodes, promises).

These resources are NOT from api.sejm.gov.pl. They're composed from PKW
(districts), GUS TERYT (postcodes), and party manifestos (promises).

Each `prepare_*` function emits per-entity JSON fixtures that downstream
`stage_*` runners pick up under fixtures/external/<resource>/.
"""
from __future__ import annotations

from pathlib import Path

from loguru import logger

from supagraf.fixtures.storage import write_json


# ---------- districts ----------

# 41 Sejm electoral districts (term 10 / 2023+).
# Source: pl.wikipedia.org/wiki/Okręgi_wyborcze_do_Sejmu_RP, cross-checked
# against PKW. Seat names match PKW's official designation (e.g. district 12
# = Chrzanów, NOT "Kraków podkrakowski"). Mandates total = 460.
DISTRICTS_TERM_10: list[dict] = [
    {"num": 1,  "name": "Legnica",              "voivodeship": "dolnośląskie",         "mandates": 12},
    {"num": 2,  "name": "Wałbrzych",            "voivodeship": "dolnośląskie",         "mandates": 8},
    {"num": 3,  "name": "Wrocław",              "voivodeship": "dolnośląskie",         "mandates": 14},
    {"num": 4,  "name": "Bydgoszcz",            "voivodeship": "kujawsko-pomorskie",   "mandates": 12},
    {"num": 5,  "name": "Toruń",                "voivodeship": "kujawsko-pomorskie",   "mandates": 13},
    {"num": 6,  "name": "Lublin",               "voivodeship": "lubelskie",            "mandates": 15},
    {"num": 7,  "name": "Chełm",                "voivodeship": "lubelskie",            "mandates": 12},
    {"num": 8,  "name": "Zielona Góra",         "voivodeship": "lubuskie",             "mandates": 12},
    {"num": 9,  "name": "Łódź",                 "voivodeship": "łódzkie",              "mandates": 10},
    {"num": 10, "name": "Piotrków Trybunalski", "voivodeship": "łódzkie",              "mandates": 9},
    {"num": 11, "name": "Sieradz",              "voivodeship": "łódzkie",              "mandates": 12},
    {"num": 12, "name": "Chrzanów",             "voivodeship": "małopolskie",          "mandates": 8},
    {"num": 13, "name": "Kraków",               "voivodeship": "małopolskie",          "mandates": 14},
    {"num": 14, "name": "Nowy Sącz",            "voivodeship": "małopolskie",          "mandates": 10},
    {"num": 15, "name": "Tarnów",               "voivodeship": "małopolskie",          "mandates": 9},
    {"num": 16, "name": "Płock",                "voivodeship": "mazowieckie",          "mandates": 10},
    {"num": 17, "name": "Radom",                "voivodeship": "mazowieckie",          "mandates": 9},
    {"num": 18, "name": "Siedlce",              "voivodeship": "mazowieckie",          "mandates": 12},
    {"num": 19, "name": "Warszawa",             "voivodeship": "mazowieckie",          "mandates": 20},
    {"num": 20, "name": "Warszawa II",          "voivodeship": "mazowieckie",          "mandates": 12},
    {"num": 21, "name": "Opole",                "voivodeship": "opolskie",             "mandates": 12},
    {"num": 22, "name": "Krosno",               "voivodeship": "podkarpackie",         "mandates": 11},
    {"num": 23, "name": "Rzeszów",              "voivodeship": "podkarpackie",         "mandates": 15},
    {"num": 24, "name": "Białystok",            "voivodeship": "podlaskie",            "mandates": 14},
    {"num": 25, "name": "Gdańsk",               "voivodeship": "pomorskie",            "mandates": 12},
    {"num": 26, "name": "Słupsk",               "voivodeship": "pomorskie",            "mandates": 14},
    {"num": 27, "name": "Bielsko-Biała",        "voivodeship": "śląskie",              "mandates": 9},
    {"num": 28, "name": "Częstochowa",          "voivodeship": "śląskie",              "mandates": 7},
    {"num": 29, "name": "Gliwice",              "voivodeship": "śląskie",              "mandates": 9},
    {"num": 30, "name": "Rybnik",               "voivodeship": "śląskie",              "mandates": 9},
    {"num": 31, "name": "Katowice",             "voivodeship": "śląskie",              "mandates": 12},
    {"num": 32, "name": "Sosnowiec",            "voivodeship": "śląskie",              "mandates": 9},
    {"num": 33, "name": "Kielce",               "voivodeship": "świętokrzyskie",       "mandates": 16},
    {"num": 34, "name": "Elbląg",               "voivodeship": "warmińsko-mazurskie",  "mandates": 8},
    {"num": 35, "name": "Olsztyn",              "voivodeship": "warmińsko-mazurskie",  "mandates": 10},
    {"num": 36, "name": "Kalisz",               "voivodeship": "wielkopolskie",        "mandates": 12},
    {"num": 37, "name": "Konin",                "voivodeship": "wielkopolskie",        "mandates": 9},
    {"num": 38, "name": "Piła",                 "voivodeship": "wielkopolskie",        "mandates": 9},
    {"num": 39, "name": "Poznań",               "voivodeship": "wielkopolskie",        "mandates": 10},
    {"num": 40, "name": "Koszalin",             "voivodeship": "zachodniopomorskie",   "mandates": 8},
    {"num": 41, "name": "Szczecin",             "voivodeship": "zachodniopomorskie",   "mandates": 12},
]


def prepare_districts_fixtures(out_root: Path, term: int = 10) -> int:
    """Write one JSON per district to fixtures/external/districts/<num>.json."""
    dest_dir = out_root / "external" / "districts"
    total_mandates = sum(d["mandates"] for d in DISTRICTS_TERM_10)
    if total_mandates != 460:
        raise ValueError(f"district mandate total = {total_mandates}, expected 460")

    for d in DISTRICTS_TERM_10:
        payload = {
            "term": term,
            "num": d["num"],
            "name": d["name"],
            "voivodeship": d["voivodeship"],
            "mandates": d["mandates"],
            "seat_city": d["name"],
        }
        write_json(dest_dir / f"{d['num']}.json", payload)
    logger.info("wrote {} district fixtures to {}", len(DISTRICTS_TERM_10), dest_dir)
    return len(DISTRICTS_TERM_10)


# ---------- promises: KO "100 konkretow" ----------

# Source: https://100konkretow.pl/wszystkie-konkrety/
# Each tuple: (english_slug, polish_text). Slug is normative for natural_id;
# polish_text is BOTH the title (truncated to 200) and the normalized_text
# (full). Status defaults to 'in_progress' -- reviewer updates after match.
# Refetched 2026-05-14: full Polish diacritics restored verbatim from upstream.
KO_100_KONKRETOW: list[tuple[str, str]] = [
    ("ivf-state-funding", "Na stałe wprowadzimy finansowanie in vitro z budżetu państwa. Na finansowanie procedury in vitro przeznaczymy nie mniej niż 500mln zł. – tak by pary, które chcą mieć dzieci miały dostęp do najnowocześniejszych metod."),
    ("medical-appointment-system", "Wprowadzimy łatwy w obsłudze i czytelny system rezerwacji wizyt (sms-y, maile) na kształt funkcjonującego w systemie prywatnym. W ten sposób ograniczymy liczbę nieodbytych wizyt, a tym samym skrócimy kolejki."),
    ("dental-care-children-voucher", "Wprowadzimy bon na profilaktykę i leczenie stomatologiczne dla dzieci i młodzieży do wykorzystania w każdym gabinecie stomatologicznym. Przywrócimy opiekę dentystyczną w szkołach podstawowych."),
    ("income-tax-relief-and-allowance", "Obniżymy podatki. Osoby zarabiające do 6000 zł brutto (także na działalności gospodarczej) i pobierające emeryturę do 5000 zł brutto nie będą płaciły podatku dochodowego. Podniesiemy kwotę wolną od podatku – z 30 tys. zł do 60 tys. zł., w przypadku podatników rozliczających się według skali podatkowej, w tym także przedsiębiorców i emerytów."),
    ("cash-pit-for-entrepreneurs", "Przedsiębiorcy zapłacą podatek dochodowy dopiero po otrzymaniu środków z tytułu zapłaconej faktury (kasowy PIT)."),
    ("teacher-salary-increase-30pct", "Podniesiemy wynagrodzenia nauczycieli o co najmniej 30%. Nie mniej niż 1500zł brutto podwyżki dla nauczyciela. Wprowadzimy stały system automatycznej rewaloryzacji. Przywrócimy autonomię i prestiż zawodu nauczyciela – mniej biurokracji, większa niezależność w doborze lektur, rozszerzaniu tematów."),
    ("second-pension-indexation", "Wprowadzimy drugą waloryzację emerytur i rent, gdy inflacja będzie przekraczała 5%."),
    ("disability-pension-work-trap", "Zlikwidujemy tzw. „pułapkę rentową”: osoby z niepełnosprawnością będą mogły pracować nie tracąc renty."),
    ("abortion-12-weeks-legal", "Aborcja do 12 tygodnia ciąży będzie legalna, bezpieczna i dostępna. Żaden szpital działający w ramach z NFZ nie będzie mógł zasłonić się klauzulą sumienia i odmówić zabiegu. Decyzja musi należeć do kobiety."),
    ("free-childbirth-anesthesia", "Zapewnimy prawo do bezpłatnego znieczulenia przy porodzie."),
    ("free-prenatal-testing", "Zapewnimy pełny dostęp do darmowych badań prenatalnych."),
    ("emergency-contraception-otc", "Zapewnimy dostęp do „antykoncepcji awaryjnej” bez recepty."),
    ("active-mom-1500-zl", "Wspieramy kobiety wracające na rynek pracy po urodzeniu dziecka: w ramach programu „Aktywna mama” wypłacimy 1500 zł miesięcznie na opiekę nad dzieckiem – tzw. „babciowe”."),
    ("forest-protection-no-logging", "Wyłączymy najcenniejsze przyrodniczo obszary lasów z wycinki i przeznaczymy je tylko na funkcje przyrodnicze i społeczne."),
    ("raw-wood-export-curb", "Zatrzymamy niekontrolowany wywóz nieprzetworzonego drewna z Polski. Surowiec z polskich lasów powinien służyć przede wszystkim polskim przetwórcom."),
    ("church-fund-elimination", "Zlikwidujemy Fundusz Kościelny."),
    ("religion-grades-off-certificates", "Ocena z religii zostanie wykreślona ze świadectw szkolnych."),
    ("religion-classes-first-or-last", "Religia w szkołach tylko na pierwszej lub ostatniej lekcji."),
    ("funeral-benefit-150pct-min-wage", "Podniesiemy zasiłek pogrzebowy do 150% płacy minimalnej – czyli od lipca 2024 będzie to 6450 zł. Obecnie to 4000zł."),
    ("polish-food-50pct-shelf-share", "Co najmniej połowa strategicznych produktów żywnościowych w sklepach musi pochodzić z Polski. Wprowadzimy obowiązek oznaczania flagą kraju pochodzenia wszystkich świeżych produktów w sklepach."),
    ("sunday-trade-ban-repeal", "Zniesiemy zakaz handlu w niedziele, ale każdy pracownik będzie miał zapewnione dwa wolne weekendy w miesiącu i podwójne wynagrodzenie za pracę w dni wolne."),
    ("constitutional-tribunal-of-state", "Łamanie Konstytucji i praworządności będzie szybko rozliczone i osądzone. W tym celu postawimy przed Trybunałem Stanu: Andrzeja Dudę – za odmowę przyjęcia ślubowania od trzech prawidłowo wybranych przez Sejm VII kadencji sędziów Trybunału Konstytucyjnego oraz za zastosowanie prawa łaski w stosunku do nieprawomocnie skazanych Mariusza Kamińskiego, Macieja Wąsika i dwóch innych funkcjonariuszy, Mateusza Morawieckiego – za wydanie decyzji polecającej Poczcie Polskiej przeprowadzenie nielegalnych wyborów kopertowych, Jacka Sasina – za bezprawne wydanie 70mln zł na wybory kopertowe, Zbigniewa Ziobro – za wykorzystywanie do celów partyjnych środków finansowych z Funduszu Sprawiedliwości, Adama Glapińskiego – za zniszczenie niezależności Narodowego Banku Polskiego i brak realizacji podstawowego zadania NBP, jakim jest walka z drożyzną, Przewodniczącego KRRiT Macieja Świrskiego i ministra kultury i dziedzictwa narodowego Piotra Glińskiego, obu za zniszczenie mediów publicznych."),
    ("criminal-prosecution-pis-officials", "Złożymy wnioski do niezależnej, odpolityczniającej prokuratury o pociągnięcie do odpowiedzialności karnej następujących osób: Jarosława Kaczyńskiego – za sprawstwo kierownicze i usiłowanie zmiany ustroju państwa, Łukasza Szumowskiego – za miliony wydane na niesprawne respiratory, Janusza Cieszyńskiego – za współudział w aferze respiratorowej, Antoniego Macierewicza – za ukrywanie wyników badań, które zaprzeczały tezie o wybuchu w Smoleńsku, za zniszczenie polskiego kontrwywiadu i działania na rzecz Rosji, odpowiedzialnych za bezprawny zakup i inwigilowanie obywateli Pegasusem, hejterów, którzy wykorzystywali informacje pozyskane z ministerstwa sprawiedliwości do szkalowania niezależnych sędziów, odpowiedzialnych za zmarnowanie miliardów złotych na budowę elektrowni w Ostrołęce, prokuratorów usiłujących uchylić immunitet i wszczynających bezpodstawne postępowania karne przeciwko niezawisłym sędziom za wydawane przez nich orzeczenia, policjantów, którzy pobili kobiety protestujące przeciwko barbarzyńskiemu orzeczeniu Trybunału Przyłębskiej w sprawie aborcji, komendanta Jarosława Szymczyka za użycie granatnika w Komendzie Głównej Policji, Piotra Wawrzyka i jego współpracowników z MSZ za aferę wizową, Jacka Kurskiego za niszczenie mediów publicznych, Adama Niedzielskiego – za wykorzystywanie do celów politycznych danych wrażliwych znajdujących się w rejestrach medycznych prowadzonych w resorcie zdrowia."),
    ("court-independence-cjeu-rulings", "Uwolnimy sądy od politycznych wpływów. Wykonamy orzeczenia Trybunału Sprawiedliwości Unii Europejskiej i Europejskiego Trybunału Praw Człowieka w zakresie gwarancji niezależności sądów i niezawisłości sędziów."),
    ("krs-reform-restore-constitutional", "Zlikwidujemy neoKRS i utworzymy Krajową Radę Sądownictwa w składzie zgodnym z Konstytucją. Nielegalni sędziowie dublerzy zostaną odsunięci od orzekania. Osądzimy tych, którzy sprzeniewierzyli się sędziowskiemu ślubowaniu."),
    ("split-justice-minister-prosecutor", "Rozdzielimy funkcję ministra sprawiedliwości i prokuratora generalnego. Prokurator nie może być politykiem. Przygotujemy Polskę do przystąpienia do Prokuratury Europejskiej, aby skuteczniej ścigać nadużycia finansowe, korupcję, pranie pieniędzy oraz transgraniczne oszustwa VAT-owskie."),
    ("police-chief-accountability", "Rozliczymy Komendanta Głównego Policji za działania łamiące porządek prawny na przykład wykorzystanie Biura Operacji Antyterrorystycznych do tłumienia zgromadzeń w tym strajków kobiet oraz innych działań, na polityczne zlecenie, wymierzonych w opozycję."),
    ("police-units-leadership-review", "Rozliczymy kierownictwa jednostek policji, w których dochodziło do nagminnego nadużywania władzy i realizowania politycznych zleceń: kierowania sił i środków policyjnych do partyjnych siedzib i prywatnych domów polityków, „śledzenia” przez patrole umundurowane i operacyjne działaczy i polityków opozycji."),
    ("border-defense-eu-funds", "Zapewnimy finansowanie z UE na obronę polskiej granicy z Białorusią. Zlikwidujemy szlak przemytników przechodzących z Bliskiego Wschodu przez Białoruś do Polski i dalej UE."),
    ("nfz-hospital-treatment-no-limits", "Zniesiemy limity NFZ w lecznictwie szpitalnym, dzięki czemu znacząco skróci się czas oczekiwania na konsultacje i zabiegi."),
    ("county-health-centers", "Na obszarach pozbawionych odpowiedniej diagnostyki stworzymy Powiatowe Centra Zdrowia zapewniające powszechny i równy dostęp do diagnostyki, leczenia ambulatoryjnego i świadczeń specjalistycznych."),
    ("geriatric-care-eu-funds", "Dzięki odblokowanym środkom unijnym zwiększymy dostępność lekarzy geriatrów oraz opieki długoterminowej."),
    ("entrepreneur-sabbatical-zus-free", "Wprowadzimy „Urlop dla przedsiębiorców”: jeden miesiąc wolny od składek na ubezpieczenia społeczne i świadczenie urlopowe w wysokości połowy płacy minimalnej."),
    ("flat-rate-health-contribution", "Wrócimy do ryczałtowego systemu rozliczania składki zdrowotnej. Skończymy z absurdem składki zdrowotnej od sprzedaży środków trwałych."),
    ("micro-business-sick-leave-zus", "Pomożemy mikro przedsiębiorcom obniżyć koszty działalności: zasiłek chorobowy od pierwszego dnia nieobecności pracownika będzie płacił ZUS."),
    ("micro-business-inspection-cap", "Ograniczymy czas kontroli mikro przedsiębiorców do 6 dni w skali roku. Urzędy Skarbowe nie będą w nieskończoność przedłużać kontroli."),
    ("belka-tax-savings-exemption", "Zaproponujemy zniesienie podatku od zysków kapitałowych (podatek Belki) dla oszczędności i inwestycji w tym także na GPW (do 100 tys. zł, powyżej 1 roku)."),
    ("beauty-sector-vat-8pct", "Obniżymy VAT dla sektora „beauty” do 8%."),
    ("caregiver-voucher-50pct-min-wage", "Odciążymy pracujących opiekunów osób niesamodzielnych. Wprowadzimy Bon Opiekuńczy w wysokości 50% minimalnego wynagrodzenia dla aktywnych zawodowo opiekunów."),
    ("personal-assistance-services", "Stworzymy system usług asystenckich dla osób niesamodzielnych, w ramach którego profesjonalni, certyfikowani opiekunowie będą wspierali osoby niesamodzielne. W ciągu pierwszych 100 dni złożymy projekt ustawy i rozpoczniemy szkolenia i certyfikacje."),
    ("social-pension-min-wage-level", "Złożymy gotowy projekt ustawy o podwyższeniu renty socjalnej do wysokości minimalnego wynagrodzenia."),
    ("school-depoliticization-hit-out", "Odpolitycznimy szkoły. Natychmiast wycofamy przedmiot HiT. Wprowadzimy praktyczne, a nie ideologiczne podstawy programowe i podręczniki, tworzone i zatwierdzane przez ekspertów i nauczycieli praktyków w Komisji Edukacji Narodowej, a nie przez polityków."),
    ("school-lockers-and-ebooks", "Uwolnimy nasze dzieci od ciężkich plecaków – w każdej szkole postawimy indywidualne szafki dla dzieci, a każdy podręcznik będzie miał wersje elektroniczną."),
    ("single-shift-school-system-2025", "W ciągu pierwszych 100 dni rozpoczniemy proces przechodzenia polskiej edukacji na system 1 zmianowy. Od 1 września 2025 wszystkie polskie szkoły podstawowe będą działały w takim systemie."),
    ("primary-school-no-homework", "Zlikwidujemy prace domowe w szkołach podstawowych. Wprowadzimy szeroką ofertę bezpłatnych zajęć pozalekcyjnych w szkole. Przeznaczymy dodatkowe pieniądze na zajęcia rozwijające zdolności uczniów i wyrównujące szanse, sport, rozwijanie zainteresowań. Zapewnimy pomoc w szkole zamiast korepetycji w domu."),
    ("civil-partnerships-bill", "Wprowadzimy ustawę o związkach partnerskich."),
    ("alimony-fund-1000-zl", "Podniesiemy kwotę świadczenia z Funduszu Alimentacyjnego z 500 zł do 1000 zł."),
    ("anti-violence-policy", "Natychmiast przystąpimy do realizacji polityki antyprzemocowej."),
    ("childrens-helpline-116111", "Przywrócimy finansowanie Telefonu Zaufania dla Dzieci i Młodzieży 116 111."),
    ("childrens-rights-ombudsman", "Odwołamy Mikołaja Pawlaka z funkcji Rzecznika Praw Dziecka i powołamy na to stanowisko osobę, dla której dobro dzieci będzie priorytetem."),
    ("forest-management-public-oversight", "Zapewnimy społeczny nadzór nad lasami i możliwość zaskarżania planów urządzenia lasu do sądu."),
    ("forest-economy-pis-accountability", "Rozliczymy partyjnych namiestników PiS za prowadzoną przez ostatnie 8 lat rabunkową gospodarkę leśną."),
    ("river-monitoring-clean-odra", "Obejmiemy rzeki stałym monitoringiem w automatycznych stacjach pomiaru czystości. Zmodernizujemy systemy oczyszczania i przetwarzania ścieków i uruchomimy narzędzia pozwalające na skuteczne zwalczanie nielegalnych zrzutów ścieków. Wdrożymy program rewitalizacji rzeki „Czysta Odra”."),
    ("ban-public-funds-religious-business", "Wprowadzimy zakaz finansowania z pieniędzy publicznych działalności gospodarczej diecezji, parafii, zakonów i innych elementów gospodarczych Kościołów i związków wyznaniowych, z wyłączeniem działalności służącej celom humanitarnym, charytatywno-opiekuńczym, naukowym i oświatowo-wychowawczym."),
    ("cemetery-fees-municipal-regulation", "Wysokość opłat za korzystanie z cmentarzy wyznaniowych zostanie uregulowana przez samorządy. Opłaty te nie mogą być okazją do nieuzasadnionych podwyżek wprowadzanych decyzją parafii lub diecezji."),
    ("peatlands-restoration-program", "Stworzymy program odtwarzania torfowisk i mokradeł, który będzie w pełni uwzględniał interesy polskich rolników, by chronić środowisko."),
    ("urban-tree-protection", "Skończymy z wycinką drzew w miastach i zapewnimy ochronę bioróżnorodności na terenach miejskich. Wprowadzimy instytucje „miejskiego ogrodnika”, odpowiedzialnego za parki, nowe nasadzenia i użytki ekologiczne."),
    ("modern-marketplaces-program", "Uruchomimy program budowy nowoczesnych targowisk w każdym mieście."),
    ("gdansk-grain-port-terminal", "Przedstawimy projekt zwiększenia przestrzeni magazynowej i budowy nowego terminala (portu zbożowego) w Gdańsku."),
    ("pig-farming-bioassurance-cover", "Odbudujemy polską tradycję hodowli świń – budżet pokryje całość kosztów bioasekuracji."),
    ("farmer-stabilization-fund", "Wprowadzimy dla rolników fundusz stabilizacyjny, pokrywający straty spowodowane oszustwami pośredników i szkodami łowieckimi."),
    ("farm-cost-biogas-pv-support", "Obniżymy koszty prowadzenia gospodarstw: zapewniając wsparcie dla inwestycji w biogazownie, farmy fotowoltaiczne oraz pompy ciepła."),
    ("clean-water-for-agriculture", "Zapewnimy czystą i tanią wodę do produkcji rolnej – postawimy na budowę lokalnych systemów zatrzymujących wodę w glebie. Rolnik ma prawo skorzystać z wody, która spadnie na jego grunt."),
    ("obajtek-accountability-orlen", "Rozliczymy wszystkie afery Daniela Obajtka, w tym sprzedaż udziałów w Rafinerii Gdańskiej."),
    ("illegal-surveillance-disclosure", "Ujawnimy listy osób nielegalnie podsłuchujących i wydających nielegalne decyzje o podsłuchiwaniu obywateli."),
    ("recover-public-funds-from-criminals", "Odzyskamy publiczne środki od przestępców, którzy dopuścili się kradzieży lub marnotrawstwa pieniędzy podatników. Kontrola obejmie każdy resort, szczebel, instytucję. Ujawnimy nieprawidłowości i wskażemy odpowiedzialnych za korupcję, niedopełnienie obowiązków i przekroczenie uprawnień."),
    ("msz-corruption-charges-migration", "Przedstawimy akt oskarżenia wobec funkcjonariuszy MSZ odpowiedzialnych za korupcję, która doprowadziła do niekontrolowanego napływu migrantów do Polski."),
    ("state-companies-leadership-overhaul", "W spółkach z udziałem Skarbu Państwa zwolnimy wszystkich członków rad nadzorczych i zarządów. Przeprowadzimy nowy nabór w transparentnych konkursach, w których decydować będą kompetencje a nie znajomości rodzinne i partyjne."),
    ("public-finance-white-paper", "Przywrócimy przejrzystość finansów publicznych. Przedstawimy białą księgę stanu finansów publicznych na koniec 2023 r. Winnych przestępstw urzędniczych pociągniemy do odpowiedzialności. W ciągu 100 dni ujawnimy plany finansowe i wszystkie wydatki funduszy poza budżetem."),
    ("abolish-pis-agencies", "Zlikwidujemy Narodowy Instytut Wolności, Fundusz Patriotyczny, Instytut De Republica i 14 innych powołanych przez PiS agencji i instytutów, które są przechowalnią pisowskich aparatczyków. Zlikwidujemy 42 stanowiska rządowych pełnomocników, zmniejszymy liczbę ministrów i wiceministrów."),
    ("military-reinstate-2015-dismissed", "Wszyscy żołnierze niesłusznie zwolnieni po 2015 r. otrzymają możliwość powrotu do służby."),
    ("military-procurement-audit", "Przeprowadzimy kontrolę procedur dotyczących awansów i zakupów w polskim wojsku od 2015 roku. Stworzymy białą księgę dokumentującą wszystkie decyzje pociągające znaczne skutki finansowe, szczególnie poza procedurami przetargowymi i rozliczymy nieprawidłowości."),
    ("army-modernization-100-days-patriot", "W ciągu 100 dni przedstawimy program modernizacji polskiej armii. Pozyskamy kolejnych 6 baterii Patriot, znaczącą liczbę śmigłowców wielozadaniowych i bojowych, dronów najnowszej generacji i innych elementów obrony powietrznej."),
    ("polish-uniform-protection-decree", "Wydamy rozporządzenie o ochronie polskiego munduru. Wojsko ma służyć Polsce a nie politykom. Wprowadzimy zakaz wykorzystywania wojska w celach partyjnych i wyborczych."),
    ("european-sky-shield-join", "Pilnie przystąpimy do sojuszniczego programu obrony przeciwrakietowej tzw. Kopuły Europejskiej (European Sky Shield – europejska tarcza antyrakietowa). W interesie bezpieczeństwa Polski jest wykorzystanie wszystkich możliwych narzędzi do ochrony polskiego i europejskiego nieba."),
    ("internal-security-wiretap-audit", "Przeprowadzimy audyt i kontrolę działań operacyjnych w zakresie wykorzystania podsłuchów oraz działań Biura Spraw Wewnętrznych i Biura Nadzoru Wewnętrznego MSW. Zlikwidujemy „policję ministra Kamińskiego” w postaci Biura Nadzoru Wewnętrznego w MSW."),
    ("uniformed-pensioner-rights-restored", "Przywrócimy emerytom mundurowym prawa nabyte – uprawnienia emerytalne odebrane im z naruszeniem powszechnych norm prawa."),
    ("eu-funds-unblock-decision-making", "Uzyskamy pieniądze z funduszy unijnych i wrócimy do grupy decyzyjnej w instytucjach UE."),
    ("anti-inflation-bonds", "Wprowadzimy obligacje antyinflacyjne poprzez zmianę w ustawie o NBP (gotowy projekt ustawy). Oszczędności Polaków będą zabezpieczone przed inflacją od pierwszego dnia."),
    ("public-transport-zero-vat", "Wprowadzimy 0% VAT na transport publiczny, aby obniżyć ceny biletów dla Polaków."),
    ("cpk-verify-stop-expropriations", "Zweryfikujemy projekt Centralnego Portu Komunikacyjnego. Zatrzymamy bandyckie wywłaszczenia i naprawimy krzywdy już wywłaszczonym. Zablokujemy sprzedaż lotniska Okęcie."),
    ("ministry-of-industry-silesia", "Powołamy Ministerstwo Przemysłu z siedzibą na Śląsku."),
    ("silesian-language-regional-status", "Język śląski zostanie uznany za język regionalny. Ponownie złożymy ustawę, która nada językowi śląskiemu status języka regionalnego, a tym samym odpowie na oczekiwania Ślązaków."),
    ("prosumer-billing-restore-favorable", "Przywrócimy korzystne zasady rozliczania produkowanej energii dla prosumentów – niższe rachunki za prąd dla inwestujących w fotowoltaikę."),
    ("local-energy-communities-700", "Umożliwimy stworzenie 700 lokalnych wspólnot energetycznych generujących własny, tańszy prąd."),
    ("onshore-wind-500m-distance-rule", "Złożymy projekt ustawy odblokowującej możliwość rozwoju energetyki wiatrowej na lądzie (zmniejszenie odległości do 500 m) z jasnymi i szybkimi regułami wydawania decyzji o budowie i przyłączeniu. Lokalne społeczności otrzymają 5% przychodów ze sprzedaży energii."),
    ("gas-price-freeze-2024", "„Zamrozimy” ceny gazu w 2024 r. dla gospodarstw domowych i odbiorców wrażliwych na poziomie cen z 2023 r."),
    ("illegal-waste-import-ban", "Skończymy z nielegalnym importem śmieci do Polski. Za rządów PiS Polska stała się śmietniskiem Europy. Będziemy stanowczo egzekwować prawo, dając stosownym organom większe uprawnienia."),
    ("energy-transition-co2-75pct-2030", "Przedstawimy szczegółowy plan transformacji energetycznej, która umożliwi ograniczenie emisji CO2 o 75% do 2030 roku. Przyspieszymy rozwój niskoemisyjnych źródeł energii (OZE i energetyki jądrowej). Opracujemy założenia dla spójnego programu rozwoju energetyki jądrowej oraz precyzyjnie określimy sposób jego finansowania."),
    ("public-land-for-housing", "Aby mieszkań w Polsce powstawało więcej uwolnimy grunty spółek skarbu państwa i Krajowego Zasobu Nieruchomości, a zwłaszcza te, które trafiły do KZN na potrzeby programu Mieszkanie Plus. Programu PiS, który okazał się katastrofą."),
    ("zero-percent-mortgage-first-home", "Wprowadzimy kredyt z oprocentowaniem 0% na zakup pierwszego mieszkania."),
    ("youth-rent-subsidy-600-zl", "Wprowadzimy 600 zł dopłaty na wynajem mieszkania dla młodych."),
    ("vacant-housing-renovation-10b", "Przeznaczymy 10 mld złotych na rewitalizację i remonty pustostanów w zasobach polskich samorządów oraz przeznaczymy 3 mld złotych rocznie na dofinansowanie nowych projektów w modelu TBS oraz remont i powiększenie miejskich zasobów mieszkaniowych."),
    ("nationalist-orgs-funding-stop", "Skończymy z przekazywaniem środków organizacjom nacjonalistycznym. Wzmocnimy system ekspercki, a politycy nie będą już rozdawać dotacji wg własnych preferencji."),
    ("ngo-private-funds-tax-incentives", "Ułatwimy organizacjom pozarządowym pozyskiwanie środków prywatnych tworząc system zachęt podatkowych dla darczyńców i możliwość podpisywania umów sponsorskich bez prowadzenia działalności gospodarczej."),
    ("higher-education-autonomy-funding", "Wzmocnimy autonomię uczelni i zabezpieczymy apolityczność szkół wyższych poprzez zwiększenie finansowania nauki i poprawę transparentności wydatkowanych środków."),
    ("science-evaluation-journal-list", "Uzdrowimy mechanizmy ewaluacji nauki. Zweryfikujemy wykaz czasopism punktowanych przy poszanowaniu ustawowej roli Komisji Ewaluacji Nauki."),
    ("artist-status-act", "Wprowadzimy ustawę o statusie artysty gwarantującą artystom i artystkom minimum zabezpieczenia socjalnego, dostęp do ubezpieczeń społecznych i zdrowotnych uwzględniający specyfikę pracy."),
    ("public-media-depoliticization", "Odpolitycznimy i uspołecznimy media publiczne. Zlikwidujemy Radę Mediów Narodowych. Natychmiast zatrzymamy finasowanie fabryki kłamstw i nienawiści jaką stała się TVP i inne media publiczne. Zgodnie z naszym zobowiązaniem przeznaczymy 2mld zł z TVP na leczenie raka."),
    ("culture-censorship-repeal", "Zniesiemy cenzurę nałożoną na polską kulturę: cenzurę ekonomiczną czyli cofanie środków finansowych dla instytucji kultury niewygodnych dla władzy, cenzurę personalną czyli obsadzanie instytucji kultury osobami podległymi władzy."),
]


def _write_promise_corpus(
    *,
    out_root: Path,
    party_code: str,
    source_url: str,
    source_year: int,
    reviewer_tag: str,
    confidence: float,
    items: list[tuple[str, str]],
) -> int:
    dest_dir = out_root / "external" / "promises"
    for slug, text in items:
        title = text.split(". ")[0]
        if len(title) > 200:
            title = title[:197] + "..."
        payload = {
            "slug": slug,
            "party_code": party_code,
            "title": title,
            "normalized_text": text,
            "source_year": source_year,
            "source_url": source_url,
            "source_quote": text,
            "status": "in_progress",
            "confidence": confidence,
            "reviewer": reviewer_tag,
        }
        write_json(dest_dir / f"{party_code}__{slug}.json", payload)
    return len(items)


def prepare_ko_promises_fixtures(out_root: Path) -> int:
    """Write the KO 100-konkretow corpus to fixtures/external/promises/.

    Status defaults to 'in_progress'; reviewers update via the database after
    matcher candidates are confirmed/rejected.
    """
    if len(KO_100_KONKRETOW) != 100:
        raise ValueError(
            f"KO_100_KONKRETOW has {len(KO_100_KONKRETOW)} entries, expected 100"
        )
    n = _write_promise_corpus(
        out_root=out_root,
        party_code="KO",
        source_url="https://100konkretow.pl/wszystkie-konkrety/",
        source_year=2023,
        reviewer_tag="seed-100konkretow",
        confidence=0.90,
        items=KO_100_KONKRETOW,
    )
    logger.info("wrote {} KO promise fixtures", n)
    return n


# ---------- promises: Polska 2050 / Trzecia Droga "12 gwarancji" ----------

# Source: psl.pl/12gwarancji + polska2050.pl. Joint list with PSL; party_code
# 'P2050' since Polska 2050 is the senior coalition partner here.
# Refetched 2026-05-14: full Polish diacritics restored from upstream.
P2050_12_GWARANCJI: list[tuple[str, str]] = [
    ("simple-stable-tax-system", "Prosty i stabilny system podatkowy. Uporządkujemy i uprościmy system podatkowy. Podatnik zapłaci jedną daninę od dochodów z pracy zawierającą wszystkie obecne podatki i składki; CIT, VAT i PIT bez podwyżek przez całą kadencję."),
    ("voluntary-zus-microbusiness", "Damy oddech przedsiębiorcom. Dobrowolny ZUS dla mikrofirm zagrożonych niewypłacalnością. Wprowadzimy wakacje od składek na Zakład Ubezpieczeń Społecznych dla mikroprzedsiębiorców w kłopotach finansowych oraz zasiłek chorobowy od pierwszego dnia."),
    ("education-6pct-gdp", "Przeznaczymy 6% PKB na edukację. Wprowadzimy godzinę języka angielskiego dziennie od pierwszej klasy, by dzieci kończące podstawówkę mówiły płynnie po angielsku. Zmiana podstawy programowej, psycholog i opieka medyczna w każdej szkole."),
    ("specialist-doctor-60-days", "Koniec kolejek do lekarzy specjalistów. Wprowadzimy zasadę: wizyta u lekarza specjalisty w ciągu 60 dni, albo NFZ zwróci pieniądze za wizytę prywatną. 7% PKB na opiekę zdrowotną."),
    ("family-pit-children-relief", "Rodzinny PIT. Większa rodzina – niższe podatki. Wprowadzenie prostego algorytmu, w którym podstawa opodatkowania będzie się zmniejszała wraz z większą ilością dzieci."),
    ("women-equal-pay-ivf-nurseries", "Kobiety, do przodu! Zlikwidujemy różnicę w wynagrodzeniach kobiet i mężczyzn. Przywrócimy dofinansowanie in vitro; 100 tys. bezpłatnych miejsc w żłobkach."),
    ("food-security-deposit-system", "Bezpieczeństwo żywnościowe. Koniec z napływem niekontrolowanej żywności z Ukrainy. Wprowadzimy system kaucyjny w imporcie towarów rolno-spożywczych z Ukrainy. 600 tys. zł na modernizację gospodarstw i 300 tys. zł dla młodych rolników."),
    ("green-poland-cheap-clean-power", "Zielona Polska. Tani prąd, czyste powietrze. Pozwolimy na kupno prądu z paneli bezpośrednio od prywatnych właścicieli farm. Ograniczenie eksportu nieprzetworzonego drewna; całkowity zakaz wycinek w 20% najcenniejszych lasów."),
    ("personal-assistant-disability", "Asystent osobisty dla osób z niepełnosprawnościami. Uchwalimy ustawę o asystencji osobistej, która da osobom z niepełnosprawnościami stałe wsparcie wykwalifikowanych asystentów; liczba godzin powiązana z potrzebami; dostęp bez względu na miejsce zamieszkania."),
    ("housing-affordable-academik-1zl", "Mieszkanie w dobrej cenie. „Akademik za złotówkę” dla studentów spoza wielkich miast. Wprowadzimy program „Akademik za złotówkę”. Liberalizacja obrotu ziemią w miastach; program obniżenia kosztów akademików."),
    ("state-as-fair-employer", "Państwo jako uczciwy pracodawca. Wyprowadzimy podwyżki dla nauczycieli, pielęgniarek i pracowników publicznych niwelujące straty wynikające z inflacji; plan stopniowego podwyższania pensji."),
    ("modern-army-50pct-domestic", "Nowoczesna armia. 50% wydatków na modernizację wojska w polskich zakładach zbrojeniowych. Wprowadzimy zasadę, że minimum 50 procent sprzętu wojskowego będzie kupowane od firm produkujących w Polsce; profesjonalne zarządzanie wojskiem niezależne od partyjnych wpływów."),
]


def prepare_p2050_promises_fixtures(out_root: Path) -> int:
    if len(P2050_12_GWARANCJI) != 12:
        raise ValueError(
            f"P2050_12_GWARANCJI has {len(P2050_12_GWARANCJI)} entries, expected 12"
        )
    n = _write_promise_corpus(
        out_root=out_root,
        party_code="P2050",
        source_url="https://www.psl.pl/12gwarancji/",
        source_year=2023,
        reviewer_tag="seed-12gwarancji",
        confidence=0.85,
        items=P2050_12_GWARANCJI,
    )
    logger.info("wrote {} P2050 promise fixtures", n)
    return n


# ---------- promises: Lewica programme (full 155 postulates) ----------

# Source: lewica.org.pl/program/program-wyborczy-kw-nowa-lewica.
# Refetched 2026-05-14: full 155 numbered postulates with Polish diacritics,
# parsed from the WP block structure on lewica.org.pl. Plus 3 supplementary
# slugs (gender-procedure-simplify, hate-crime-gender-orientation,
# religious-orgs-revenue-registry) preserved from the previous corpus to keep
# DB rows / reviewer verdicts intact -- they are sub-points of composite
# postulates 78 and 86 respectively.
LEWICA_PROGRAMME: list[tuple[str, str]] = [
    # Work / labour rights (1-14)
    ("decent-stable-employment", "Godne i stabilne zatrudnienie. Każdy zasługuje na normalny urlop, ubezpieczenie zdrowotne i bezpieczeństwo. Zlikwidujemy patologie rynku pracy, jakimi są umowy śmieciowe i wymuszone samozatrudnienie. Zagwarantujemy pełnię praw pracowniczych osobom pracującym na rzecz platform cyfrowych. Zakażemy darmowych staży i wprowadzimy minimalną stawkę godzinową dla stażystów. Obejmiemy przepisami o minimalnym wynagrodzeniu za pracę także umowy o pomocy przy zbiorach."),
    ("equal-pay-no-workplace-violence", "Przeciw dyskryminacji płacowej i przemocy w pracy. Wzorem Islandii zapewnimy równe płace za tę samą pracę bez względu na płeć. Pracownicy zyskają prawo do informacji o luce płacowej w ich zakładzie pracy. Nadamy Państwowej Inspekcji Pracy uprawnienie do nakazania ukształtowania wynagrodzeń w przedsiębiorstwie w sposób zgodny z zasadą równego traktowania. Zapewnimy skuteczność procedur i narzędzi antymobbingowych, w tym posiadanych przez Państwową Inspekcję Pracy."),
    ("sick-leave-100pct-pay", "Koniec z karą za chorowanie. Każdy chory pracownik powinien móc w spokoju wrócić do zdrowia, nie narażając innych pracowników. Wynagrodzenie za czas niezdolności do pracy ze względu na zwolnienie lekarskie i zasiłek chorobowy będą wynosić 100% płacy."),
    ("strong-collective-bargaining", "Szeroki dialog społeczny i silne związki zawodowe. Zadbamy o upowszechnienie zakładowych i ponadzakładowych układów zbiorowych. Skończymy z procederem bezprawnego zwalniania liderów związkowych bez wyroku sądu. Doprowadzimy do uchwalenia nowej ustawy o sporach zbiorowych, w której odejdziemy od ograniczonego określenia przedmiotu sporu zbiorowego, usprawnimy proces rokowań i zabezpieczymy prawo do strajku, m.in. ułatwiając przeprowadzenie referendum strajkowego i strajku solidarnościowego. Zobowiążemy zatrudniających do informowania pracowników o związkach zawodowych działających w zakładzie pracy. Wprowadzimy zachęty do zrzeszania się nie tylko w związkach zawodowych, ale również w organizacjach przedsiębiorców, co uporządkuje ponadzakładowe negocjacje zbiorowe."),
    ("effective-labor-rights-pip", "Skuteczna ochrona Twoich praw. Skokowo zwiększymy budżet Państwowej Inspekcji Pracy. Nadamy inspektorom uprawnienie do ustalania stosunku pracy w przypadku wykrycia niezgodnych z prawem umów śmieciowych. Stworzymy w ramach PIP pion prokuratorski, ścigający szczególnie rażące naruszenia prawa. Zwiększymy kary za łamanie praw pracowniczych. Dofinansowanie PIP pozwoli na rozwiązanie problemów kadrowych i przygotowanie inspekcji do skutecznych działań w obliczu przemian polskiego rynku pracy: cyfryzacji i pracy zdalnej czy zwiększenia liczby pracowników-migrantów."),
    ("public-sector-130pct-min-wage", "Sektor publiczny wyznacza wysokie standardy. Państwo i samorząd muszą być dobrymi pracodawcami. Ciężka praca w domu pomocy społecznej, jednostce ratowniczo-gaśniczej czy zakładzie gospodarki komunalnej zasługuje nie tylko na uznanie, ale przede wszystkim na godną płacę. Najniższe wynagrodzenie w sferze budżetowej będzie wynosić nie mniej niż 130% wynagrodzenia minimalnego w gospodarce. Płace w budżetówce będą automatycznie waloryzowane dwa razy do roku o inflację, a tabele płac regularnie poddawane negocjacjom ze związkami zawodowymi. Ograniczymy outsourcing w instytucjach publicznych."),
    ("workplace-democracy-20pct-board", "Demokracja w miejscu pracy. Skoro spędzamy w pracy tyle czasu, to powinniśmy mieć większy wpływ na jej warunki. Wzmocnimy rolę rad pracowniczych. Wprowadzimy wymóg co najmniej 20% reprezentacji pracowniczej w radach nadzorczych. Zapewnimy udział związków zawodowych i załóg w decydowaniu o stanowiskach kierowniczych, w procesie informowania o rozwoju firmy oraz w budowaniu jej długoterminowej strategii. Skierujemy dodatkowe środki na pomoc w organizowaniu spółdzielni i budowaniu współpracy między podmiotami ekonomii społecznej. W dużych przedsiębiorstwach stworzone zostaną fundusze własności pracowniczej, zasilane częścią zysków."),
    ("min-wage-66pct-average", "Czas na wyższe płace. Będziemy stopniowo dążyć do tego, by minimalne wynagrodzenie w Polsce osiągnęło poziom 66% przeciętnego wynagrodzenia z poprzedniego roku. Popieramy ustanowienie europejskiej płacy minimalnej. Wprowadzimy obowiązek informowania w ogłoszeniu o pracę o najniższym przewidzianym dla tego stanowiska wynagrodzeniu. Wdrożymy mechanizmy ograniczające rozwarstwienie płacowe wewnątrz przedsiębiorstw."),
    ("late-pay-automatic-interest", "Odsetki za opóźnione wypłaty. Wprowadzimy obowiązkowe i naliczane automatycznie odsetki za opóźnienia w wypłatach pensji w wysokości 0,5% miesięcznych zarobków dziennie. Nałoży to na nieuczciwych pracodawców presję, aby wywiązywać się z zapisów umowy, a z pracowników zdejmie konieczność dochodzenia swoich praw w sądzie pracy."),
    ("unemployment-benefit-half-salary", "Szukanie pracy bez stresu. Nagła utrata pracy nie może oznaczać ubóstwa, dlatego rozszerzymy dostęp do zasiłku dla bezrobotnych. Podniesiemy go do wysokości połowy ostatniej pensji — nie będzie jednak niższy niż 70% płacy minimalnej ani wyższy niż połowa średniej krajowej. Zasiłek potrzebny jest na czas szukania pracy, dlatego prawo do niego powinno zyskiwać się od razu, niezależnie od okoliczności zwolnienia. Wydłużymy czas obowiązywania zasiłku do dwóch lat."),
    ("active-anti-unemployment-policy", "Aktywna walka z bezrobociem. Praca musi być dostępna również poza metropoliami. Będziemy walczyć z wyspami bezrobocia przez systemowe wsparcie inwestycji zapewniających godne zatrudnienie w powiatach, w których stopa bezrobocia jest o połowę wyższa niż w całej gospodarce."),
    ("right-to-rest-shorter-week", "Prawo do odpoczynku. Polscy pracownicy muszą mieć czas złapać oddech. Będziemy dążyć do ograniczenia czasu pracy poprzez zwiększenie liczby dni urlopu wypoczynkowego i stopniowe zmniejszanie tygodniowego wymiaru czasu pracy bez obniżki wynagrodzeń. Wprowadzimy 2,5 raza wyższe wynagrodzenie za pracę w niedziele, święta i dni ustawowo wolne od pracy, a także prawo do co najmniej dwóch wolnych niedziel w miesiącu dla pracowników, którzy nie są obecnie objęci zakazem pracy w niedzielę. Zapewnimy prawo do odłączenia się — bo nie można oczekiwać od pracownika odbierania maili i telefonów po godzinach pracy. Wprowadzimy obowiązkowy, nieprzenoszalny urlop rodzicielski dla obojga rodziców i podniesiemy wysokość świadczenia udzielanego ojcu do poziomu zasiłku macierzyńskiego."),
    ("algorithmic-management-consultation", "Przyjazna regulacja pracy przyszłości. Zadbamy, by rozwój technologii ułatwiał pracę, a nie tworzył nowe zagrożenia. Wprowadzimy obowiązek konsultowania algorytmów zarządzających pracą z przedstawicielami zatrudnionych. Skończymy z niejawnym zbieraniem i przetwarzaniem danych cyfrowych oraz inwigilacją w miejscu pracy. Dostosujemy prawo spółdzielcze do realiów gospodarki cyfrowej."),
    ("artist-social-insurance", "Koniec z artystyczną biedą. Rynek pracy artystów w Polsce jest nieuregulowany. Wzorem Francji stworzymy system ubezpieczeń dla osób zajmujących się działalnością artystyczną. Polscy artyści będą mogli zostać członkami jednego z trzech Stowarzyszeń Ubezpieczeń Społecznych dla Artystów: dla artystów sztuk wizualnych, dla autorów (pisarzy i kompozytorów) oraz dla wykonawców. O statusie twórcy lub artysty decydować będą organizacje branżowe. Członkostwo w tych organizacjach będzie dawało konstytucyjne prawa pracownicze oraz możliwość skorzystania z ubezpieczeń społecznych, w tym korzystania z urlopu macierzyńskiego czy rodzicielskiego. Zrzeszeni otrzymają ułatwiony dostęp do miejsc związanych z kulturą, a także do ubiegania się o granty i dofinansowania."),
    # Science (15-18)
    ("science-funding-3pct-gdp", "Stabilne finansowanie nauki. Zwiększymy nakłady na badania i rozwój do poziomu 3% PKB. Przeniesiemy nacisk z grantowego i konkursowego systemu finansowania uczelni i badań na rzecz wyższego finansowania działalności statutowej. Gwarancja stałego finansowania jednostek naukowych pozwala planować długoletnie, dalekosiężne badania. Granty będą stanowić uzupełnienie finansowania bardziej wymagających projektów badawczych. Wzmocnimy pion administracyjny w szkołach wyższych, aby odciążyć naukowców z obowiązków biurokratycznych. Wprowadzimy wymóg publicznego dostępu do wyników badań finansowanych ze środków publicznych."),
    ("doctoral-school-gender-parity", "Kobiety na katedry. Zadbamy o należytą ochronę i wsparcie dla kobiet na uczelniach. Będziemy dążyć do osiągnięcia parytetu płci w szkołach doktorskich i we władzach uczelni i ich jednostek. Zwiększymy wsparcie w relokacji przy wyjazdach na stypendia i staże nie tylko dla osób pracujących naukowo, ale też dla ich rodzin. Utworzymy lub rozwiniemy żłobki i przedszkola przy uczelniach dla rodzin pracujących lub studiujących na uczelni. Zapewnimy programy wspierające dla kobiet w naukach, w których są niedoreprezentowane. Poprawimy instytucjonalną ochronę przed molestowaniem seksualnym i dyskryminacją ze względu na płeć."),
    ("student-stipend-1000-zl", "Stypendium 1000 zł dla studenta. Studia dostępne dla wszystkich. Zamożność rodziny nie może być przeszkodą w rozpoczęciu i zakończeniu studiów. Osoby do 26 roku życia, które kontynuują swoją edukację, zostaną objęte powszechnym programem stypendialnym (1000 zł miesięcznie dla każdej osoby na studiach). Stworzymy program rządowy zajmujący się zaspokojeniem potrzeb mieszkaniowych osób studiujących i uczących się, między innymi przez budowę i modernizację akademików do dobrego standardu. W ramach programu powstanie też dodatkowa infrastruktura, taka jak stołówki, obiekty sportowe i biblioteki."),
    ("decent-work-academia", "Godna praca na uczelni. Aby zapobiec odpływowi kadry akademickiej z uczelni, zapewnimy skokowy wzrost wynagrodzeń na uczelniach. Podwyżki dotyczyć będą w pierwszej kolejności adiunktów, asystentów i pracowników uczelni niebędących nauczycielami akademickimi. Zwiększymy zatrudnienie, tam gdzie jest to potrzebne, i zapewnimy więcej czasu na prowadzenie badań. Upodmiotowimy młodą kadrę akademicką przez zwiększenie reprezentacji osób do 35 roku życia w gremiach decyzyjnych jednostek naukowych. Ułatwimy łączenie pracy na uczelni i poza nią przez wysoko wykwalifikowanych specjalistów."),
    # Education (19-28)
    ("critical-thinking-education", "Gotowi na jutro. Uczymy się lepiej, gdy jesteśmy zaangażowani: stawiamy pytania, rozwiązujemy problemy i chcemy samodzielnie poszerzać naszą wiedzę. Dlatego w centrum edukacji zamiast wkuwania na pamięć znajdą się umiejętności analizy, krytycznego i twórczego myślenia oraz pracy w grupie. Aby młodzi ludzie potrafili zmierzyć się ze współczesnymi wyzwaniami, szkoła musi podchodzić do nich interdyscyplinarnie. W programach różnych przedmiotów szkolnych znajdą się elementy: edukacji obywatelskiej, obejmującej elementy wiedzy o rynku pracy i prawach pracowniczych, edukacji zdrowotnej, w tym wiedzy o seksualności, zdrowiu psychicznym, zdrowym trybie życia i odżywianiu oraz profilaktyce chorób zakaźnych, edukacji klimatycznej, podstaw cyberbezpieczeństwa."),
    ("school-de-czarnek-anti-indoctrination", "Deczarnkizacja. Szkoła musi być wolna od indoktrynacji. Podstawy programowe będą współtworzone i zatwierdzane przez zespoły specjalistów wskazanych przez oświatowe związki zawodowe i uczelnie publiczne. MEN i kuratoria oświaty zajmą się prawdziwymi problemami szkół, a nie sumieniami czy wyglądem uczniów. Rozwiniemy współpracę szkół publicznych z trzecim sektorem i lokalną społecznością, co pozwoli na wzbogacenie oferty edukacyjnej. W szkołach ponadpodstawowych zajęcia dodatkowe będą obowiązkowo opiniowane przez samorząd szkolny. Pobudzimy aktywność uczniów, m.in. umożliwiając tworzenie spółdzielni uczniowskich."),
    ("school-anti-violence-ombudsman", "Szkoła bezpieczna dla wszystkich. Powołamy Krajowego Rzecznika Praw Uczniowskich, który będzie koordynować ochronę interesów uczniów i uczennic. W wielu szkołach już dziś działają rzecznicy praw ucznia. Zakorzenimy tę funkcję w Prawie oświatowym, co pozwoli na wprowadzenie rzecznika obowiązkowo w każdej szkole i wzmocnienie jego kompetencji. MEN określi minimalne wymagania dotyczące procedury postępowania w sytuacji wystąpienia przemocy i agresji w szkole. Zapewnimy dostęp do szkoleń antydyskryminacyjnych i antyprzemocowych dla nauczycieli i uczniów. Umożliwimy szybkie i anonimowe zgłaszanie przypadków przemocyw szkołach przy pomocy aplikacji mobilnej."),
    ("school-mental-health-free", "Wsparcie dobrostanu dzieci i młodzieży. Każda osoba ucząca się od przedszkola aż do końca edukacji musi mieć zapewnione wsparcie psychologiczne, w tym bezpłatny dostęp do długofalowej opieki psychologicznej. Rozwiniemy współpracę psychologów szkolnych z poradniami psychologiczno-pedagogicznymi i specjalistami zdrowia psychicznego w publicznej ochronie zdrowia. Edukacja psychospołeczna i bezpośrednie wsparcie muszą obejmować także rodziców. W kształceniu przyszłej kadry pedagogicznym i doskonaleniu zawodowym nauczycieli położymy większy nacisk na naukę rozpoznawania i wspierania uczniów potrzebujących pomocy."),
    ("free-textbooks-equal-opportunity", "Szkoła równych szans. Zatrzymamy falę odejść uczniów do szkół niepublicznych – zwłaszcza dzieci z problemami edukacyjnymi, orzeczeniami o niepełnosprawności, potrzebie kształcenia specjalnego czy wspomagania rozwoju, jak również wybitnie zdolnych. Każda osoba ucząca się otrzyma niezbędną pomoc edukacyjną w szkole publicznej, aby o efektach nauczania i wynikach egzaminacyjnych nie decydowało to, czy rodzice są w stanie posyłać dzieci na korepetycje. Zapewnimy bezpłatne podręczniki dla wszystkich uczniów, także w szkołach średnich. Każdy uczeń otrzyma czytnik ebooków wraz z abonamentem na książki i czasopisma. Rozszerzymy bazę bezpłatnych materiałów edukacyjnych dostępnych online."),
    ("free-school-lunches", "Bezpłatne obiady dla uczniów Żadne dziecko nie powinno chodzić do szkoły głodne. Zagwarantujemy wszystkim uczniom szkół podstawowych bezpłatny, ciepły, pełnowartościowy obiad, z uwzględnieniem indywidualnych potrzeb żywieniowych."),
    ("vocational-education-update", "Kształcenie zawodowe przyszłości. Dowartościujemy szkoły branżowe i technika, uaktualniając podręczniki oraz zapewniając sprzęt, narzędzia, maszyny i oprogramowanie odpowiadające współczesnym potrzebom. Kadrze zapewnimy stałą możliwość szkoleń, by była przygotowana do nauczania zgodnie z aktualnymi wymaganiami zawodowymi. Osoby odbywające praktyki w ramach nauki zawodu będą otrzymywać wynagrodzenie. Szkoły branżowe podejmą współpracę ze związkami zawodowymi."),
    ("secular-school-no-religion", "Świecka szkoła. Wyprowadzimy religię ze szkół. Dzięki zwolnieniu sal i odciążeniu planów lekcji część szkół będzie mogła zrezygnować z systemu zmianowego. Zaoszczędzone środki skierujemy na organizację zajęć wspomagających dla uczniów ze szczególnymi potrzebami."),
    ("free-public-transport-students", "Bezpłatne przejazdy dla uczniów. Wprowadzimy bezpłatne przejazdy komunikacją lokalną dla uczniów. W czasie ferii zimowych i wakacji uczniowie będą mogli korzystać z bezpłatnych przejazdów transportem publicznym w całej Polsce."),
    ("teacher-pay-20pct-first-year", "TAK dla realnego wzrostu wynagrodzeń nauczycieli! Zagwarantujemy podwyżki dla nauczycieli i pozostałych pracowników oświaty, w tym o co najmniej 20% w pierwszym roku od początku nowej kadencji parlamentu. Wynagrodzenia nauczycieli będą finansowane wprost z budżetu państwa."),
    # Energy / environment (29-48)
    ("energy-resilience-renewables-nuclear", "Odporność energetyczna Polski. Musimy być krajem jednocześnie bezpiecznym energetycznie i poważnie traktującym kwestię zmian klimatu. Zamiast uzależniać się od surowców z Rosji i innych dyktatur, postawimy na rozwój energetyki opartej na źródłach odnawialnych i energii jądrowej. Odejście od paliw kopalnych jest koniecznością cywilizacyjną. Będziemy wspierać badania polskie i europejskie w zakresie czystej energii, efektywności energetycznej i magazynowania energii."),
    ("renewable-majority-by-2035", "Zielone światło dla odnawialnej energii. Dzięki publicznym inwestycjom w panele słoneczne oraz w elektrownie wiatrowe na morzu i na lądzie większość zużywanej energii elektrycznej w gospodarce będzie w 2035 roku pochodziła z OZE. Odblokujemy rozwój OZE m.in. przez złagodzenie szkodliwych przepisów odległościowych oraz rozwiniemy możliwości magazynowania energii, m.in. poprzez elektrownie szczytowo-pompowe. Będziemy rozwijać biogazownie i biometanownie na obszarach wiejskich. W kolejnych latach, z dodatkiem atomu, doprowadzimy do zeroemisyjnego miksu energetycznego. Stabilna generacja energii z jego udziałem umożliwi również produkcję zielonego wodoru dla transportu i przemysłu chemicznego."),
    ("energy-efficient-public-infrastructure", "Energooszczędna infrastruktura. Najtańsza i najczystsza energia to ta, której nie trzeba wytworzyć. Będziemy wdrażać systemowe rozwiązania prowadzące do oszczędności energii. Sektor publiczny da dobry przykład przez wdrożenie termomodernizacji budynków użyteczności publicznej (placówek oświaty, ochrony zdrowia, administracji itd.) oraz realizację programu modernizacji systemu oświetlenia ulicznego z wykorzystaniem inteligentnych technologii."),
    ("electrification-grid-modernization", "Program Elektryfikacji. Przeprowadzimy gruntowną modernizację polskiej sieci przesyłowej i dystrybucyjnej, żeby ograniczyć straty energii na przesyle, obniżyć rachunki za prąd i zmniejszyć liczbę awarii. Inwestycje pozwolą też dostosować możliwości sieci do nowego rozmieszczenia geograficznego mocy wytwórczych oraz większej liczby niesterowalnych źródeł rozproszonych."),
    ("thermomodernization-program", "Niższe rachunki za ogrzewanie. Wprowadzimy powszechne finansowanie programu termomodernizacji i wymiany źródeł ciepła w budynkach. Zmniejszymy ilość biurokracji potrzebnej do uzyskania wsparcia publicznego w tym zakresie. Przeprowadzimy modernizację istniejących systemów ciepłowniczych w stronę zeroemisyjną oraz zadbamy o zwiększenie liczby podłączeń do ciepła systemowego. W każdej gminie będzie dostępny doradca energetyczny, który pomoże określić priorytety dla termomodernizacji budynku."),
    ("progressive-electricity-tariff", "Prąd na każdą kieszeń. Ograniczymy ceny prądu przez wprowadzenie tańszej taryfy do poziomu przeciętnego zużycia energii w gospodarstwach domowych o podobnej charakterystyce. Ograniczymy wysokość podwyżek cen energii."),
    ("energy-cooperatives-legal-ease", "Energia wspólną własnością. Wprowadzimy ułatwienia prawne dla tworzenia i rozwijania spółdzielni energetycznych oraz gminnych klastrów energetycznych, współzarządzanych przez mieszkańców, w tym priorytet przy staraniach o dofinansowanie. Każdy będzie mógł czerpać korzyści z czystej energii, zostając udziałowcem – a tym samym wytwórcą energii – w spółdzielni energetycznej, także w miastach. Włączymy obywateli i obywatelki w proces decyzyjny i inwestycyjny przy publicznych inwestycjach w OZE, tak by nikt nie zostawał w tyle."),
    ("eu-energy-union", "Europejska Unia Energetyczna. Popieramy zacieśnianie współpracy energetycznej w ramach Unii Europejskiej. Postawimy na unijną współpracę w pozyskiwaniu surowców, aby obniżyć ich ceny i uniemożliwić dostawcom rozgrywanie państw wspólnoty przeciwko sobie. Unia Europejska potrzebuje skutecznego systemu promującego i finansującego sprawiedliwą transformację energetyczną i gospodarczą. Będziemy dążyć do zastąpienia obecnego unijnego systemu handlu emisjami (ETS) bardziej przewidywalnym i mniej podatnym na spekulacje systemem opłat. Do tego czasu zagwarantujemy, że każda złotówka z ETS zostanie przeznaczona na zmniejszenie śladu węglowego i środowiskowego w Polsce"),
    ("just-transition-coal-regions", "Ochrona społeczności lokalnych zależnych od wydobycia i zużycia paliw kopalnych. Zielona transformacja nie może odbywać się kosztem pracowników. Wraz z procesem odchodzenia od paliw kopalnych będziemy kierować wsparcie do regionów najsilniej od nich zależnych, umożliwiając utrzymanie zatrudnienia i standardu życia. Włączymy społeczności, których to dotyczy, w procesy decyzyjne. Pracownikom sektora paliw kopalnych zagwarantujemy przekwalifikowanie się i zatrudnienie na co najmniej tak samo płatnym stanowisku w zielonym przemyśle."),
    ("recycling-deposit-60pct-2030", "Lepszy recykling, mniej śmieci. Wprowadzimy, na wzór dobrych praktyk Europy Zachodniej, system kaucyjny pomagający zmniejszyć ilość wytwarzanych odpadów i obniżyć ceny wywozu śmieci. Wprowadzimy jednolity standard butelek zwrotnych w Polsce. W pełni wdrożymy system rozszerzonej odpowiedzialności producentów. Do 2030 roku osiągniemy cel 60% recyklingu odpadów. Przeznaczymy dodatkowe środki na neutralizację składowisk niebezpiecznych odpadów rozsianych w całej Polsce."),
    ("national-parks-1-to-4-pct", "Więcej parków narodowych. Zwiększymy udział parków narodowych z 1% do 4% powierzchni Polski do 2030 r., w tym utworzymy nowe: Turnicki Park Narodowy, Jurajski Park Narodowy, Mazurski Park Narodowy, Stobrawski Park Narodowy, Park Narodowy Dolina Dolnej Odry, Park Narodowy Środkowej Odry, Park Narodowy Puszczy Pilickiej, Park Narodowy Dolina Środkowej Wisły. Znacząco podniesiemy wynagrodzenia w Parkach Narodowych. Wprowadzimy subwencje ekologiczne dla samorządów i wesprzemy tworzenie planów rozwoju dla gmin, na terenie których funkcjonują obszarowe formy ochrony przyrody."),
    ("forest-agency-6pct-protected", "Ochrona polskich lasów. Lasy Państwowe są dziś poza społeczną kontrolą. Funkcjonują jak państwo w państwie i nastawione są na czerpanie zysków z eksploatacji przyrody. Przekształcimy je w agencję rządową i odejdziemy od rabunkowej gospodarki leśnej. Całkowicie wyłączymy lasy obejmujące co najmniej 6% powierzchni kraju – nie licząc parków narodowych – z wycinki drzew. Na terenach tych powstaną Lasy Obywatelskie, które będą pełnić funkcje przyrodnicze, a zarazem służyć obywatelom do odpoczynku i rekreacji. Uniemożliwimy prowadzenie gospodarki leśnej bez Planów Urządzenia Lasu i zagwarantujemy możliwość zaskarżenia decyzji zatwierdzających PUL do sądów."),
    ("nature-restoration-strategy", "Odrodzenie przyrody. Opracujemy i wdrożymy Krajową Strategię Renaturyzacji, by chronić bioróżnorodność, zwiększyć retencję wód i przeciwdziałać konsekwencjom zmian klimatu. Będziemy łączyć rozwój i zdrowie lokalnych społeczności z ochroną przyrody. Łąki, zadrzewienia śródpolne, mokradła, dzikie brzegi rzek czy naturalne tereny zalewowe to także całkiem wymierne korzyści – przywrócenie lub wzmocnienie naturalnych cech ekosystemów ograniczy negatywny wpływ suszy, burz i powodzi na społeczeństwo, środowisko, gospodarkę i rolnictwo."),
    ("water-retention-natural", "Mądra gospodarka wodna. Polska od lat mierzy się z suszami, dlatego potrzebujemy rozsądnej polityki ochrony wód. Zamiast betonować koryta rzek, postawimy na spowolnienie odpływu wód i zatrzymanie wody w zlewni dzięki naturalnej retencji oraz ochronie mokradeł i terenów zalewowych. Będziemy też wspierać zachowanie zielonych pasów buforowych wzdłuż brzegów rzek i jezior, sprzyjających jakości wody."),
    ("water-quality-monitoring", "Realny nadzór nad zanieczyszczeniami. Aby uniknąć kolejnych katastrof ekologicznych na rzekach, musimy postawić na ciągły monitoring wód, wczesne ostrzeganie o zagrożeniach i profesjonalne modelowanie rozprzestrzeniania się zanieczyszczeń. Zintegrujemy systemy monitoringu ilościowego i jakościowego wód powierzchniowych. Stacje pomiarowe będą automatycznie i na bieżąco przekazywać wyniki do dostępnej online bazy danych, do której trafiać będą także wyniki analiz laboratoryjnych próbek pobieranych poza stacjami. Poszerzymy zakres przeprowadzanych badań o dodatkowe wskaźniki zanieczyszczenia, takie jak farmaceutyki czy mikroplastik. Wesprzemy samorządy w modernizacji oczyszczalni ścieków. Zintensyfikujemy przegląd obowiązujących pozwoleń wodnoprawnych, a przy wydawaniu nowych w większym stopniu uwzględniać będziemy wpływ na środowisko."),
    ("anti-odor-act", "Ustawa antyodorowa. Wprowadzimy pojęcie uciążliwości zapachowej i wdrożymy przepisy dające organom administracji publicznej kompetencje w ograniczaniu lub eliminowaniu uciążliwości zapachowej."),
    ("concrete-crushing-fund-3b", "Koniec betonozy. Stworzymy Fundusz Kruszenia Betonu na kwotę 3 mld złotych, wspierający samorządy w przekształcaniu przestrzeni miejskiej pełnej betonu w bardziej zieloną i przyjazną człowiekowi. Zwiększymy dostępność przestrzeni miejskiej dla osób z ograniczoną mobilnością. Dostosujemy przestrzeń miejską do zmieniającego się klimatu, m.in. wspierając mikroretencję wody oraz poprawiając dostęp do ławek, cienia, toalet i źródeł wody pitnej."),
    ("smog-100pct-stove-replacement", "Walka ze smogiem. Będziemy walczyć z problemem smogu przez rozwój ciepłowni i ciepła systemowego i rozszerzenie programu wymiany kotłów. Będziemy pokrywać do 100% kosztów wymiany kotłów dla gospodarstw domowych z niskimi dochodami. Wprowadzimy obowiązek powszechnego alarmowania o zanieczyszczeniu powietrza przy przekroczeniu norm stosowanych w państwach Unii Europejskiej. Przeprowadzimy program inwestycyjny ocieplania domów i oszczędzania energii dla docelowo 1,5 mln budynków, współfinansowany ze środków Unii Europejskiej."),
    ("animal-rights-ombudsman", "Dobrostan zwierząt. Powołamy niezależną instytucję Rzecznika Praw Zwierząt w celu systemowego podejścia do ochrony praw zwierząt gospodarskich, dzikich i domowych. Do 2027 roku zlikwidujemy fermy futrzarskie, zabronimy wykorzystywania zwierząt w cyrkach i skończymy z chowem klatkowym."),
    ("seniors-vet-vouchers", "Wsparcie dla opiekunów zwierząt. Wprowadzimy bon weterynaryjny dla potrzebujących seniorów opiekujących się zwierzętami, dzięki czemu zredukujemy liczbę zwierząt w schroniskach. Wdrożymy powszechny program pełnej refundacji kastracji, sterylizacji i czipowania zwierząt domowych, aby przeciwdziałać bezdomności zwierząt i wypieraniu innych gatunków z ekosystemu."),
    # Agriculture (49-56)
    ("crop-price-state-reserve", "Poprawa opłacalności kierunków produkcji rolnej. Będziemy działać na rzecz poprawy opłacalności produkcji poprzez skup płodów rolnych na potrzeby rezerw materiałowych, wspieranie lokalnego przetwórstwa. Będziemy promować kupowanie lokalnej żywności przez markety oraz stołówki. Będziemy stać na straży jakości oraz rynku wewnętrznego poprzez kontrolę jakości importowanej żywności."),
    ("supermarket-30-day-payment", "Ochrona rolników i przetwórców żywności. Wprowadzimy maksymalnie 30-dniowy termin płatności przez markety i firmy skupowe dla wytwórców żywności i poprawimy jego egzekwowanie. Ustawowo wzmocnimy pozycję rolników i przetwórców w negocjacjach cenowych w łańcuchu produkcji i dystrybucji. Będziemy przeciwdziałać nieuczciwym praktykom w handlu i wprowadzimy równowagę w negocjacjach cenowych."),
    ("eu-subsidy-equalization", "Wyrównanie europejskich dopłat. Nie zgadzamy się na nierówności w ramach europejskich dopłat. Polscy rolnicy powinni otrzymywać wsparcie równe otrzymywanemu przez rolników w Europie Zachodniej. Wprowadzimy rekompensaty dla gospodarstw za świadczenie usług korzystnych dla ekosystemu i bezpieczeństwa, np. w razie powodzi."),
    ("farmer-insurance-1b-zl", "Dopłaty do ubezpieczeń dla rolników. Przeznaczymy dodatkowo 1 miliard złotych rocznie na ubezpieczenia dla rolników. Obecne środki przeznaczane w budżecie na ten cel kończą się w drugim kwartale roku, przez co wielu rolników chcących skorzystać z ubezpieczeń od ryzyka wystąpienia skutków zdarzeń losowych w rolnictwie nie może skorzystać ze wsparcia państwa."),
    ("crop-damage-compensation", "Odszkodowania za szkody rolnicze. Zwiększymy kwoty odszkodowań za szkody wyrządzone przez zwierzęta objęte ochroną gatunkową. Ponadto Skarb Państwa odpowiadać będzie też za szkody wyrządzone przez chronione ptactwo („kormoranowe”), a w przypadku szkód bobrowych odpowiedzialność obejmie również utracone korzyści."),
    ("asf-hpai-bioassurance-250m", "Skuteczna walka z ASF i HPAI. Zwiększymy finansowanie bioasekuracji gospodarstw rolnych do poziomu 250 mln zł rocznie. Metody przeciwdziałania ASF oprzemy na obecnym stanie wiedzy naukowej, a priorytet nadamy działaniom takim jak odszukiwanie martwych dzików i poddawanie ich badaniom na obecność wirusa. Przyspieszymy wypłaty odszkodowań dla rolników, których gospodarstwa zostały dotknięte chorobami. Przeznaczymy dodatkowe środki na Inspekcję Weterynaryjną, która dziś ze względu na niedofinansowanie nie jest w stanie wypełniać swoich obowiązków."),
    ("ecological-farming-support", "Rolnictwo w harmonii z przyrodą. Rolnicy odczuwają koszty zmian klimatu i degradacji środowiska — suszy, burz, znikania zapylaczy. Wesprzemy rolników w zmniejszeniu wydatków na nawozy i pestycydy poprzez wsparcie dla rolnictwa ekologicznego i innych form przeciwdziałania erozji gleby oraz ochrony bioróżnorodności i zapylaczy."),
    ("farmer-cooperatives-support", "Kółka rolnicze i spółdzielczość rolna. Będziemy rozwijać i wspierać kółka rolnicze, aby małe i średnie gospodarstwa miały większe możliwości modernizacji i mogły konkurować z gospodarstwami wielkopowierzchniowymi. Będziemy wspierać powstawanie dobrowolnych spółdzielni rolnych, opierających się na współpracy wytwórców i przetwórców żywności, a także współpracujących z nimi kooperatyw spożywczych. Dzięki temu skróci się łańcuchy dostaw, a współpraca przy kupnie maszyn, inwestycjach i prowadzeniu prac poskutkuje wzrostem wydajności i opłacalności gospodarstw."),
    # Economy / consumers (57-65)
    ("anti-inflation-four-pillars", "Stop drożyźnie. Polska mierzy się dziś z dwucyfrową inflacją i spadającymi płacami realnymi. Strategia państwa w obliczu kryzysu kosztów życia powinna uwzględniać charakter obecnej inflacji i opierać się na czterech filarach: inwestycjach w obszarach zaniedbanych przez poprzednie rządy (bezemisyjna i niezależna od dostaw paliw z Rosji energetyka, zrównoważony transport, aktywna polityka mieszkaniowa); ściąganiu pieniędzy z rynku – ale od tych którzy je mają, a nie od emerytów i pracowników (podatek od nadmiernych zysków spółek paliwowych i energetycznych, atrakcyjne obligacje inflacyjne); działaniach osłonowych dla społeczeństwa; konsekwentnej polityce antymonopolowej, w tym zwalczaniu zmów cenowych i zjawiska pompowania marż."),
    ("no-public-asset-firesale", "Państwo aktywne w innowacjach i gospodarce. Doceniamy aktywną rolę państwa w rozwoju gospodarki, kultury, nauki i technologii oraz zapewnianiu obywatelom codziennego bezpieczeństwa bytowego. Sprzeciwiamy się rozprzedawaniu publicznej własności. Opowiadamy się za aktywną rolą państwa w procesach gospodarczych, tworzeniu miejsc pracy i wyznaczaniu standardów zatrudnienia. Będziemy inwestować w nowoczesny, ekologiczny przemysł, wspierający transformację energetyczną Polski, wykorzystujący polską myśl techniczną i umiejętności polskich naukowców."),
    ("public-procurement-social-criteria", "Pomoc dla przedsiębiorstw uzależniona od interesu publicznego. Będziemy w pełni przestrzegać przepisów o zamówieniach publicznych. W przetargach obowiązkowo stosowane będą kryteria pracownicze, społeczne i środowiskowe. Aby zmniejszyć emisje z transportu i zadbać o miejsca pracy w regionach, ustanowimy w przetargach priorytet dla producentów lokalnych. Skończymy z filantropią na rzecz wielkiego biznesu za pieniądze podatników. Przy ratowaniu upadających przedsiębiorstw będziemy stosować zasadę „pomagam – wymagam”, na przykład oferując dokapitalizowanie w zamian za udziały lub przedstawiając dodatkowe wymogi dotyczące standardów zatrudnienia czy wpływu na środowisko naturalne."),
    ("state-companies-competence-board", "Odpartyjnienie Spółek Skarbu Państwa. Zakończymy karuzelę tłustych kotów w spółkach Skarbu Państwa. Utworzymy Radę Kompetencyjną, której skład wspólnie ukształtują partnerzy społeczni, rządzący i opozycja. Rada będzie przeprowadzać uczciwy, otwarty nabór w formie konkursów na najważniejsze stanowiska w spółkach i kontrolować jakość zarządzania. Pozwoli to ustabilizować strategię przedsiębiorstw i umocnić zaufanie do własności publicznej."),
    ("parliament-public-spending-control", "Uporządkowanie finansów publicznych. Przywrócimy kontrolę parlamentu i obywateli nad finansami publicznymi i skończymy z wyprowadzaniem pieniędzy podatników poza budżet. Zlikwidujemy niepotrzebne fundusze pozabudżetowe."),
    ("kpo-milestones-implementation", "Uruchomimy środki z KPO i nadrobimy miesiące stracone przez PiS. Wykonamy kamienie milowe wynegocjowane przez polski rząd. Doprowadzimy do uaktualnienia programów realizowanych w ramach KPO, zgodnie z wyzwaniami rzeczywistości ukształtowanej przez wojnę w Ukrainie."),
    ("vat-down-progressive-pit-digital-tax", "Uczciwe podatki. Obniżymy stawkę podatku VAT. Uprościmy przepisy prawa o podatku dochodowym i zapiszemy je w dwóch czytelnych ustawach: o podatnikach PIT i podatnikach CIT. Wprowadzimy progresywną skalę PIT, odciążającą gospodarstwa domowe o niskich i średnich dochodach oraz zwiększymy koszty uzyskania przychodu dla pracowników. Opodatkujemy wielkie korporacje cyfrowe i wprowadzimy skuteczne działania na rzecz przeciwdziałania unikaniu opodatkowania. Opodatkujemy nadmiarowe zyski spółek energetycznych i paliwowych."),
    ("uokik-strengthen-funding", "Ochrona konsumentów. Usprawnimy Urząd Ochrony Konkurencji i Konsumentów, w tym przez dofinansowanie i zwiększenie zatrudnienia specjalistów. Jasno określimy uprawnienie UOKiK do nakazania wypłaty rekompensaty publicznej. W przypadku wykrycia zmów cenowych wprowadzimy kary równe wysokości nielegalnych zysków. Wzmocnienie UOKiK pozwoli na skuteczniejszą walkę ze zjawiskami takimi jak celowe skracanie żywotności produktów i urządzeń, żerowanie na samotności seniorów czy fabrykowanie pozytywnych opinii w internecie. Uregulujemy rynek suplementów diety, wzmacniając kontrolę Głównego Inspektoratu Sanitarnego przed wprowadzeniem do obrotu, ograniczając ich reklamę i zakazując sprzedaży bezpośredniej suplementów."),
    ("ban-predatory-loans", "Stop lichwiarzom, parabankom i piramidom finansowym. Pożyczki „chwilówki” to żerowanie na osobach znajdujących się w trudnej sytuacji finansowej. Dlatego zakażemy udzielania nieuczciwych pożyczek oraz ograniczymy działanie nieuczciwych pożyczkodawców. Stworzymy alternatywne, publiczne programy pożyczek o niskim, stałym, możliwym do spłaty oprocentowaniu, dostępne dla wszystkich obywateli."),
    # Transport (66-71)
    ("local-rail-bus-restoration", "Inwestycje w transport zbiorowy. W ramach walki z wykluczeniem transportowym będziemy odtwarzać lokalne połączenia kolejowe i autobusowe, by pociąg dojeżdżał do każdego powiatu, a autobus do każdej gminy. Wprowadzimy dotację transportową dla samorządów, którą będzie można przeznaczyć wyłącznie na organizację transportu publicznego na terenie JST. Sfinansujemy z budżetu państwa lokalne linie autobusowe koordynowane przez państwo we współpracy z samorządami. Zadbamy o dostateczną liczbę połączeń w ciągu dnia, by zaspokoić potrzeby transportowe mieszkańców. Zlikwidujemy spółkę PKP PLK i powołamy dyrekcję dróg kolejowych na wzór Generalnej Dyrekcji Dróg Krajowych i Autostrad. Rozwiniemy nowoczesny polski przemysł środków transportu zbiorowego i oprzemy o niego rozbudowę sieci połączeń."),
    ("transit-pass-59-zl", "Transport lokalny za 59 zł miesięcznie. Na wzór niemiecki wprowadzimy abonament na komunikację miejską, gminną oraz kolej regionalną w całym kraju."),
    ("integrated-ticketing-discounts", "Transport wygodny dla pasażera. Utworzymy jednolity katalog ulg ważny we wszystkich środkach transportu zbiorowego. Utworzymy zintegrowany system biletowy pozwalający kupić bilet na przejazd z wykorzystaniem dowolnych środków transportu zbiorowego."),
    ("no-cpk-yes-fast-rail", "Nie dla CPK, tak dla kolei dalekobieżnej. Odstąpimy od budowy Centralnego Portu Komunikacyjnego, zachowując towarzyszące CPK inwestycje kolejowe. Przy wytyczaniu tras kolei będziemy brali pod uwagę głos społeczny. Zamiast tego skupimy się na rozbudowie sieci szybkich kolei dalekobieżnych. Wzorem austriackim będziemy rozwijać ofertę polskich kolei na trasach międzynarodowych."),
    ("transport-electrification", "Elektryfikacja transportu Będziemy rozwijać elektromobilność w Polsce. Oprócz elektrycznych pociągów i tramwajów będziemy inwestować w autobusy elektryczne i trolejbusy. Zwiększymy liczbę stacji ładowania dla samochodów elektrycznych, by umożliwiały wygodne przemieszczanie się. Będziemy inwestować w badania i wdrażanie technologii wodorowych i biopaliw tam, gdzie elektryfikacja byłaby nieefektywna."),
    ("vision-zero-roads", "Bezpieczne drogi. Zastosujemy Wizję Zero, czyli zero ofiar śmiertelnych na polskich drogach. Wprowadzimy program poprawy bezpieczeństwa ruchu drogowego, szczególnie w okolicach szkół i przy przejściach dla pieszych. Zamiast stawiać kolejne czarne punkty, będziemy przebudowywać infrastrukturę i zmieniać organizację ruchu tak, by zmniejszyć liczbę wypadków."),
    # Equality / culture / migration (72-84)
    ("abortion-on-demand-12-weeks-l", "Legalna aborcja bez kompromisów. Wprowadzimy uzależnione wyłącznie od decyzji kobiety prawo do przerwania ciąży do 12 tygodnia."),
    ("alimony-enforcement-tax-office", "Alimenty to nie prezenty. Wprowadzimy program efektywnego ściągania alimentów przez urzędy skarbowe – tak jak zaległości podatkowe. Państwo będzie gwarantowało wypłatę zasądzonych alimentów, a następnie ściągało należność od osób uchylających się od tego obowiązku. Rozwiązanie to zastąpi niewydolny i niezabezpieczający interesów wierzycielek fundusz alimentacyjny. Wprowadzimy mechanizm alimentów natychmiastowych – sądy będą wydawały decyzje o zabezpieczeniu obowiązku alimentacyjnego na początku postępowań, aby w często przedłużających się sprawach nie pozbawiać dziecka środków niezbędnych do godnego życia."),
    ("rape-definition-only-yes", "Chroniąca ofiary definicja zgwałcenia. Gwałt jest zbrodnią – tylko „tak” oznacza zgodę. Ze względu na obecną treść art. 197 Kodeksu karnego sądy zbyt często pozostawiają gwałcicieli bez kary. Zmienimy ustawową definicję zgwałcenia tak, aby polskie prawo lepiej chroniło ofiary przemocy seksualnej."),
    ("defamation-decriminalize-art-212", "Likwidacja art. 212 Kodeksu karnego. Zniesławienie powinno zniknąć z prawa karnego. Przepisy prawa cywilnego o ochronie dóbr osobistych są wystarczającym narzędziem obrony przed pomówieniami, a groźba sankcji karnej służy wyłącznie zastraszaniu dziennikarzy i aktywistów."),
    ("marijuana-legalize-amnesty", "Legalizacja marihuany i amnestia dla osób karanych za jej posiadanie. Zalegalizujemy marihuanę. Jej produkcję i sprzedaż oprzemy o system licencjonowanych lokalnych producentów, zapewniając państwowy nadzór nad bezpieczeństwem substancji w obrocie. Umożliwimy uprawę niewielkich ilości na własny użytek. Dodatkowo zaprzestaniemy karania za posiadanie na własny użytek określonych ilości innych substancji psychoaktywnych. Zainwestujemy w rzetelną edukację dotyczącą wszystkich uzależniających substancji. Wdrożymy zintegrowany system terapii i pomocy dla osób zmagających się z uzależnieniami oraz ich rodzin, oparty na badaniach naukowych."),
    ("marriage-equality-civil-partnerships", "Miłość dla wszystkich. Wprowadzimy pełną równość małżeńską, a także instytucję związków partnerskich niezależnie od płci."),
    ("conversion-therapy-ban", "Strefa wolna od nienawiści. Ułatwimy prawną i medyczną procedurę uzgodnienia płci. Zakażemy tzw. „terapii konwersyjnych” i innych szkodliwych, pseudonaukowych praktyk wymierzonych w osoby LGBTQ+. Rozszerzymy art. 119, 256 i 257 Kodeksu karnego o przestępstwa związane z nienawiścią na tle orientacji psychoseksualnej i tożsamości płciowej."),
    ("silesian-kashubian-minority-status", "Polska silna różnorodnością. Nadamy Ślązakom i Kaszubom status mniejszości etnicznych, a tym samym ślůnsko godka zostanie objęta ochroną na równi z kaszëbsczim jãzëkã. Język wilamowski otrzyma status języka regionalnego. Zadbamy o ochronę kulturowego i językowego bogactwa Rzeczypospolitej, przeznaczając środki na rewitalizację, promocję kultury i badania nad językami mniejszości zamieszkałych w Polsce. Przywrócimy należyte finansowanie nauczaniu języków mniejszości narodowych."),
    ("ipn-dissolve-archives-transfer", "Koniec propagandy. Czas skończyć z szerzeniem prawicowej propagandy za pieniądze polskich podatników. Rozwiążemy Instytut Pamięci Narodowej. Materiały archiwalne IPN zostaną przekazane Archiwom Państwowym, a pion prokuratorski włączony w struktury Prokuratury Krajowej. Zlikwidujemy Narodowy Dzień Pamięci „Żołnierzy Wyklętych” i zastąpimy go Dniem Prawdy i Pojednania."),
    ("public-media-pluralism-rmn", "Wolne media publiczne bez hejtu. Stworzymy profesjonalne, pluralistyczne media publiczne o ustalonych standardach prowadzenia zrównoważonej debaty publicznej. Stworzymy transparentny system rekomendacji i wyboru osób pełniących funkcje nadzorcze w mediach publicznych – zapewniający udział w tym procesie organizacjom społecznym. Uwolnimy media publiczne od komercyjnych reklam. Zlikwidujemy Radę Mediów Narodowych."),
    ("culture-no-censorship-transparent-directors", "Kultura niepodległa. Zagwarantujemy, że kultura nie będzie obiektem cenzury ani narzędziem partyjnych wojenek. Dyrektorami publicznych instytucji kultury nie mogą być polityczni nominaci – konkursy muszą być przejrzyste, a wysłuchania kandydatów dostępne w internecie dla wszystkich zainteresowanych."),
    ("national-library-digital-lending", "Cyfrowa wypożyczalnia Biblioteki Narodowej. Biblioteka Narodowa uruchomi system wypożyczeń online zintegrowany z aplikacją mObywatel. Każdy będzie mógł wypożyczyć w danym momencie jedną kopię znajdującego się w cyfrowych zasobach BN dzieła objętego ochroną prawa autorskiego. Utwory znajdujące się w domenie publicznej dostępne będą bez ograniczeń. Dostosujemy ustawę o prawie autorskim do potrzeb funkcjonowania bibliotek cyfrowych, uwzględniając znaczenie godnego wynagrodzenia dla twórców."),
    ("migrant-protection-no-pushbacks", "Humanitarna polityka migracyjna i uchodźcza. Prawo do ubiegania się o ochronę międzynarodową jest jednym z podstawowych praw człowieka i musi być bezwarunkowo respektowane. Zagwarantujemy możliwość złożenia wniosku o ochronę zarówno na granicy, jak i na terytorium RP. Zakończymy proceder wypychania z terytorium Polski osób szukających ochrony (tzw. pushbacków). Usprawnimy procedurę rozpatrywania wniosków o ochronę i zapewnimy humanitarne standardy w ośrodkach dla uchodźców."),
    # Secularism (85-88)
    ("religion-out-of-schools-uchylenie-196", "Świeckie państwo. Skończymy z uprzywilejowaną pozycją Kościoła katolickiego i wypowiemy konkordat. Wyprowadzimy religię ze szkół do salek katechetycznych i skończymy z finansowaniem z publicznych środków wynagrodzeń katechetów. Wprowadzimy w życie do tej pory nierealizowaną zasadę neutralności religijnej urzędów oraz instytucji państwowych, które mają służyć wszystkim obywatelom bez względu na ich wyznanie lub jego brak. Prokuratura nie jest od tego, by ścigać za „bluźnierstwo”, dlatego uchylimy art. 196 Kodeksu karnego o obrazie uczuć religijnych."),
    ("church-state-financial-separation", "Finansowy rozdział kościoła od państwa. Zlikwidujemy finansowe i podatkowe przywileje kleru, w tym Fundusz Kościelny. Zakończymy proceder przekazywania kościołom nieruchomości nieodpłatnie lub za bezcen. Usuniemy ustanowiony dla kościołów wyjątek od zakazu nabywania ziemi rolnych. Wprowadzimy wymóg ewidencjonowania przychodów kościołów i związków wyznaniowych."),
    ("truth-and-reconciliation-commission", "Bezwzględna walka z pedofilią. Zniesiemy przedawnienie przestępstw seksualnych wobec dzieci. Stworzymy Komisję Prawdy i Zadośćuczynienia, posiadającą uprawnienia prokuratorskie, która – na wzór podobnych komisji w innych krajach – zajmie się systemową odpowiedzialnością Kościoła katolickiego za przemoc seksualną księży wobec dzieci i za tuszowanie tej przemocy przez hierarchów. Wprowadzimy bezwzględną zasadę wypłaty odszkodowań na rzecz ofiar. Skończymy z ignorowaniem polskiego prawa przez Kościół katolicki i doprowadzimy do zabezpieczenia kościelnych archiwów na potrzeby śledztw."),
    ("conscience-clause-elimination", "Likwidacja klauzuli sumienia. Niedopuszczalna jest sytuacja, gdy pacjentce bezzasadnie odmawia się procedury medycznej czy wydania leku. Błędnie rozumiana wolność sumienia nie może ograniczać konstytucyjnego prawa do ochrony zdrowia."),
    # EU (89-93)
    ("poland-strong-in-eu", "Silna Polska w silnej Europie Będziemy dążyć do umacniania roli Polski w Unii Europejskiej poprzez współpracę z jej państwami członkowskimi i instytucjami, opartą na poszanowaniu i zaufaniu. Zakończymy szkodliwy spór z Unią Europejską przez zapewnienie w Polsce niezależnego i sprawiedliwego sądownictwa. Odblokujemy potrzebne Polsce środki z Krajowego Planu Odbudowy. Dzięki naprawie stosunków z partnerami europejskimi Polska będzie miała realny wpływ na kierunek rozwoju Unii Europejskiej. Wspólna droga rozwoju, wyzwania i cele łączą nas z krajami Europy Środkowo-Wschodniej. Nadamy większe znaczenie partnerstwu demokratycznych państw naszego regionu, co wzmocni naszą suwerenność i wspólną pozycję w UE."),
    ("ep-strengthen-no-unanimity", "Unia demokratyczna i społeczna Będziemy dążyć do zacieśnienia integracji europejskiej poprzez ściślejszą współpracę w sprawach społecznych, w tym wprowadzenie równych standardów ochrony prawa pracy, ubezpieczeń społecznych i ochrony zdrowia. Będziemy dążyć do tego, by inwestycje na poziomie unijnym były transparentne, wspierające innowacje i przyjazne klimatowi. Popieramy nadanie Parlamentowi Europejskiemu inicjatywy ustawodawczej i umocnienie funkcji kontrolnej nad Komisją Europejską. Opowiadamy się za stopniowym odchodzeniem od zasady jednomyślności w organach Unii Europejskiej na rzecz podwójnej kwalifikowanej większości oraz poprawą transparentności instytucji UE i walką z korupcją w ich szeregach."),
    ("euro-adoption-timeline", "Mapa drogowa przyjęcia euro. Ważnych decyzji nie podejmuje się pochopnie. Opowiadamy się za wypracowaniem ponad politycznymi podziałami mapy drogowej – przyjęcie euro dopiero po spełnieniu kryteriów konwergencji oraz w optymalnym momencie dla polskiej gospodarki i sytuacji gospodarstw domowych."),
    ("eu-enlargement-ua-md-ge-balkans", "Otwarte drzwi dla nowych członków UE. Wspieramy unijne aspiracje Ukrainy, Mołdawii, Gruzji i państw Bałkanów Zachodnich. Będziemy wspierać społeczeństwa tych państw w budowie europejskich standardów socjalnych i demokratycznych i przestrzegania praw człowieka. Opowiadamy się za zwiększeniem wsparcia dla ich transformacji energetycznej, co pozwoli uniezależnić państwa regionu od Rosji."),
    ("eu-vote-from-16", "Prawo do głosowania w wyborach do Parlamentu Europejskiego od 16. roku życia. Młodzi ludzie powinni szeroko uczestniczyć w życiu publicznym i jak najwcześniej móc decydować o swojej przyszłości. Dlatego prawo do głosowania w wyborach do Parlamentu Europejskiego powinno przysługiwać wszystkim po ukończeniu 16. roku życia. Obniżenie wieku czynnego prawa wyborczego w wyborach europejskich jest możliwe bez zmiany Konstytucji."),
    # Diplomacy (94-103)
    ("positive-sum-diplomacy", "Gra o sumie dodatniej. Odrzucamy koncepcję stosunków międzynarodowych jako gry o sumie zerowej. Nie chcemy fałszywych kompromisów, gdzie obie strony są wyłącznie niezadowolone, nie uznajemy też, że sukces jednego państwa musi oznaczać porażkę drugiego. Uznajemy, że współpraca między państwami może i powinna służyć zwiększaniu dobrobytu i bezpieczeństwa wszystkich państw i społeczeństw. Odcinamy się od wizji stosunków międzynarodowych opartej na uproszczeniach, uprzedzeniach historycznych i błędnych teoriach geopolitycznych. Oprzemy polską politykę zagraniczną na uniwersalnych, humanistycznych wartościach: solidarności między narodami, prawach podstawowych i prawach człowieka. Polityka zagraniczna Polski powinna dążyć do osiągnięcia celów służących całej wspólnocie międzynarodowej."),
    ("ukraine-arms-and-eu-accession", "Wolna Ukraina. Będziemy kontynuować pomoc sprzętową i humanitarną dla Ukrainy w zakresie m.in. uzbrojenia, wyposażenia wojskowego, szkoleń, centrów remontowych, logistyki i leków. Wspieramy starania na rzecz stworzenia planu odbudowy Ukrainy opartego na zasadzie sprawiedliwości społecznej. Popieramy umorzenie długu zagranicznego Ukrainy. Wspieramy starania Ukrainy o członkostwo w Unii Europejskiej oraz w uzyskaniu unijnego wsparcia w dostosowaniu praw socjalnych, środowiskowych i pracowniczych do standardów UE."),
    ("russia-sanctions-tighten", "Twarda polityka wobec Rosji i państw satelickich. Zakończymy handel z Rosją, zwłaszcza w zakresie paliw kopalnych. Popieramy uszczelnienie sankcji na Rosję oraz skuteczną konfiskatę majątków oligarchów powiązanych z Putinem lub Łukaszenką. Zbrodniarze wojenni powinni zostać ujęci i osądzeni. Doceniamy działania osób sprzeciwiających się rosyjskiej i białoruskiej autokracji, działających m.in. w ruchach antywojennych, antykolonialnych, pracowniczych, na rzecz praw kobiet oraz osób LGBTQ+. Wzywamy państwa Unii Europejskiej do zapewnienia niezbędnego wsparcia prześladowanym dysydentom i opozycjonistom."),
    ("baltic-security-cooperation", "Bezpieczny Bałtyk. Będziemy zacieśniać współpracę w kwestiach bezpieczeństwa w basenie Morza Bałtyckiego (kontrwywiad, patrole) w celu ochrony infrastruktury i gospodarki morskiej. Bliższa współpraca obejmie też obszar ochrony środowiska i ekosystemu morskiego, jak również wzajemnie korzystne porozumienia związane z rozwojem gospodarczym oraz infrastrukturą energetyczną i transportową regionu. Będziemy tworzyć inicjatywy służące pogłębianiu relacji społecznych, w tym edukacyjnych i równościowych, między naszymi krajami i wspierać inicjatywy oddolne w tym zakresie."),
    ("eu-defence-pesco", "Unia Europejska wspólnotą bezpieczeństwa Oprócz osadzenia w NATO Polska i Europa potrzebują własnej, komplementarnej współpracy obronnej. Zwiększymy zaangażowanie Polski w już istniejące programy w ramach PESCO, szczególnie w zakresie wspólnych ćwiczeń oraz modernizacji i zakupów sprzętu. Wspólne, koordynowane zakupy pozwolą ustandaryzować wyposażenie na poziomie UE i zwiększyć racjonalność wydatkowania środków. Będziemy dążyć do zawarcia umów z państwami UE i NATO dotyczących współpracy służb ochrony ludności cywilnej i wzajemnej pomocy w razie wybuchu konfliktu zbrojnego lub katastrof naturalnych."),
    ("us-strategic-partnership", "Partnerska współpraca z USA. Będziemy kontynuować strategiczną współpracę gospodarczą i technologiczną ze Stanami Zjednoczonymi, zwłaszcza w obszarach takich jak energetyka czy kluczowe komponenty (półprzewodniki i inne elementy technologii IT). Będziemy kontynuować partnerstwo obronne między naszymi krajami. W relacjach USA-Europa będziemy kłaść nacisk na utrzymanie standardów demokratycznych, również w celu zwiększenia naszej wiarygodności wobec społeczności międzynarodowej."),
    ("polish-diaspora-support", "Wsparcie dla Polaków za granicą. Zwiększymy nakłady na obsługę konsularną i zwiększymy liczbę placówek, aby skrócić czas oczekiwania na paszporty. Szczególną uwagę zwrócimy na placówki w Wielkiej Brytanii, aby objąć Polki i Polaków ochroną w związku z Brexitem. Będziemy obejmować szczególną opieką Polaków w Białorusi oraz działać na rzecz uwolnienia więźniów politycznych. Zwiększymy liczbę komisji wyborczych za granicą, aby ułatwić udział w wyborach. Zbudujemy spójny system promocji polskiej kultury oraz polskich szkół za granicą, który będzie oparty na poszanowaniu różnorodności polskiego dziedzictwa historycznego i kulturalnego, a nie na wąskim podejściu narodowo-katolickim"),
    ("global-south-fair-trade", "Polska i Europa dobrym partnerem dla świata. Opowiadamy się za modernizacją umów handlowych Unii Europejskiej z państwami Globalnego Południa w duchu zrównoważonego rozwoju i zmniejszenia wyzysku. Przeznaczymy więcej środków na pomoc rozwojową. Popieramy inicjatywy na rzecz transferu technologii do krajów rozwijających się. Będziemy też zabiegać o oddłużenie wszystkich krajów rozwijających się i modernizujących gospodarczo i społecznie. Partnerskie traktowanie Globalnego Południa zamiast podejścia kolonialnego osłabi wpływy rosyjskie i chińskie, dając Europie i światu wyższy poziom bezpieczeństwa i stabilności."),
    ("economic-diplomacy-rebuild", "Odbudowa dyplomacji gospodarczej. Zadaniem polskiej dyplomacji powinno być również przyciąganie wartościowych inwestycji i promocja polskiego eksportu. Uporządkujemy zasady funkcjonowania Wydziałów Promocji Handlu i Inwestycji przy polskich ambasadach."),
    ("foreign-service-depoliticize", "Odbudowa służby zagranicznej. Dyplomacja musi być profesjonalna, a podstawą awansu i rozwoju zawodowego muszą być kompetencje. Skończymy z obsadzaniem placówek z klucza partyjnego. Będziemy dążyć do umacniania relacji Polski z innymi państwami nie tylko poprzez tradycyjne metody obecności na miejscu, ale też ambitne wejście w erę dyplomacji cyfrowej. Uchwalimy nową ustawę o służbie zagranicznej wprowadzającą w życie te zasady oraz eliminującą naciski partyjne i chaos. Będziemy stać na straży zasad protokołu dyplomatycznego i godności państwa polskiego, zwłaszcza w relacjach z mocarstwami czy Watykanem."),
    # Security / police / military (104-110)
    ("cyber-security-agency", "Cyberbezpieczeństwo. Utworzymy Agencję Cyberbezpieczeństwa, która skoordynuje krajowy system ochrony cyberprzestrzeni. Wzmocnimy finansowo i kadrowo Urząd Ochrony Danych Osobowych. Wprowadzimy edukację o bezpieczeństwie w sieci od szkoły podstawowej, żeby wzmocnić ochronę dzieci przed zagrożeniami w Internecie. Wprowadzimy pakiet rozwiązań przeciwdziałających inwigilacji i nielegalnemu wykorzystywaniu danych osobowych przez służby państwowe i prywatne korporacje."),
    ("post-factum-surveillance-notice", "Kontrola działalności operacyjnej Wprowadzimy realny nadzór sądowy nad czynnościami operacyjnymi. Każdy obywatel uzyska prawo do informacji o działaniach operacyjnych przeprowadzanych wobec niego – nie później niż 6 miesięcy po zakończeniu kontroli. Włączymy Rzecznika Praw Obywatelskich w szeroki nadzór nad służbami specjalnymi. Wprowadzimy zasadę niekorzystania z owoców zatrutego drzewa, czyli dowodów pozyskanych w ramach niezgodnej z prawem inwigilacji."),
    ("modern-army-european-reserves", "Nowoczesna armia. Popieramy działania zmierzające do powołania europejskich sił zbrojnych uzupełniających potencjał obronny NATO i Wojska Polskiego. Opowiadamy się za wsparciem armii zawodowej silną, dobrowolną rezerwą - bez przywracania poboru. Będziemy kontynuować program modernizacji wyposażenia armii i dostosowanie jej do potrzeb dzisiejszych czasów oraz przeprowadzimy przegląd obecnych programów modernizacyjnych. Każdy zakup wyposażenia dla polskiej armii powinien nieść ze sobą import i przyswojenie technologii przez rodzimy przemysł obronny."),
    ("civil-defence-shelters", "Bezpieczeństwo ludności cywilnej. Wdrożymy model wszechstronnej obronności w stylu nordyckim. Odtworzymy sieć infrastruktury przeznaczonej dla ochrony ludności cywilnej: schrony, ujęcia wody, magazyny leków czy drogi ewakuacyjne. Powołamy Służbę Obrony Cywilnej, która będzie odpowiedzialna za koordynację i prowadzenie wszystkich działań związanych z ochroną ludności, takich jak edukacja, ćwiczenia i czuwanie nad gotowością. Zdecydowanie zacieśnimy współpracę między instytucjami diagnozującymi i monitorującymi zagrożenia, w tym hybrydowe, cyfrowe, zdrowotne i naturalne."),
    ("police-safety-feeling-metrics", "Policja przyjazna obywatelom, a nie na usługach polityków. Zapewnimy, że funkcjonariusze policji będą obowiązkowo wyposażeni w identyfikatory i kamery nasobne. Wprowadzimy szkolenia i zasady postępowania zgodne ze standardami przestrzegania praw człowieka i procedurami deeskalacji. Zmienimy priorytety w ocenie pracy policji, odchodząc od nabijania statystyk na rzecz mierników poczucia bezpieczeństwa wśród społeczności. Wprowadzimy kadencyjność Komendanta Głównego Policji."),
    ("central-police-monitoring-bureau", "Utworzenie Centralnego Biura Monitorowania Policji. Będzie to niezależna od MSWiA jednostka organizacyjna podporządkowana Sejmowi. Jej pracownicy i szef będą osobami spoza policji i służb specjalnych i nie będą mogli być ich byłymi funkcjonariuszami. Szefa BMP wybierać będzie Sejm i przed nim składać będzie co roku sprawozdanie ze swojej działalności. Komisja prowadzić będzie postępowania w sprawach skarg i wniosków na policję."),
    ("uniformed-services-pay", "Nowoczesne, dobrze wynagradzane służby. Podniesiemy wynagrodzenia funkcjonariuszy służb mundurowych i pracowników cywilnych. Będziemy kontynuować Program Modernizacyjny Służb Mundurowych. Zapewnimy niezbędne do wykonywania obowiązków służbowych materiały i środki. Uregulujemy pozycję prawno-ustrojową służb, straży i inspekcji, w tym formacji ochrony kolei."),
    # Healthcare (111-126)
    ("healthcare-8pct-gdp", "Sprawna publiczna ochrona zdrowia. Będziemy dążyć do przekazywania 8% PKB na ochronę zdrowia – bez księgowych sztuczek. Zwiększenie środków na publiczną ochronę zdrowia pozwoli zapewnić pacjentom wysoki standard świadczeń na NFZ, oddłużyć szpitale i umożliwi znaczne skrócenie kolejek. Odpowiednio dofinansowany i sprawny publiczny system to sposób na powstrzymanie prywatyzacji ochrony zdrowia, zwłaszcza w dziedzinach takich jak psychiatria, stomatologia czy ginekologia. Powstrzymamy przekształcanie samorządowych szpitali i przychodni w spółki prawa handlowego."),
    ("primary-care-multi-disciplinary", "Zwiększenie roli placówek Podstawowej Opieki Zdrowotnej (POZ). Profilaktyka i kształtowanie postaw prozdrowotnych, wczesna diagnostyka oraz stała relacja z pacjentem mają kluczowe znaczenie dla poprawy stanu zdrowia Polek i Polaków. Będziemy rozwijać opiekę koordynowaną w POZ i wzmocnimy rolę koordynatora, wspierającego pacjentów w sprawnej i możliwie szybkiej realizacji procesu leczenia, a także późniejszej rekonwalescencji i rehabilitacji. Zadbamy o współpracę zespołu POZ z rodziną pacjenta przewlekle chorego. Będziemy dążyć do poszerzenia zespołu POZ, tak by oprócz lekarza, pielęgniarki i położnej w jego skład weszli także dietetyk, fizjoterapeuta, psycholog i farmaceuta."),
    ("ambulatory-care-priority", "Priorytet dla medycyny prewencyjnej i opieki ambulatoryjnej. Polska opieka zdrowotna od lat zmaga się z problemem odwróconej piramidy świadczeń: szpitale są przepełnione pacjentami, którzy mogą być skutecznie leczeni w placówkach Podstawowej Opieki Zdrowotnej. Ograniczymy nadmierną hospitalizację poprzez poprawę koordynacji działań placówek zdrowotnych i odpowiednie finansowanie POZ i Ambulatoryjnej Opieki Specjalistycznej. Szpitale zostaną odciążone z wykonywania zadań, które można realizować na niższych szczeblach."),
    ("medical-staffing-specializations", "Kompetentne i dobrze wynagradzane kadry. Zwiększymy liczbę przyjęć na specjalizacje lekarskie zgodnie z potrzebami społecznymi. Jednocześnie skierujemy dodatkowe środki, aby zagwarantować jakość kształcenia. Stworzymy odpowiednie warunki pracy pielęgniarkom i absolwentom innych kierunków medycznych, aby zachęcić ich do pracy w publicznych placówkach ochrony zdrowia w Polsce. Zapewnimy lepsze wykorzystanie istniejących kadr medycznych poprzez racjonalny podział obowiązków w systemie, w tym zwiększając autonomię i odpowiedzialność „nielekarskich” zawodów medycznych. Odciążymy lekarzy i pielęgniarki, zapewniając zatrudnienie asystentów i opiekunów medycznych na każdym oddziale. Sprawna ochrona zdrowia nie może funkcjonować bez pracowników niemedycznych, dlatego zadbamy o godne warunki ich zatrudnienia i ograniczymy outsourcing w publicznej ochronie zdrowia."),
    ("no-fault-medical-errors", "System no-fault. Znowelizujemy ustawę o jakości w opiece zdrowotnej i bezpieczeństwie pacjenta, aby wprowadzić w życie zasadę no-fault. Obecne przepisy oznaczają, że pracownicy ochrony zdrowia nadal będą się bać zgłaszać działania niepożądane i realizować ryzykowne procedury, w obawie, że będzie wisiało nad nimi widmo wyroku. Poprawę jakości i bezpieczeństwa leczenia da się osiągnąć dzięki wykrywaniu błędów, ich wnikliwej analizie i minimalizowaniu ryzyka wystąpienia podobnych zdarzeń w przyszłości, a nie poprzez ściganie medyków."),
    ("hospital-investment-4b", "Inwestycje w szpitalach. Szpitale w całej Polsce muszą być nowoczesnymi i bezpiecznymi miejscami skutecznego leczenia pacjentów. Wymaga to remontów oraz zakupu nowoczesnego sprzętu. Przeznaczymy dodatkowe 4 mld zł rocznie na remonty i zakup sprzętu w szpitalach powiatowych i wojewódzkich."),
    ("nfz-mental-dental-coverage", "Lepsza opieka stomatologiczna dla wszystkich ubezpieczonych. Rozszerzymy pakiet gwarantowanych świadczeń z zakresu leczenia stomatologicznego, w tym o leczenie kanałowe i nowoczesne wypełnienia wszystkich zębów oraz wysokiej jakości protetykę. Na bazie punktów nocnej pomocy stomatologicznej utworzymy sieć całodobowych stomatologicznych oddziałów ratunkowych."),
    ("mental-health-nfz-coverage", "Powszechnie dostępna pomoc psychologiczna i psychiatryczna finansowana przez państwo. Zapewnimy powszechny dostęp do pomocy psychologicznej i psychiatrycznej w publicznej ochronie zdrowia, odwracając w ten sposób proces prywatyzacji tych obszarów. Zwiększymy dostępność bezpłatnej psychoterapii w ramach NFZ i umożliwimy dostęp do psychologa bez skierowania. Zwiększymy finansowanie świadczeń terapeutycznych, co zachęci przyszłych psychologów i psychiatrów do wyboru zawodu psychoterapeuty. Wprowadzimy dofinansowanie do 100% kosztów udziału w akredytowanych przez Polską Komisję Akredytacyjną kursach psychoterapii pod warunkiem czasowego zobowiązania do pracy w publicznych poradniach. Zapewnimy powszechny dostęp do pomocy psychologicznej i psychiatrycznej za pośrednictwem poradni stacjonarnych, telefonicznych i online. Położymy nacisk na identyfikowanie i diagnozowanie przypadków zaburzeń na wczesnym etapie. Zwiększymy udział nakładów na pomoc psychologiczną i psychiatryczną w wydatkach zdrowotnych – ze szczególnym naciskiem na leczenie dzieci i młodzieży. Pandemia COVID-19 pokazała, jak ważne jest przeciwdziałanie negatywnym skutkom stresu wśród samych pracowników ochrony zdrowia – dlatego zapewnimy stałe wsparcie psychologiczne dla medyków i personelu pomocniczego."),
    ("ivf-refund-teen-gynecology", "Opieka zdrowotna dla nastolatków. Starsze nastolatki powinny mieć prawo do wizyty ginekologicznej bez asysty rodzica. Umożliwimy korzystanie z porady ginekologicznej lub urologicznej przez osobę małoletnią powyżej 15. roku życia na podstawie wyłącznie własnej zgody."),
    ("prenatal-tests-refunded", "Refundowane i dostępne badania prenatalne. Każda kobieta w ciąży – niezależnie od wieku – będzie miała dostęp do szerokiego katalogu badań, w tym do USG genetycznego, testów PAPP-A, potrójnego, najnowocześniejszych nieinwazyjnych testów prenatalnych, a w przypadku wskazań medycznych także amniopunkcji, biopsji kosmówki i kordocentezy. Zatajanie wyników badań przed pacjentką będzie karalne."),
    ("patient-rights-ombudsman-funded", "Pacjent w centrum systemu. Dofinansujemy urząd Rzecznika Praw Pacjenta tak, by mógł w należytej skali czuwać nad godnością pacjentów. Stworzymy standardy organizacyjne opieki zdrowotnej dla grup szczególnie narażonych na złe traktowanie i dyskryminację w systemie ochrony zdrowia – na przykład ze względu na wiek, neuroatypowość, doświadczenie poronienia, potrzebę przerwania ciąży, orientację psychoseksualną, tożsamość płciową czy wagę."),
    ("free-meds-pregnant-transplant", "Dostępne leki na każdą kieszeń. Każdy lek na receptę będzie kosztował nie więcej niż 5 złotych za opakowanie. Taka sama zasada będzie dotyczyć wyrobów medycznych, takich jak pompy insulinowe, aparaty słuchowe czy inhalatory. Dla dzieci, emerytów, rencistów, kobiet w ciąży i pacjentów po przeszczepach leki na receptę dostępne będą bezpłatnie."),
    ("drug-security-domestic-pharma", "Bezpieczeństwo lekowe Polski. Systemowo zabezpieczymy zaopatrzenie aptek. Będziemy skutecznie zwalczać wywożenie leków z Polski przez mafie lekowe, m.in. zwiększając ściągalność kar pieniężnych z podmiotów i osób zamieszanych w ten proceder. Uruchomimy program rozwoju krajowego przemysłu farmaceutycznego finansowany z budżetu państwa i osadzony w politykach przemysłowych UE. Produkcja substancji czynnych i leków w Polsce i Europie pozwoli ochronić pacjentów przed niedoborami leków w przypadku zakłóceń globalnych łańcuchów dostaw i będzie szansą rozwojową dla polskiej gospodarki. Skierujemy dodatkowe środki do Państwowej Inspekcji Farmaceutycznej."),
    ("contraception-menstrual-poverty", "Dostępna antykoncepcja i przeciwdziałanie ubóstwu menstruacyjnemu. Zagwarantujemy łatwiejszy dostęp do leków antykoncepcyjnych. Antykoncepcja awaryjna będzie dostępna bez recepty. Uniemożliwimy odmowę wydania środków antykoncepcyjnych w aptekach poprzez powoływanie się na tzw. „klauzulę sumienia”, co stanowi nielegalne ograniczenia praw pacjenta do świadczeń zdrowotnych. Będziemy przeciwdziałać ubóstwu menstruacyjnemu poprzez zapewnienie dostępu do bezpłatnych środków higienicznych w szkołach i innych instytucjach publicznych."),
    ("ivf-program-state-funded", "Publiczny program in vitro. Wprowadzimy publiczny ogólnopaństwowy program leczenia niepłodności, w tym przez zapłodnienie pozaustrojowe (in vitro). Zasobność portfela nie może decydować o możliwości poszerzenia rodziny o dzieci. Metody wspierania osób w walce z niepłodnością muszą opierać się na nauce, a nie przesądach. Obecnie Polska jest jedynym państwem Unii Europejskiej, które nie wspiera finansowo procedury zapłodnienia in vitro. Czas to zmienić."),
    ("preventive-medicine-vaccination", "Lepiej zapobiegać niż leczyć. Będziemy rozwijać program szczepień dzieci i dorosłych. Zapewnimy wszystkim dostępne i bezpłatne szczepienia przeciwko grypie sezonowej, umożliwimy uzupełnianie szczepień na odrę i inne choroby zakaźne dla osób dorosłych. Poszerzymy grupę docelową bezpłatnych szczepień o pneumokoki i HPV. Szczepionki i ich podanie będą bezpłatne i szeroko dostępne w punktach szczepień oraz aptekach. Postawimy na stałą edukację społeczeństwa na temat korzyści zdrowotnych wynikających z regularnych szczepień. Nadamy uprawnienia do szczepienia i kwalifikowania do szczepienia kolejnym zawodom medycznym, a państwo zapewni pełne finansowanie niezbędnych kursów."),
    # Seniors / pensions (127-136)
    ("seniority-based-pension", "Emerytury stażowe. Umożliwimy wcześniejsze przejście na emeryturę pracownikom o bardzo długim stażu pracy. W wielu przypadkach osoby te – ze względu na negatywny wpływ wieloletniej ciężkiej pracy, zwykle fizycznej, na stan zdrowia – przez ostatnich kilka lat przed osiągnięciem wieku emerytalnego napotykają przeszkody w kontynuowaniu aktywności zawodowej, a jednocześnie nie spełniają kryteriów wymaganych do przyznania im renty z tytułu niezdolności do pracy."),
    ("civil-contracts-count-pension-stage", "Umowy cywilnoprawne wliczane do stażu emerytury. Zaliczymy do stażu pracy okresu zatrudnienia na podstawie umów cywilnoprawnych. W obecnej sytuacji na rynku pracy jest to konieczność: inaczej całe pokolenie zatrudnione na umowy śmieciowe nie będzie miało prawa do emerytury."),
    ("second-pension-indexation-september", "Druga waloryzacja rent i emerytur we wrześniu. Wprowadzimy stały mechanizm drugiej waloryzacji rent i emerytur we wrześniu w przypadku, gdy w pierwszej połowie roku inflacja przekracza 5%."),
    ("basic-pension-pillar", "Podstawowy filar emerytalny Uzupełnimy filary emerytalne o filar podstawowy - zagwarantowaną przez państwo kwotę po 30 latach pracy, niezależnie od odprowadzonych składek. Odprowadzone składki będą dodawane do filaru podstawowego, a nie liczone od 0."),
    ("widow-pension-better-formula", "Renta wdowia. Blisko 1,5 miliona osób w Polsce nie jest w stanie utrzymać się finansowo po śmierci małżonka. Obecnie w małżeństwie emerytów, gdy umiera mąż, kobieta ma prawo do wyboru: albo zachowuje swoją emeryturę, albo z niej rezygnuje i bierze rentę rodzinną. Proponujemy korzystniejszy mechanizm. Wdowa będzie mogła albo zachować swoją emeryturę, a do tego uzyskać dodatek 50% renty po mężu, albo wybrać rentę po mężu i dodać 50% swojej emerytury. Taki sam wybór będą mogli podjąć wdowcy."),
    ("funeral-benefit-8000-zl", "Zasiłek pogrzebowy. Pogrążona w żałobie rodzina nie powinna dodatkowo martwić się, czy bez zaciągania pożyczek będzie ją stać na skromne, ale godne pożegnanie bliskiej osoby. Kwota zasiłku pogrzebowego nie zmieniła się od 2011 roku. Dlatego podniesiemy ją do 8 tys. złotych i wprowadzimy przejrzysty mechanizm corocznej waloryzacji."),
    ("uniformed-pensioner-rights-restored-l", "Cofnięcie ustawy represyjnej dla służb mundurowych. Sprzeciwiamy się stosowaniu odpowiedzialności zbiorowej. Przywrócimy prawa nabyte emerytowanych mundurowych, uchwalając ustawę eliminującą skutki ustaw z dnia 23 stycznia 2009 r. oraz z 16 grudnia 2016 r. o zmianie ustaw o zaopatrzeniu emerytalnym."),
    ("senior-tourism-voucher", "Senioralny bon turystyczny. Każda seniorka i każdy senior co dwa lata otrzyma bon w wysokości 500 zł na organizację wypoczynku, krajowe wyjazdy turystyczne i rekreacyjne."),
    ("senior-cultural-tourism-vouchers", "Bon kulturowy dla seniorów. Uczestnictwo w kulturze ma ważne znaczenie dla jakości życia seniorów – pozwala im rozwijać zainteresowania, podtrzymywać więzi społeczne i miło spędzać czas. Wprowadzimy bon kulturowy w wysokości 50 złotych miesięcznie dla osób po 65 roku życia. Będzie go można wykorzystać do opłacenia biletów do kina, teatru, muzeum, na koncert czy potańcówkę. Jednocześnie będziemy wspierać finansowo samorządy w organizacji nieodpłatnych aktywności kulturowych, w tym dedykowanych starszym mieszkańcom."),
    ("social-benefits-indexation-l", "Nic, co dane, nie będzie odebrane – będzie waloryzowane. Zachowamy świadczenia wprowadzone po 2015 roku i wprowadzimy ustawową zasadę ich corocznej waloryzacji."),
    # Social policy / disability (137-142)
    ("800-plus-indexation", "Świadczenia na rzecz rodziny. Zachowamy 800 plus i włączymy je do systemu świadczeń na rzecz rodziny. Wszystkie świadczenia będą podlegać corocznej waloryzacji o wskaźnik inflacji."),
    ("daycare-100k-new-spots", "Powszechna dostępność żłobków. Prawie 3/4 rodziców łączy wychowywanie dzieci z pracą. Mimo to mniej niż 1/4 dzieci uczęszcza do żłobka. By żłobki były dostępne cenowo dla każdej rodziny, zapewnimy w nich ok. 100 tys. nowych miejsc, współfinansowanych ze środków Unii Europejskiej."),
    ("senior-day-centers", "Domy dziennego pobytu dla seniorów. Polskie społeczeństwo starzeje się. Państwo i samorządy muszą zwalczać osamotnienie i wspierać aktywizację wszystkich osób starszych, a także wspomóc rodziny w opiece nad seniorami niesamodzielnymi. Do 2030 roku w każdej gminie powstaną współfinansowane z budżetów państwa i JST domy dziennego pobytu dla seniorów. Zapewnią one warunki do utrzymywania sprawności ruchowej i intelektualnej, rozwijania zainteresowań i nawiązywania kontaktów towarzyskich."),
    ("homelessness-housing-first", "Prawo do dachu nad głową. W Polsce brakuje spójnego systemu przeciwdziałania bezdomności, a finansowanie skierowanego do organizacji pozarządowych ministerialnego programu „Pokonać bezdomność” od blisko dwudziestu lat pozostaje na niemal niezmienionym poziomie. Opowiadamy się za przejściem od modelu wsparcia osób w kryzysie bezdomności opartego na schroniskach i noclegowniach do rozwiązań mieszkaniowych, zwłaszcza zgodnych z podejściem Najpierw Mieszkanie. Ustanowimy usługi streetworkingu obowiązkowym zadaniem własnym gminy w dużych i średnich miastach. Sprzeciwiamy się dyskryminacji osób w kryzysie bezdomności w dostępie do usług publicznych. We współpracy z trzecim sektorem postawimy na projekty wieloletnie, zapewniając im stabilne finansowanie"),
    ("disability-housing-and-jobs", "Systemowe wsparcie osób z niepełnosprawnościami. Zreformujemy system orzecznictwa, żeby precyzyjnie określać potrzeby osób z niepełnosprawnościami. Wprowadzimy elastyczne warunki pracy dla opiekunów OzN. Zniesiemy obowiązek całkowitej rezygnacji z zatrudnienia w kontekście dostępu do świadczeń związanych z opieką. Zwiększymy dostępność do edukacyjnych usług poszpitalnych, do Zakładów Opiekuńczo-Leczniczych, sanatoriów i placówek rehabilitacyjnych, Usprawnimy i uszczelnimy PFRON. Sprawnie funkcjonujący Fundusz będzie gwarancją ochrony praw osób z niepełnosprawnościami."),
    ("respite-care-for-caregivers", "Opieka wytchnieniowa i sieć asystentów osobistych. Zainwestujemy w rozwój mieszkalnictwa wspomaganego gwarantującego osobie z niepełnosprawnością niezależne życie i podmiotowe traktowanie. Program asystencji osobistej będzie uregulowany ustawowo. Każda osoba z niepełnosprawnością będzie mieć dostęp do asystenta. Rodzice i opiekunowie będą mieć możliwość skorzystania z programu opieki wytchnieniowej. Zgodnie z wyrokiem TK z 2014 roku zniesiemy różnicowanie prawa do świadczenia pielęgnacyjnego opiekuna osoby niepełnosprawnej po ukończeniu przez nią wieku określonego w tym przepisie ze względu na moment powstania niepełnosprawności. Podstawą do budowania polityki społecznej wobec osób z niepełnosprawnościami i ich opiekunów będzie Konwencja ONZ o prawach osób z niepełnosprawnościami, ratyfikowana przez Polskę 10 lat temu."),
    # Justice / courts (143-146)
    ("independent-state-rule-of-law", "Niezależne instytucje państwa prawa. Zagwarantujemy rządy prawa. Odpowiedzialni za naruszenie Konstytucji wreszcie staną przed Trybunałem Stanu. Powołamy komisję prawa i sprawiedliwości, która zbierze wszystkie naruszenia prawa przez władzę w latach 2015-2023 i opracuje specjalny raport dla organów ścigania. Trybunał Konstytucyjny, Sąd Najwyższy oraz Krajowa Rada Sądownictwa staną się niezależne od polityków. Rozdzielimy funkcję Prokuratora Generalnego od Ministra Sprawiedliwości."),
    ("courts-of-peace-local", "Sądy bliżej ludzi. Powołamy sądy pokoju, które będą działać w każdej gminie i rozstrzygać proste sprawy cywilne i sprawy o wykroczenia."),
    ("divorce-simplified-procedure", "Uprościmy procedurę rozwodową. Przeniesiemy część spraw o rozwód z drogi sądowego postępowania cywilnego na drogę postępowania administracyjnego prowadzonego przez kierownika urzędu stanu cywilnego. Bardziej skomplikowane sprawy rozwodowe będą rozstrzygane przez sądy rejonowe."),
    ("efficient-courts-pay-rise", "Sprawne sądy. Zwiększymy wynagrodzenia pracowników sądów. Ułatwimy dostęp do zwolnienia z opłat sądowych dla osób o niskich i średnich dochodach. Zapewnimy godne stawki dla pełnomocników i obrońców z urzędu, wypłacane po zakończeniu każdej kolejnej instancji, a nie dopiero po prawomocnym zakończeniu procesu. Przywrócimy sądy pracy w miejscowościach, w których zostały one zlikwidowane. Zapewnimy priorytet dla spraw rodzinnych i cywilnych, w których należy zabezpieczyć dobro dzieci, i upodmiotowimy dzieci w systemie sprawiedliwości."),
    # Housing (147-155)
    ("housing-300k-by-2029", "Krajowy Program Mieszkaniowy. W latach 2025-2029 zbudujemy w ramach Krajowego Programu Mieszkaniowego 300 000 nowoczesnych mieszkań na tani wynajem. Cały program będzie kosztować 20 miliardów rocznie, z czego 3 mld zł (środki na mieszkalnictwo za lata 2024-2026 pochodzące z unijnej części KPO) pokryją fundusze europejskie. Przyjmiemy zasadę, że mieszkania wybudowane w ramach Krajowego Programu Mieszkaniowego na stałe pozostaną w zasobie publicznym."),
    ("ministry-of-housing", "Powrót polityki mieszkaniowej. Likwidacja Ministerstwa Budownictwa w 2007 roku była błędem – polityka mieszkaniowa i przestrzenna była od tego czasu przerzucana pomiędzy resortami jak gorący kartofel. Wzorem Niemiec, które po 23-letniej przerwie reaktywowały resort dedykowany budownictwu, utworzymy Ministerstwo Mieszkalnictwa. Powołamy Państwową Agencję Mieszkaniową, która będzie działała zgodnie z zasadą „państwo płaci, planuje i wspiera, samorządy budują mieszkania”. Do jej głównych zadań będzie należało m.in. pozyskiwanie na potrzeby inwestycji mieszkaniowych działek należących do spółek skarbu państwa, mapowanie potrzeb mieszkaniowych polskiego społeczeństwa oraz egzekwowanie wysokich standardów architektonicznych, energetycznych czy związanych z infrastrukturą społeczną na nowo powstałych osiedlach."),
    ("municipal-housing-100pct-grant", "Samorząd budujący mieszkania. Zwiększymy dofinansowanie dla samorządów, które chcą budować mieszkania na wynajem – w przypadku mieszkań komunalnych maksymalna wysokość grantu z Banku Gospodarstwa Krajowego wzrośnie z 85% do 100% kosztów budowy. Będziemy rozwijać budownictwo społeczne – stworzymy zachęty, aby gminy przekazywały działki pod inwestycje Towarzystw Budownictwa Społecznego (TBS) i Społecznych Inicjatyw Mieszkaniowych (SIM). Poprawimy warunki finansowania i kredytowania inwestycji w systemie TBS/ SIM – samorządy decydujące się na budowę mieszkań społecznych będą mogły pozyskać granty i kredyty z nowo utworzonego Funduszu Budownictwa Społecznego, dzięki którym sfinansują 100% kosztów budowy bez konieczności angażowania środków własnych. Lokatorki i lokatorzy TBS-ów/SIM-ów nie będą już musieli płacić tzw. wkładu partycypacyjnego. Zwiększymy dofinansowanie dla TBS-ów i SIM-ów modernizujących obiekty zabytkowe."),
    ("mixed-income-housing-segmentation", "Mieszkania na każdą kieszeń. Na osiedlach wybudowanych w ramach Krajowego Programu Mieszkaniowego mieszkać będą zarówno rodziny o najniższych zarobkach jak i klasa średnia. Integrację społeczną – zamiast powstawania gett i elitarnych sąsiedztw – zapewni system segmentacji mieszkań na kilka kategorii czynszowych. To rozwiązanie sprawdziło się w wielu krajach Europy Zachodniej: czynsze będą regulowane i dostosowane do możliwości finansowych każdej rodziny."),
    ("vacant-property-acquisition", "Krajowy Fundusz Remontowy. W Polsce według GUS jest ok. 1,8 mln pustostanów. Powołamy Krajowy Fundusz Remontowy, obsługiwany przez BGK i zarządzany przez Państwową Agencję Mieszkaniową, który będzie przekazywał środki na generalne remonty do 20 tys. pustostanów z zasobu komunalnego rocznie. Wraz z Funduszem wprowadzimy przepisy usprawniające procedurę włączania mieszkań do zasobu komunalnego. Wprowadzimy przepisy ułatwiające wykup przez państwo pustostanów należących do funduszy inwestycyjnych i deweloperów."),
    ("housing-cooperatives-support", "Wsparcie dla spółdzielni i kooperatyw mieszkaniowych. Zwiększymy wsparcie dla spółdzielni mieszkaniowych, które chcą budować mieszkania na wynajem. Spółdzielnie decydujące się na realizację tego typu mieszkań będą mogły uzyskać finansowanie i preferencyjne kredyty z Funduszu Budownictwa Społecznego. Stworzymy system preferencyjnych kredytów o stałym oprocentowaniu dla rodzin, które chcą zaspokoić swoje potrzeby mieszkaniowe za pośrednictwem kooperatyw mieszkaniowych."),
    ("long-term-rental-support", "Regulacja wysokości czynszów i jakości najmu. Będziemy wspierać najem długoterminowy i zwiększać jego atrakcyjność względem ścieżek dochodzenia do własności nieruchomości, w sytuacji gdy maleje liczba osób posiadających zdolność kredytową. Poprzez, między innymi, odpowiedzialną politykę podatkową poprawimy opłacalność najmu długoterminowego względem najmu krótkoterminowego. Aby chronić interesy najemców, państwo przedstawi wzorcową umowę najmu i informacje o klauzulach niedozwolonych. Wprowadzimy górny limit wysokości kaucji na poziomie miesięcznego czynszu."),
    ("mortgage-borrowers-fixed-rate-relief", "Wsparcie kredytobiorców. Aby zmniejszyć ryzyko dla kredytobiorców, będziemy dążyć do zwiększenia udziału kredytów hipotecznych ze stałą stopą oprocentowania. Wprowadzimy przepisy o czasowym zamrożeniu oprocentowania kredytów hipotecznych zaciągniętych do końca 2021 roku, co ograniczy koszty związane z nieodpowiedzialną polityką informacyjną Prezesa NBP."),
    ("planned-livable-estates", "Dobrze zaplanowane osiedla. Jakość życia zależy od tego, czy na osiedlu jest dostęp do usług publicznych i zieleni. Będziemy wspierać powstawanie takich planów zagospodarowania przestrzennego, które uwzględnią potrzeby obecnych i przyszłych mieszkańców, oraz zaktualizujemy kodeks urbanistyczno-budowlany. Nowe budynki muszą być tanie w ogrzewaniu – być pasywne energetycznie i powstawać w oparciu o przyjazne dla środowiska materiały budowlane. Będziemy wspierać rozwój przyjaznych środowisku technologii budowlanych."),
    # Supplementary slugs (sub-points of composite postulates,
    # kept to preserve existing DB rows / reviewer verdicts)
    ("gender-procedure-simplify", "Strefa wolna od nienawiści. Ułatwimy prawną i medyczną procedurę uzgodnienia płci."),
    ("hate-crime-gender-orientation", "Strefa wolna od nienawiści. Rozszerzymy art. 119, 256 i 257 Kodeksu karnego o przestępstwa związane z nienawiścią na tle orientacji psychoseksualnej i tożsamości płciowej."),
    ("religious-orgs-revenue-registry", "Wprowadzimy wymóg ewidencjonowania przychodów kościołów i związków wyznaniowych."),
]


def prepare_lewica_promises_fixtures(out_root: Path) -> int:
    if len(LEWICA_PROGRAMME) < 155:
        raise ValueError(
            f"LEWICA_PROGRAMME has {len(LEWICA_PROGRAMME)} entries, expected >= 155"
        )
    n = _write_promise_corpus(
        out_root=out_root,
        party_code="L",
        source_url="https://lewica.org.pl/program/program-wyborczy-kw-nowa-lewica",
        source_year=2023,
        reviewer_tag="seed-lewica-program",
        confidence=0.85,
        items=LEWICA_PROGRAMME,
    )
    logger.info("wrote {} Lewica promise fixtures", n)
    return n


# ---------- promises: PiS "Bezpieczna Przyszlosc Polakow" + 8 konkretow ----------

# Source: pis.org.pl + press coverage. Eight headline "konkrety" from the
# September 2023 convention + the 500-plus → 800-plus uplift announced
# concurrently. Full 300-page manifesto adds many more but is out of scope:
# the matcher works on numbered campaign commitments, not multi-page rhetoric.
# Refetched 2026-05-14: diacritic-restored from press transcripts of the
# convention (the pis.org.pl page itself is navigation chrome -- the konkrety
# live in a downloadable PDF programme document).
PIS_PROGRAMME: list[tuple[str, str]] = [
    ("seniority-pension-38-43-years", "Wprowadzenie emerytur stażowych dla kobiet po przepracowaniu 38 lat i dla mężczyzn po przepracowaniu 43 lat."),
    ("500-plus-to-800-plus", "Podwyższenie świadczenia wychowawczego 500 plus do 800 złotych miesięcznie na każde dziecko, od 1 stycznia 2024."),
    ("free-meds-65-plus-and-under-18", "Darmowe leki dla seniorów, którzy ukończyli 65 lat, oraz dla dzieci i młodzieży do 18. roku życia."),
    ("free-highways-public-private", "Darmowe autostrady, zarówno publiczne jak i prywatne."),
    ("local-shelf-2-3-domestic-share", "Wprowadzenie obowiązku dla marketów, aby w swojej ofercie miały minimum 2/3 owoców, warzyw, produktów mlecznych i mięsnych oraz pieczywa pochodzących od lokalnych dostawców."),
    ("good-meal-hospital-quality", "Poprawa jakości posiłków w szpitalach (program „Dobry posiłek”)."),
    ("school-trip-voucher-poznaj-polske", "Dofinansowanie do jednodniowych i dwudniowych wycieczek szkolnych dla każdego ucznia (Bon szkolny „Poznaj Polskę”)."),
    ("friendly-estate-block-revitalization", "Rewitalizacja i modernizacja osiedli mieszkaniowych składających się z bloków z tzw. wielkiej płyty, między innymi dobudowa wind do budynków i budowa parkingów („Przyjazne osiedle”)."),
]


def prepare_pis_promises_fixtures(out_root: Path) -> int:
    n = _write_promise_corpus(
        out_root=out_root,
        party_code="PiS",
        source_url="https://pis.org.pl/aktualnosci/bezpieczna-przyszlosc-polakow-program-pis",
        source_year=2023,
        reviewer_tag="seed-pis-8konkretow",
        confidence=0.90,
        items=PIS_PROGRAMME,
    )
    logger.info("wrote {} PiS promise fixtures", n)
    return n


# ---------- promises: Konfederacja "Konstytucja wolnosci" ----------

# Source: klubjagiellonski.pl/2023/10/12/pigulka-programowa-konfederacja
# 35 specific postulates from the June 2023 "Konstytucja wolności" package.
# Refetched 2026-05-14: diacritic-restored from the KJ summary article.
KONFEDERACJA_PROGRAMME: list[tuple[str, str]] = [
    ("tax-free-12x-min-wage", "Kwotę wolną od podatku w wysokości dwunastokrotności minimalnego wynagrodzenia."),
    ("flat-pit-12-percent", "Ustalenie jednolitej stawki PIT na poziomie 12 procent."),
    ("youth-relief-self-employed", "Rozszerzenie ulgi dla młodych o osoby przed 26. r.ż. prowadzące działalność gospodarczą."),
    ("belka-tax-deposits-bonds-exempt", "Zwolnienie z podatku Belki lokat i obligacji."),
    ("mortgage-interest-deduction", "Ulgę kredytową polegającą na odliczeniu odsetek z kredytu mieszkaniowego od podstawy opodatkowania."),
    ("eliminate-15-minor-taxes", "Likwidacja 15 mniejszych podatków, opłat i danin."),
    ("voluntary-zus-entrepreneurs", "Stopniowe wprowadzenie dobrowolnego ZUS dla przedsiębiorców."),
    ("oppose-eu-restrictions", "Sprzeciw wobec obostrzeń sanitarnych, podwyżek dla polityków i innych unijnych obciążeń."),
    ("pm-legal-think-tank", "Utworzenie prawniczego think tanku działającego przy Prezesie Rady Ministrów."),
    ("eu-commissioner-oversight", "Nadzór nad komisarzem unijnym jako systemem wczesnego ostrzegania."),
    ("education-debureaucratization", "Ograniczyć rolę państwa w edukacji, sprowadzając ją do roli organu kontrolującego."),
    ("education-voucher-follow-student", "Bon opiekuńczo-edukacyjny dla szkół publicznych, prywatnych i nauczania domowego – subwencja podąża za uczniem."),
    ("ukraine-food-import-ban", "Zatrzymanie importu artykułów rolnych i spożywczych z Ukrainy."),
    ("agriculture-deregulation", "Odbiurokratyzowanie rolnictwa."),
    ("biofuel-own-use-freedom", "Uwolnienie produkcji energii i stosowania biopaliw na własny użytek."),
    ("foreign-land-purchase-controls", "Przeciwdziałanie wykupywaniu ziemi przez międzynarodowe koncerny."),
    ("ban-anti-livestock-orgs-on-farms", "Zakazanie organizacjom antyhodowlanym wejścia na teren gospodarstw."),
    ("farmer-self-pest-control", "Prawo rolnika do samodzielnego odłowu zwierząt niszczących uprawy rolne."),
    ("agricultural-export-diplomacy", "Zdywersyfikowanie eksportu i rozwinięcie dyplomacji handlowej."),
    ("gun-access-liberalization", "Liberalizacja przepisów dotyczących dostępu do broni palnej."),
    ("local-weapons-permits", "Przekazanie kompetencji udzielania zezwoleń na broń na poziom samorządowy."),
    ("state-funded-shooting-survival", "Strzelnice, zawody strzeleckie, kursy survivalowe finansowane przez państwo."),
    ("territorial-defense-expansion-konf", "Znaczne rozwinięcie koncepcji Wojsk Obrony Terytorialnej."),
    ("army-paper-strength-verification", "Większe weryfikowanie stanu wojska na papierze."),
    ("air-defense-priority", "Nadanie priorytetu obronie przeciwlotniczej."),
    ("border-permanent-infrastructure", "Rozbudowa trwałej infrastruktury ochrony granicznej."),
    ("immigration-restrictions", "Likwidacja praw socjalnych dla imigrantów, ustalenie limitu pozwoleń na wjazd."),
    ("coal-high-output-continued", "Utrzymywanie odpowiednio wysokiego wydobycia węgla."),
    ("coal-gasification-innovation", "Rozwijanie innowacji w zakresie zgazowania węgla."),
    ("eu-climate-package-rejection", "Zakwestionowanie Pakietu Klimatyczno-Energetycznego UE."),
    ("nuclear-tech-transfer-staffing", "Transfer technologii i kadr dla niezależności jądrowej Polski."),
    ("housing-supply-not-demand", "Przestawienie logiki popytu na logikę podaży w mieszkalnictwie."),
    ("building-investment-debureaucratization", "Odbiurokratyzowanie procesów inwestycyjnych w budownictwie."),
    ("energy-standards-liberalization", "Liberalizacja przepisów o charakterystyce energetycznej budynków."),
    ("nfz-demonopolization-private-insurers", "Demonopolizacja Narodowego Funduszu Zdrowia poprzez konkurujących ubezpieczycieli."),
]


def prepare_konfederacja_promises_fixtures(out_root: Path) -> int:
    n = _write_promise_corpus(
        out_root=out_root,
        party_code="Konf",
        source_url="https://klubjagiellonski.pl/2023/10/12/pigulka-programowa-konfederacja/",
        source_year=2023,
        reviewer_tag="seed-konstytucja-wolnosci",
        confidence=0.85,
        items=KONFEDERACJA_PROGRAMME,
    )
    logger.info("wrote {} Konfederacja promise fixtures", n)
    return n


def prepare_all_promises_fixtures(out_root: Path) -> dict[str, int]:
    """Run all currently-seeded promise corpora. Add more by writing more
    prepare_*_promises_fixtures helpers and dispatching from here."""
    return {
        "KO": prepare_ko_promises_fixtures(out_root),
        "P2050": prepare_p2050_promises_fixtures(out_root),
        "L": prepare_lewica_promises_fixtures(out_root),
        "PiS": prepare_pis_promises_fixtures(out_root),
        "Konf": prepare_konfederacja_promises_fixtures(out_root),
    }


# ---------- postcodes ----------


def prepare_postcodes_from_csv(
    csv_path: Path, out_root: Path, term: int = 10
) -> int:
    """Convert a postcode CSV to per-row JSON fixtures.

    CSV columns (header required):
        postcode, district_num, commune_teryt

    The Polish postal system has ~24k postcodes, so this writes ~24k JSON
    files. Caller supplies the CSV; we don't bake postcode data into the
    repo. Public sources: PKW gmina-per-district lists composed with GUS
    TERYT postcode->gmina lookups.
    """
    import csv

    dest_dir = out_root / "external" / "postcodes"
    n = 0
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {"postcode", "district_num"}
        if not required.issubset(reader.fieldnames or set()):
            raise ValueError(
                f"CSV must have columns {required}; got {reader.fieldnames}"
            )
        for row in reader:
            postcode = row["postcode"].strip()
            district_num = int(row["district_num"])
            payload = {
                "term": term,
                "postcode": postcode,
                "district_num": district_num,
                "commune_teryt": (row.get("commune_teryt") or "").strip() or None,
            }
            write_json(
                dest_dir / f"{postcode}__{district_num}.json", payload
            )
            n += 1
    logger.info("wrote {} postcode fixtures from {}", n, csv_path)
    return n
