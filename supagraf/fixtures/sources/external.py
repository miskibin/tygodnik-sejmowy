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
KO_100_KONKRETOW: list[tuple[str, str]] = [
    ("ivf-state-funding", "Na stale wprowadzimy finansowanie in vitro z budzetu panstwa. Na finansowanie procedury in vitro przeznaczymy nie mniej niz 500 mln zl."),
    ("medical-appointment-system", "Wprowadzimy latwy w obsludze i czytelny system rezerwacji wizyt (sms-y, maile) na ksztalt funkcjonujacego w systemie prywatnym."),
    ("dental-care-children-voucher", "Wprowadzimy bon na profilaktyke i leczenie stomatologiczne dla dzieci i mlodziezy do wykorzystania w kazdym gabinecie stomatologicznym. Przywrocimy opieke dentystyczna w szkolach podstawowych."),
    ("income-tax-relief-and-allowance", "Obnizymy podatki. Osoby zarabiajace do 6000 zl brutto i pobierajace emeryture do 5000 zl brutto nie beda placily podatku dochodowego. Podniesiemy kwote wolna od podatku z 30 tys. zl do 60 tys. zl."),
    ("cash-pit-for-entrepreneurs", "Przedsiebiorcy zaplaca podatek dochodowy dopiero po otrzymaniu srodkow z tytulu zaplaconej faktury (kasowy PIT)."),
    ("teacher-salary-increase-30pct", "Podniesiemy wynagrodzenia nauczycieli o co najmniej 30 procent. Nie mniej niz 1500 zl brutto podwyzki dla nauczyciela."),
    ("second-pension-indexation", "Wprowadzimy druga waloryzacje emerytur i rent, gdy inflacja bedzie przekraczala 5 procent."),
    ("disability-pension-work-trap", "Zlikwidujemy tzw. pulapke rentowa: osoby z niepelnosprawnoscia beda mogly pracowac nie tracac renty."),
    ("abortion-12-weeks-legal", "Aborcja do 12. tygodnia ciazy bedzie legalna, bezpieczna i dostepna. Zaden szpital dzialajacy w ramach z NFZ nie bedzie mogl zaslonic sie klauzula sumienia."),
    ("free-childbirth-anesthesia", "Zapewnimy prawo do bezplatnego znieczulenia przy porodzie."),
    ("free-prenatal-testing", "Zapewnimy pelny dostep do darmowych badan prenatalnych."),
    ("emergency-contraception-otc", "Zapewnimy dostep do antykoncepcji awaryjnej bez recepty."),
    ("active-mom-1500-zl", "Wspieramy kobiety wracajace na rynek pracy po urodzeniu dziecka: w ramach programu Aktywna mama wyplacimy 1500 zl miesiecznie."),
    ("forest-protection-no-logging", "Wylaczymy najcenniejsze przyrodniczo obszary lasow z wycinki i przeznaczymy je tylko na funkcje przyrodnicze i spoleczne."),
    ("raw-wood-export-curb", "Zatrzymamy niekontrolowany wywoz nieprzetworzonego drewna z Polski."),
    ("church-fund-elimination", "Zlikwidujemy Fundusz Koscielny."),
    ("religion-grades-off-certificates", "Ocena z religii zostanie wykreslona ze swiadectw szkolnych."),
    ("religion-classes-first-or-last", "Religia w szkolach tylko na pierwszej lub ostatniej lekcji."),
    ("funeral-benefit-150pct-min-wage", "Podniesiemy zasilek pogrzebowy do 150 procent placy minimalnej -- czyli od lipca 2024 bedzie to 6450 zl."),
    ("polish-food-50pct-shelf-share", "Co najmniej polowa strategicznych produktow zywnosciowych w sklepach musi pochodzic z Polski. Wprowadzimy obowiazek oznaczania flaga kraju pochodzenia."),
    ("sunday-trade-ban-repeal", "Zniesiemy zakaz handlu w niedziele, ale kazdy pracownik bedzie mial zapewnione dwa wolne weekendy w miesiacu i podwojne wynagrodzenie."),
    ("constitutional-tribunal-of-state", "Lamanie Konstytucji i praworzadnosci bedzie szybko rozliczone i osadzone. W tym celu postawimy przed Trybunalem Stanu kluczowych urzednikow, w tym Andrzeja Dude."),
    ("criminal-prosecution-pis-officials", "Zlozymy wnioski do niezaleznej, odpolityczniowej prokuratury o pociagniecie do odpowiedzialnosci karnej urzednikow PiS, w tym Jaroslawa Kaczynskiego."),
    ("court-independence-cjeu-rulings", "Uwolnimy sady od politycznych wplywow. Wykonamy orzeczenia Trybunalu Sprawiedliwosci Unii Europejskiej."),
    ("krs-reform-restore-constitutional", "Zlikwidujemy neoKRS i utworzymy Krajowa Rade Sadownictwa w skladzie zgodnym z Konstytucja."),
    ("split-justice-minister-prosecutor", "Rozdzielimy funkcje ministra sprawiedliwosci i prokuratora generalnego. Prokurator nie moze byc politykiem."),
    ("police-chief-accountability", "Rozliczymy Komendanta Glownego Policji za dzialania lamiace porzadek prawny."),
    ("police-units-leadership-review", "Rozliczymy kierownictwa jednostek policji, w ktorych dochodzilo do nagminnego naduzywania wladzy."),
    ("border-defense-eu-funds", "Zapewnimy finansowanie z UE na obrone polskiej granicy z Bialorusia. Zlikwidujemy szlak przemytnikow."),
    ("nfz-hospital-treatment-no-limits", "Zniesiemy limity NFZ w lecznictwie szpitalnym, dzieki czemu znaczaco skroci sie czas oczekiwania."),
    ("county-health-centers", "Na obszarach pozbawionych odpowiedniej diagnostyki stworzymy Powiatowe Centra Zdrowia."),
    ("geriatric-care-eu-funds", "Dzieki odblokowanym srodkom unijnym zwiekszymy dostepnosc lekarzy geriatrow oraz opieki dlugoterminowej."),
    ("entrepreneur-sabbatical-zus-free", "Wprowadzimy Urlop dla przedsiebiorcow: jeden miesiac wolny od skladek na ubezpieczenia spoleczne."),
    ("flat-rate-health-contribution", "Wrocimy do ryczaltowego systemu rozliczania skladki zdrowotnej. Skonczymy z absurdem skladki zdrowotnej od sprzedazy."),
    ("micro-business-sick-leave-zus", "Pomozemy mikro przedsiebiorcom obnizyc koszty dzialalnosci: zasilek chorobowy bedzie placil ZUS."),
    ("micro-business-inspection-cap", "Ograniczymy czas kontroli mikro przedsiebiorcow do 6 dni w skali roku."),
    ("belka-tax-savings-exemption", "Zaproponujemy zniesienie podatku od zyskow kapitalowych (podatek Belki) dla oszczednosci."),
    ("beauty-sector-vat-8pct", "Obnizymy VAT dla sektora beauty do 8 procent."),
    ("caregiver-voucher-50pct-min-wage", "Odciazymy pracujacych opiekunow osob niesamodzielnych. Wprowadzimy Bon Opiekunczy w wysokosci 50 procent minimalnego wynagrodzenia."),
    ("personal-assistance-services", "Stworzymy system uslug asystenckich dla osob niesamodzielnych, w ramach ktorego profesjonalni, certyfikowani opiekunowie beda wspierali osoby."),
    ("social-pension-min-wage-level", "Zlozymy gotowy projekt ustawy o podwyzszeniu renty socjalnej do wysokosci minimalnego wynagrodzenia."),
    ("school-depoliticization-hit-out", "Odpolitycznimy szkoly. Natychmiast wycofamy przedmiot HiT. Wprowadzimy praktyczne, a nie ideologiczne podstawy programowe."),
    ("school-lockers-and-ebooks", "Uwolnimy nasze dzieci od ciezkich plecakow -- w kazdej szkole postawimy indywidualne szafki dla dzieci, kazdy podrecznik bedzie mial wersje elektroniczna."),
    ("single-shift-school-system-2025", "W ciagu pierwszych 100 dni rozpoczniemy proces przechodzenia polskiej edukacji na system jednozmianowy. Od 1 wrzesnia 2025 wszystkie szkoly."),
    ("primary-school-no-homework", "Zlikwidujemy prace domowe w szkolach podstawowych. Wprowadzimy szeroka oferte bezplatnych zajec pozalekcyjnych."),
    ("civil-partnerships-bill", "Wprowadzimy ustawe o zwiazkach partnerskich."),
    ("alimony-fund-1000-zl", "Podniesiemy kwote swiadczenia z Funduszu Alimentacyjnego z 500 zl do 1000 zl."),
    ("anti-violence-policy", "Natychmiast przystapimy do realizacji polityki antyprzemocowej."),
    ("childrens-helpline-116111", "Przywrocimy finansowanie Telefonu Zaufania dla Dzieci i Mlodziezy 116 111."),
    ("childrens-rights-ombudsman", "Odwolamy Mikolaja Pawlaka z funkcji Rzecznika Praw Dziecka i powolamy osobe dla ktorej dobro dzieci bedzie priorytetem."),
    ("forest-management-public-oversight", "Zapewnimy spoleczny nadzor nad lasami i mozliwosc zaskarzania planow urzadzenia lasu do sadu."),
    ("forest-economy-pis-accountability", "Rozliczymy partyjnych namiestnikow PiS za prowadzona przez ostatnie 8 lat rabunkowa gospodarke lesna."),
    ("river-monitoring-clean-odra", "Obejmiemy rzeki stalym monitoringiem w automatycznych stacjach pomiaru czystosci. Wdrozymy program rewitalizacji rzeki Czysta Odra."),
    ("ban-public-funds-religious-business", "Wprowadzimy zakaz finansowania z pieniedzy publicznych dzialalnosci gospodarczej diecezji, parafii, zakonow."),
    ("cemetery-fees-municipal-regulation", "Wysokosc oplat za korzystanie z cmentarzy wyznaniowych zostanie uregulowana przez samorzady."),
    ("peatlands-restoration-program", "Stworzymy program odtwarzania torfowisk i mokradel uwzgledniajacy interesy polskich rolnikow."),
    ("urban-tree-protection", "Skonczymy z wycinka drzew w miastach i zapewnimy ochrone bioroznorodnosci na terenach miejskich."),
    ("modern-marketplaces-program", "Uruchomimy program budowy nowoczesnych targowisk w kazdym miescie."),
    ("gdansk-grain-port-terminal", "Przedstawimy projekt zwiekszenia przestrzeni magazynowej i budowy nowego terminala (portu zbozowego) w Gdansku."),
    ("pig-farming-bioassurance-cover", "Odbudujemy polska tradycje hodowli swin -- budzet pokryje calosc kosztow bioasekuracji."),
    ("farmer-stabilization-fund", "Wprowadzimy dla rolnikow fundusz stabilizacyjny, pokrywajacy straty spowodowane oszustwami posrednikow."),
    ("farm-cost-biogas-pv-support", "Obnizymy koszty prowadzenia gospodarstw: zapewniajac wsparcie dla inwestycji w biogazownie, farmy fotowoltaiczne."),
    ("clean-water-for-agriculture", "Zapewnimy czysta i tania wode do produkcji rolnej -- postawimy na budowe lokalnych systemow zatrzymujacych wode."),
    ("obajtek-accountability-orlen", "Rozliczymy wszystkie afery Daniela Obajtka, w tym sprzedaz udzialow w Rafinerii Gdanskiej."),
    ("illegal-surveillance-disclosure", "Ujawnimy listy osob nielegalnie podsluchujacych i wydajacych nielegalne decyzje o podsluchiwaniu obywateli."),
    ("recover-public-funds-from-criminals", "Odzyskamy publiczne srodki od przestepcow, ktorzy dopuscili sie kradziezy lub marnotrawstwa pieniedzy podatnikow."),
    ("msz-corruption-charges-migration", "Przedstawimy akt oskarzenia wobec funkcjonariuszy MSZ odpowiedzialnych za korupcje, ktora doprowadzila do niekontrolowanego naplywu migrantow."),
    ("state-companies-leadership-overhaul", "W spolkach z udzialem Skarbu Panstwa zwolnimy wszystkich czlonkow rad nadzorczych i zarzadow. Przeprowadzimy nowy nabor w transparentnych konkursach."),
    ("public-finance-white-paper", "Przywrocimy przejrzystosc finansow publicznych. Przedstawimy biala ksiege stanu finansow publicznych na koniec 2023 r."),
    ("abolish-pis-agencies", "Zlikwidujemy Narodowy Instytut Wolnosci, Fundusz Patriotyczny, Instytut De Republica i 14 innych powolanych przez PiS agencji."),
    ("military-reinstate-2015-dismissed", "Wszyscy zolnierze niesluszne zwolnieni po 2015 r. otrzymaja mozliwosc powrotu do sluzby."),
    ("military-procurement-audit", "Przeprowadzimy kontrole procedur dotyczacych awansow i zakupow w polskim wojsku od 2015 roku."),
    ("army-modernization-100-days-patriot", "W ciagu 100 dni przedstawimy program modernizacji polskiej armii. Pozyskamy kolejnych 6 baterii Patriot."),
    ("polish-uniform-protection-decree", "Wydamy rozporzadzenie o ochronie polskiego munduru. Wojsko ma sluzyc Polsce a nie politykom."),
    ("european-sky-shield-join", "Pilnie przystapimy do sojuszniczego programu obrony przeciwrakietowej tzw. Kopuly Europejskiej (European Sky Shield)."),
    ("internal-security-wiretap-audit", "Przeprowadzimy audyt i kontrole dzialan operacyjnych w zakresie wykorzystania podsluchow oraz dzialan Biura Spraw Wewnetrznych."),
    ("uniformed-pensioner-rights-restored", "Przywrocimy emerytom mundurowym prawa nabyte -- uprawnienia emerytalne odebrane im z naruszeniem norm prawa."),
    ("eu-funds-unblock-decision-making", "Uzyskamy pieniadze z funduszy unijnych i wrocimy do grupy decyzyjnej w instytucjach UE."),
    ("anti-inflation-bonds", "Wprowadzimy obligacje antyinflacyjne poprzez zmiane w ustawie o NBP (gotowy projekt ustawy)."),
    ("public-transport-zero-vat", "Wprowadzimy 0 procent VAT na transport publiczny, aby obnizyc ceny biletow dla Polakow."),
    ("cpk-verify-stop-expropriations", "Zweryfikujemy projekt Centralnego Portu Komunikacyjnego. Zatrzymamy bandyckie wywlaszczenia. Zablokujemy sprzedaz lotniska Okecie."),
    ("ministry-of-industry-silesia", "Powolamy Ministerstwo Przemyslu z siedziba na Slasku."),
    ("silesian-language-regional-status", "Jezyk slaski zostanie uznany za jezyk regionalny. Ponownie zlozymy ustawe, ktora nada jezykowi slaskiemu status jezyka regionalnego."),
    ("prosumer-billing-restore-favorable", "Przywrocimy korzystne zasady rozliczania produkowanej energii dla prosumentow -- nizsze rachunki za prad."),
    ("local-energy-communities-700", "Umozliwimy stworzenie 700 lokalnych wspolnot energetycznych generujacych wlasny, tanszy prad."),
    ("onshore-wind-500m-distance-rule", "Zlozymy projekt ustawy odblokowujacej mozliwosc rozwoju energetyki wiatrowej na ladzie (zmniejszenie odleglosci do 500 m)."),
    ("gas-price-freeze-2024", "Zamrozimy ceny gazu w 2024 r. dla gospodarstw domowych i odbiorcow wrazliwych na poziomie cen z 2023 r."),
    ("illegal-waste-import-ban", "Skonczymy z nielegalnym importem smieci do Polski. Bedziemy stanowczo egzekwowac prawo."),
    ("energy-transition-co2-75pct-2030", "Przedstawimy szczegolowy plan transformacji energetycznej, ktora umozliwi ograniczenie emisji CO2 o 75 procent do 2030 roku."),
    ("public-land-for-housing", "Aby mieszkan w Polsce powstawalo wiecej uwolnimy grunty spolek skarbu panstwa i Krajowego Zasobu Nieruchomosci."),
    ("zero-percent-mortgage-first-home", "Wprowadzimy kredyt z oprocentowaniem 0 procent na zakup pierwszego mieszkania."),
    ("youth-rent-subsidy-600-zl", "Wprowadzimy 600 zl doplaty na wynajem mieszkania dla mlodych."),
    ("vacant-housing-renovation-10b", "Przeznaczymy 10 mld zlotych na rewitalizacje i remonty pustostanow w zasobach polskich samorzadow."),
    ("nationalist-orgs-funding-stop", "Skonczymy z przekazywaniem srodkow organizacjom nacjonalistycznym. Wzmocnimy system ekspercki."),
    ("ngo-private-funds-tax-incentives", "Ulatwimy organizacjom pozarzadowym pozyskiwanie srodkow prywatnych tworzac system zachet podatkowych."),
    ("higher-education-autonomy-funding", "Wzmocnimy autonomie uczelni i zabezpieczymy apolitycznosc szkol wyzszych poprzez zwiekszenie finansowania nauki."),
    ("science-evaluation-journal-list", "Uzdrowimy mechanizmy ewaluacji nauki. Zweryfikujemy wykaz czasopism punktowanych."),
    ("artist-status-act", "Wprowadzimy ustawe o statusie artysty gwarantujaca artystom minimum zabezpieczenia socjalnego."),
    ("public-media-depoliticization", "Odpolitycznimy i uspolecznimy media publiczne. Zlikwidujemy Rade Mediow Narodowych."),
    ("culture-censorship-repeal", "Zniesiemy cenzure nalozona na polska kulture: cenzure ekonomiczna i personalna instytucji kultury."),
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
P2050_12_GWARANCJI: list[tuple[str, str]] = [
    ("simple-stable-tax-system", "Prosty i stabilny system podatkowy. Podatnik zaplaci jedna danine od dochodow z pracy zawierajaca wszystkie obecne podatki i skladki; CIT, VAT i PIT bez podwyzek przez cala kadencje."),
    ("voluntary-zus-microbusiness", "Damy oddech przedsiebiorcom. Dobrowolny ZUS dla mikrofirm zagrozonych niewyplacalnoscia. Wakacje od skladek ZUS oraz zasilek chorobowy od pierwszego dnia."),
    ("education-6pct-gdp", "Przeznaczymy 6 procent PKB na edukacje. Angielski codziennie od pierwszej klasy, zmiana podstawy programowej, psycholog i opieka medyczna w kazdej szkole."),
    ("specialist-doctor-60-days", "Koniec kolejek do lekarzy specjalistow. Wizyta u lekarza specjalisty w ciagu 60 dni, albo NFZ zwroci pieniadze za wizyte prywatna; 7 procent PKB na opieke zdrowotna."),
    ("family-pit-children-relief", "Rodzinny PIT. Wieksza rodzina -- nizsze podatki. Im wiecej dzieci, tym nizsze podatki dochodowe dla rodziny."),
    ("women-equal-pay-ivf-nurseries", "Kobiety, do przodu. Rowne wynagrodzenia dla kobiet i mezczyzn; przywrocenie dofinansowania in vitro; 100 tys. bezplatnych miejsc w zlobkach."),
    ("food-security-deposit-system", "Bezpieczenstwo zywnosciowe. Koniec z naplywem niekontrolowanej zywnosci z Ukrainy. System kaucyjny na importer towarow rolno-spozywczych; 600 tys. zl na modernizacje gospodarstw i 300 tys. zl dla mlodych rolnikow."),
    ("green-poland-cheap-clean-power", "Zielona Polska. Tani prad, czyste powietrze. Mozliwosc kupowania energii ze slonecznych paneli prywatnych; ograniczenie eksportu nieprzetworzonego drewna; calkowity zakaz wycinek w 20 procent najcenniejszych lasow."),
    ("personal-assistant-disability", "Asystent osobisty dla osob z niepelnosprawnosciami. Stale wsparcie wykwalifikowanych asystentow; liczba godzin powiazana z potrzebami; dostep bez wzgledu na miejsce zamieszkania."),
    ("housing-affordable-academik-1zl", "Mieszkanie w dobrej cenie. Akademik za zlotowke dla studentow spoza wielkich miast. Liberalizacja obrotu ziemia w miastach; program obnizenia kosztow akademikow."),
    ("state-as-fair-employer", "Panstwo jako uczciwy pracodawca. Podwyzki dla nauczycieli, pielegniarek i pracownikow publicznych niwelujace straty inflacyjne; plan stopniowego podwyzszania pensji."),
    ("modern-army-50pct-domestic", "Nowoczesna armia. 50 procent wydatkow na modernizacje wojska w polskich zakladach zbrojeniowych; profesjonalne zarzadzanie wojskiem niezalezne od partyjnych wplywow."),
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


# ---------- promises: Lewica programme (first 30 of 155) ----------

# Source: lewica.org.pl/program/program-wyborczy-kw-nowa-lewica.
# Full programme has 155 postulates; only the first 30 are seeded here. Add
# more by extending this list and re-running prepare_lewica_promises_fixtures.
LEWICA_PROGRAMME: list[tuple[str, str]] = [
    # Work / labour rights (1-14)
    ("decent-stable-employment", "Godne i stabilne zatrudnienie. Kazdy zasluguje na normalny urlop, ubezpieczenie zdrowotne i bezpieczenstwo."),
    ("equal-pay-no-workplace-violence", "Przeciw dyskryminacji placowej i przemocy w pracy. Rowne wynagrodzenia bez wzgledu na plec, prawo do informacji o lukach placowych."),
    ("sick-leave-100pct-pay", "Koniec z kara za chorowanie. Wynagrodzenie za czas niezdolnosci do pracy bedzie wynosic 100 procent placy."),
    ("strong-collective-bargaining", "Szeroki dialog spoleczny i silne zwiazki zawodowe. Zakladowe uklady zbiorowe, ochrona liderow zwiazkowych."),
    ("effective-labor-rights-pip", "Skuteczna ochrona praw pracowniczych. Zwiekszenie budzetu Panstwowej Inspekcji Pracy, uprawnienia do ustalania stosunku pracy."),
    ("public-sector-130pct-min-wage", "Sektor publiczny wyznacza wysokie standardy. Minimalne wynagrodzenie 130 procent placy minimalnej w sferze budzetowej."),
    ("workplace-democracy-20pct-board", "Demokracja w miejscu pracy. Wzmocnienie rad pracowniczych, 20 procent reprezentacji pracowniczej w radach nadzorczych."),
    ("min-wage-66pct-average", "Czas na wyzsze place. Minimalne wynagrodzenie osiagnie 66 procent przecietnego zarobku."),
    ("late-pay-automatic-interest", "Odsetki za opoznione wyplaty. Automatyczne naliczanie odsetek 0,5 procenta miesiecznych zarobkow dziennie za opoznienia."),
    ("unemployment-benefit-half-salary", "Szukanie pracy bez stresu. Zasilek dla bezrobotnych na poziomie polowy ostatniej pensji, okres do dwoch lat."),
    ("active-anti-unemployment-policy", "Aktywna walka z bezrobociem. Systemowe wsparcie inwestycji w powiatach z wysokim bezrobociem."),
    ("right-to-rest-shorter-week", "Prawo do odpoczynku. Zwiekszenie dni urlopu, stopniowe zmniejszanie tygodniowego wymiaru czasu pracy."),
    ("algorithmic-management-consultation", "Przyjazna regulacja pracy przyszlosci. Obowiazek konsultowania algorytmow zarzadzajacych praca z pracownikami."),
    ("artist-social-insurance", "Koniec z artystyczna bieda. System ubezpieczen dla osob zajmujacych sie dzialalnoscia artystyczna wzorem Francji."),
    ("science-funding-3pct-gdp", "Stabilne finansowanie nauki. Zwiekszenie nakladow do 3 procent PKB, przesuniecie z systemu grantowego."),
    ("doctoral-school-gender-parity", "Kobiety na katedry. Bedziemy dazyc do osiagniecia parytetu plci w szkolach doktorskich."),
    ("student-stipend-1000-zl", "Stypendium 1000 zl dla studenta. Osoby do 26 roku zycia zostana objete powszechnym programem stypendialnym."),
    ("decent-work-academia", "Godna praca na uczelni. Skokowy wzrost wynagrodzen, szczegolnie dla adiunktow i asystentow."),
    ("critical-thinking-education", "Gotowi na jutro. Edukacja oparta na mysleniu krytycznym zamiast wkuwania."),
    ("school-de-czarnek-anti-indoctrination", "Deczarnkizacja. Szkola musi byc wolna od indoktrynacji."),
    ("school-anti-violence-ombudsman", "Szkola bezpieczna dla wszystkich. Krajowy Rzecznik Praw Uczniowskich, procedury antyprzemocy."),
    ("school-mental-health-free", "Wsparcie dobrostanu dzieci i mlodziezy. Bezplatny dostep do dlugofalowej opieki psychologicznej."),
    ("free-textbooks-equal-opportunity", "Szkola rownych szans. Bezplatne podreczniki dla wszystkich uczniow, wsparcie edukacyjne."),
    ("free-school-lunches", "Bezplatne obiady dla uczniow. Zagwarantujemy wszystkim uczniom szkol podstawowych bezplatny, cieply, pelnowartosciowy obiad."),
    ("vocational-education-update", "Ksztalcenie zawodowe przyszlosci. Aktualizacja podrecznikow i sprzetu, wynagrodzenie dla praktykantow."),
    ("secular-school-no-religion", "Swiecka szkola. Wyprowadzenie religii ze szkol."),
    ("free-public-transport-students", "Bezplatne przejazdy dla uczniow. Komunikacja lokalna i przejazdy w Polsce dla uczniow podczas ferii."),
    ("teacher-pay-20pct-first-year", "TAK dla realnego wzrostu wynagrodzen nauczycieli. Podwyzki co najmniej 20 procent w pierwszym roku kadencji."),
    ("energy-resilience-renewables-nuclear", "Odpornosc energetyczna Polski. Rozwoj OZE i energii jadrowej zamiast zaleznosci od rosyjskich surowcow."),
    ("renewable-majority-by-2035", "Zielone swiatlo dla odnawialnej energii. Wiekszosc energii z OZE do 2035 roku, elektrownie wiatrowe i sloneczne."),
    # Healthcare
    ("healthcare-8pct-gdp", "Fundamentem polityki zdrowotnej miałoby być zwiększenie wydatków na ten sektor do 8 procent PKB."),
    ("primary-care-multi-disciplinary", "Filarem reformy bedzie zwiekszenie roli placowek POZ poprzez dodanie do zespolow fizjoterapeute, dietetyka, psychologa i farmaceute."),
    ("nfz-mental-dental-coverage", "Rozszerzenie wsparcia psychologicznego, psychiatrycznego oraz oferty stomatologicznej dostepnej w ramach NFZ."),
    ("ivf-refund-teen-gynecology", "Refundacja in vitro i umozliwienie dziewczetom od 15. roku zycia wizyty u ginekologa bez koniecznosci wyrazania zgody przez rodzicow."),
    ("contraception-menstrual-poverty", "Poszerzenie dostepnosci antykoncepcji i zapobieganie tzw. ubostwu menstruacyjnemu."),
    ("free-meds-pregnant-transplant", "Poszerzenie oferty darmowych lekow dla kobiet w ciazy i osob po przeszczepach. Wszystkie leki na recepte mialyby kosztowac 5 zl."),
    # Secularism
    ("religion-out-of-schools-uchylenie-196", "Likwidacja lekcji religii w szkolach oraz uchylenie art. 196 kk o obrazie uczuc religijnych."),
    ("church-state-financial-separation", "Odejscie od wspierania zwiazkow wyznaniowych przez panstwo, poczawszy od likwidacji Funduszu Koscielnego."),
    ("religious-orgs-revenue-registry", "Wprowadzenie nakazu ewidencji przychodow zwiazkow wyznaniowych."),
    ("truth-and-reconciliation-commission", "Komisja Prawdy i Zadoscuczynienia, ktora mialaby posiadac uprawnienia prokuratorskie i mogla skazywac hierarchow oskarzonych o tuszowanie pedofilii."),
    # Women's rights
    ("abortion-on-demand-12-weeks-l", "Aborcja na zyczenie do 12. tygodnia ciazy."),
    ("conscience-clause-elimination", "Likwidacja klauzuli sumienia dla lekarzy i farmaceutow."),
    # LGBTQ+
    ("marriage-equality-civil-partnerships", "Wprowadzenie pelnej rownosci malzenskiej oraz zwiazkow partnerskich."),
    ("conversion-therapy-ban", "Zakaz terapii konwersyjnych."),
    ("hate-crime-gender-orientation", "Rozszerzenie art. 119, 256 i 257 kk o przestepstwa na tle nienawisci wobec osob o innej tozsamosci plciowej i orientacji psychoseksualnej."),
    # Housing
    ("housing-300k-by-2029", "Wybudowanie 300 tys. mieszkan do 2029 r., co mialoby kosztowac budzet panstwa 20 mld zl rocznie."),
    ("ministry-of-housing", "Planowanie i koordynacja programu mieszkaniowego mialyby podlegac nowemu Ministerstwu Mieszkalnictwa."),
    ("vacant-property-acquisition", "Panstwo mialoby zaangazowac swe srodki w wykupywanie i remont pustostanow."),
    ("long-term-rental-support", "Przygotowanie rozwiazan wspierajacych najemcow decydujacych sie na najem dlugoterminowy."),
    # Seniors / social
    ("widow-pension-better-formula", "Korzystniejszy sposob wyliczania renty wdowiej."),
    ("funeral-benefit-8000-zl", "Podniesienie do 8 tys. zl kwoty zasilku pogrzebowego."),
    ("senior-cultural-tourism-vouchers", "Utworzenie bonow dla seniorow -- turystycznego i kulturalnego (50 zl miesiecznie na kulture)."),
    ("senior-day-centers", "Panstwo mialoby utworzyc domy dziennego pobytu dla seniorow, ktore przeciwdzialalyby samotnosci."),
    # Family
    ("800-plus-indexation", "Zachowanie i coroczna waloryzacja istniejacych swiadczen, w tym 800+."),
    ("daycare-100k-new-spots", "Stworzenie dodatkowych 100 tys. miejsc w zlobkach."),
    # Disability
    ("respite-care-for-caregivers", "System ulatwien dla opiekunow, ktorym przyslugiwaloby m.in. prawo do opieki wytchnieniowej."),
    ("disability-housing-and-jobs", "Systemowe wsparcie dla osob niepelnosprawnych, skupiajace sie na oferowaniu im dachu nad glowa oraz pomocy w powrocie na rynek pracy."),
    # EU
    ("eu-vote-from-16", "Przyznanie prawa do glosowania osobom od 16. roku zycia w wyborach do Parlamentu Europejskiego."),
    ("euro-adoption-timeline", "Ogloszenie perspektywy czasowej przyjecia euro."),
    ("ep-strengthen-no-unanimity", "Zwiekszenie kompetencji Parlamentu Europejskiego i odejscia od zasady jednomyslnosci."),
    # Justice / police oversight
    ("post-factum-surveillance-notice", "Obywatele mieliby byc informowani post factum, ze byli obiektem czynnosci operacyjnych."),
    ("central-police-monitoring-bureau", "Przy Sejmie mialoby zostac utworzone Centralne Biuro Monitorowania Policji, ktore byloby wylaczone ze struktur policyjnych."),
    ("police-safety-feeling-metrics", "Ocena dzialalnosci policji mialaby byc oparta na wskazniku poczucia bezpieczenstwa spolecznosci, nie statystykach."),
    # Energy / environment (extending earlier)
    ("electrification-grid-modernization", "Gruntowna modernizacja polskiej sieci przesylowej i dystrybucyjnej, zeby ograniczyc straty energii."),
    ("thermomodernization-program", "Powszechne finansowanie programu termomodernizacji i wymiany zrodel ciepla w budynkach."),
    ("progressive-electricity-tariff", "System taryfy progresywnej dla energii elektrycznej z limitem cen dla gospodarstw domowych."),
    ("energy-cooperatives-legal-ease", "Ulatwienia prawne dla tworzenia i rozwijania spoldzielni energetycznych."),
    ("eu-energy-union", "Integracja polityki energetycznej UE z wspolnym pozyskiwaniem surowcow."),
    ("just-transition-coal-regions", "Program wsparcia dla regionow zaleznych od paliw kopalnych podczas transformacji."),
    ("recycling-deposit-60pct-2030", "System kaucyjny butelek zwrotnych oraz cel 60 procent recyklingu do 2030 roku."),
    ("national-parks-1-to-4-pct", "Zwiekszenie powierzchni parkow narodowych z 1 procent do 4 procent Polski oraz utworzenie osmiu nowych parkow."),
    ("forest-agency-6pct-protected", "Przeksztalcenie Lasow Panstwowych w agencje rzadowa oraz wylaczenie 6 procent powierzchni z wycinki."),
    ("nature-restoration-strategy", "Opracowanie i wdrozenie Krajowej Strategii Renaturyzacji."),
    ("water-retention-natural", "Naturalny system retencji wod zamiast betonowania koryt rzek."),
    ("water-quality-monitoring", "Zintegrowane systemy monitoringu ilosciowego i jakosciowego wod powierzchniowych."),
    ("anti-odor-act", "Nowe przepisy ograniczajace emisje zapachowe z zakladow przemyslowych."),
    ("concrete-crushing-fund-3b", "Utworzenie Funduszu Kruszenia Betonu na kwote 3 mld zlotych."),
    ("smog-100pct-stove-replacement", "Pokrywanie do 100 procent kosztow wymiany kotlow dla gospodarstw domowych z niskimi dochodami."),
    ("animal-rights-ombudsman", "Powolanie niezaleznej instytucji Rzecznika Praw Zwierzat."),
    ("seniors-vet-vouchers", "Bon weterynaryjny dla seniorow oraz refundacja kastracji i czipowania."),
    # Agriculture
    ("crop-price-state-reserve", "Skup plodow rolnych na potrzeby rezerw panstwowych."),
    ("supermarket-30-day-payment", "Maksymalnie 30-dniowy termin platnosci przez markety dla rolnikow i przetwórcow zywnosci."),
    ("eu-subsidy-equalization", "Polski rolnicy maja otrzymywac doplaty rowne zachodnim kolegom."),
    ("farmer-insurance-1b-zl", "Dodatkowy 1 miliard zlotych rocznie na ubezpieczenia rolnikow."),
    ("crop-damage-compensation", "Zwiekszenie kwot odszkodowan oraz odpowiedzialnosc Skarbu Panstwa za szkody ptakow."),
    ("asf-hpai-bioassurance-250m", "Zwiekszenie finansowania bioasekuracji do 250 mln zlotych rocznie."),
    ("ecological-farming-support", "Wsparcie dla rolnictwa ekologicznego i ochrony bioroznorodnosci."),
    ("farmer-cooperatives-support", "Wspieranie powstawania dobrowolnych spoldzielni rolnych."),
    # Economy / consumers
    ("anti-inflation-four-pillars", "Czteropillarowa strategia walki z inflacja poprzez inwestycje i dzialania oslonowe."),
    ("no-public-asset-firesale", "Sprzeciw rozprzedawaniu publicznej wlasnosci."),
    ("public-procurement-social-criteria", "Kryteria pracownicze i srodowiskowe w zamowieniach publicznych."),
    ("state-companies-competence-board", "Utworzenie Rady Kompetencyjnej, ktorej sklad wspolnie uksztaltuja partnerzy spoleczni."),
    ("parliament-public-spending-control", "Przywrocenie kontroli parlamentu nad wydatkami publicznymi."),
    ("kpo-milestones-implementation", "Realizacja kamieni milowych i aktualizacja programow KPO."),
    ("vat-down-progressive-pit-digital-tax", "Obnizka VAT, progresywna skala PIT, podatek od wielkich korporacji cyfrowych."),
    ("uokik-strengthen-funding", "Usprawnienie Urzedu Ochrony Konkurencji i Konsumentow przez dofinansowanie."),
    ("ban-predatory-loans", "Zakaz udzielania nieuczciwych pozyczek."),
    # Transport
    ("local-rail-bus-restoration", "Odtwarzanie lokalnych polaczen kolejowych i autobusowych."),
    ("transit-pass-59-zl", "Abonament 59 zl miesiecznie na komunikacje miejska, gminna i kolej regionalna."),
    ("integrated-ticketing-discounts", "Jednolity katalog ulg i zintegrowany system biletowy."),
    ("no-cpk-yes-fast-rail", "Rezygnacja z CPK, inwestycje w szybkie koleje dalekobiezne."),
    ("transport-electrification", "Rozwijanie elektromobilnosci w Polsce."),
    ("vision-zero-roads", "Wizja Zero -- eliminacja smiertelnych wypadkow na drogach."),
]


def prepare_lewica_promises_fixtures(out_root: Path) -> int:
    n = _write_promise_corpus(
        out_root=out_root,
        party_code="L",
        source_url="https://lewica.org.pl/program/program-wyborczy-kw-nowa-lewica",
        source_year=2023,
        reviewer_tag="seed-lewica-program",
        confidence=0.85,
        items=LEWICA_PROGRAMME,
    )
    logger.info("wrote {} Lewica promise fixtures (of 155 total)", n)
    return n


# ---------- promises: PiS "Bezpieczna Przyszlosc Polakow" + 8 konkretow ----------

# Source: pis.org.pl + wprost.pl coverage. Eight headline "konkrety" from
# September 2023 + the 800+ uplift announced concurrently. Full 300-page
# manifesto adds many more; extend this list to cover those.
PIS_PROGRAMME: list[tuple[str, str]] = [
    ("seniority-pension-38-43-years", "Wprowadzenie emerytur stazowych dla kobiet po przepracowaniu 38 lat i dla mezczyzn po przepracowaniu 43 lat."),
    ("500-plus-to-800-plus", "Podwyzszenie swiadczenia wychowawczego 500 plus do 800 zlotych miesiecznie na kazde dziecko, od 1 stycznia 2024."),
    ("free-meds-65-plus-and-under-18", "Darmowe leki dla seniorow, ktorzy ukonczyli 65 lat, oraz dla dzieci i mlodziezy do 18. roku zycia."),
    ("free-highways-public-private", "Darmowe autostrady, zarowno publiczne jak i prywatne."),
    ("local-shelf-2-3-domestic-share", "Wprowadzenie obowiazku dla marketow, aby w swojej ofercie mialy minimum 2/3 owocow, warzyw, produktow mlecznych i miesnych oraz pieczywa pochodzacych od lokalnych dostawcow."),
    ("good-meal-hospital-quality", "Poprawa jakosci posilkow w szpitalach (program Dobry posilek)."),
    ("school-trip-voucher-poznaj-polske", "Dofinansowanie do jednodniowych i dwudniowych wycieczek szkolnych dla kazdego ucznia (Bon szkolny Poznaj Polske)."),
    ("friendly-estate-block-revitalization", "Rewitalizacja i modernizacja osiedli mieszkaniowych skladajacych sie z blokow z tzw. wielkiej plyty, miedzy innymi dobudowa wind do budynkow i budowa parkingow (Przyjazne osiedle)."),
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
# 35 specific postulates from the June 2023 "Konstytucja wolnosci" package.
KONFEDERACJA_PROGRAMME: list[tuple[str, str]] = [
    ("tax-free-12x-min-wage", "Kwote wolna od podatku w wysokosci dwunastokrotnosci minimalnego wynagrodzenia."),
    ("flat-pit-12-percent", "Ustalenie jednolitej stawki PIT na poziomie 12 procent."),
    ("youth-relief-self-employed", "Rozszerzenie ulgi dla mlodych o osoby przed 26. r.z. prowadzace dzialalnosc gospodarcza."),
    ("belka-tax-deposits-bonds-exempt", "Zwolnienie z podatku Belki lokat i obligacji."),
    ("mortgage-interest-deduction", "Ulge kredytowa polegajaca na odliczeniu odsetek z kredytu mieszkaniowego od podstawy opodatkowania."),
    ("eliminate-15-minor-taxes", "Likwidacja 15 mniejszych podatkow, oplat i danin."),
    ("voluntary-zus-entrepreneurs", "Stopniowe wprowadzenie dobrowolnego ZUS dla przedsiebiorcow."),
    ("oppose-eu-restrictions", "Sprzeciw wobec obostrzen sanitarnych, podwyzek dla politykow i innych unijnych obciazen."),
    ("pm-legal-think-tank", "Utworzenie prawniczego think tanku dzialajacego przy Prezesie Rady Ministrow."),
    ("eu-commissioner-oversight", "Nadzor nad komisarzem unijnym jako systemem wczesnego ostrzegania."),
    ("education-debureaucratization", "Ograniczyc role panstwa w edukacji, sprowadzajac je do roli organu kontrolujacego."),
    ("education-voucher-follow-student", "Bon opiekunczo-edukacyjny dla szkol publicznych, prywatnych i nauczania domowego -- subwencja podaza za uczniem."),
    ("ukraine-food-import-ban", "Zatrzymanie importu artykulow rolnych i spozywczych z Ukrainy."),
    ("agriculture-deregulation", "Odbiurokratyzowanie rolnictwa."),
    ("biofuel-own-use-freedom", "Uwolnienie produkcji energii i stosowania biopaliw na wlasny uzytek."),
    ("foreign-land-purchase-controls", "Przeciwdzialanie wykupywaniu ziemi przez miedzynarodowe koncerny."),
    ("ban-anti-livestock-orgs-on-farms", "Zakazanie organizacjom antyhodowlanym wejscia na teren gospodarstw."),
    ("farmer-self-pest-control", "Prawo rolnika do samodzielnego odlowu zwierzat niszczacych uprawy rolne."),
    ("agricultural-export-diplomacy", "Zdywersyfikowanie eksportu i rozwiniecie dyplomacji handlowej."),
    ("gun-access-liberalization", "Liberalizacja przepisow dotyczacych dostepu do broni palnej."),
    ("local-weapons-permits", "Przekazanie kompetencji udzielania zezwolen na bron na poziom samorzadowy."),
    ("state-funded-shooting-survival", "Strzelnice, zawody strzeleckie, kursy survivalowe finansowane przez panstwo."),
    ("territorial-defense-expansion-konf", "Znaczne rozwiniecie koncepcji Wojsk Obrony Terytorialnej."),
    ("army-paper-strength-verification", "Wieksze weryfikowanie stanu wojska na papierze."),
    ("air-defense-priority", "Nadanie priorytetu obronie przeciwlotniczej."),
    ("border-permanent-infrastructure", "Rozbudowa trwalej infrastruktury ochrony granicznej."),
    ("immigration-restrictions", "Likwidacja praw socjalnych dla imigrantow, ustalenie limitu pozwolen na wjazd."),
    ("coal-high-output-continued", "Utrzymywanie odpowiednio wysokiego wydobycia wegla."),
    ("coal-gasification-innovation", "Rozwijanie innowacji w zakresie zgazowania wegla."),
    ("eu-climate-package-rejection", "Zakwestionowanie Pakietu Klimatyczno-Energetycznego UE."),
    ("nuclear-tech-transfer-staffing", "Transfer technologii i kadr dla niezaleznosci jadrowej Polski."),
    ("housing-supply-not-demand", "Przestawienie logiki popytu na logike podazy w mieszkalnictwie."),
    ("building-investment-debureaucratization", "Odbiurokratyzowanie procesow inwestycyjnych w budownictwie."),
    ("energy-standards-liberalization", "Liberalizacja przepisow o charakterystyce energetycznej budynkow."),
    ("nfz-demonopolization-private-insurers", "Demonopolizacja Narodowego Funduszu Zdrowia poprzez konkurujacych ubezpieczycieli."),
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
