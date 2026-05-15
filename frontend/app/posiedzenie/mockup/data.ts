// Mockup data for /posiedzenie/mockup. Mirrors the shape a real loader
// would produce by joining proceedings + proceeding_days + agenda_items +
// agenda_item_processes + agenda_item_prints + proceeding_statements
// (with utterance enrichment from migration 0061) + votings (with the
// "Pkt. N ..." title heuristic from migration 0092).
//
// No DB access — all values hardcoded so designer & user can iterate on
// layout without infra in the way.

import type { TopicId } from "@/lib/topics";

export type Club =
  | "KO"
  | "PiS"
  | "Lewica"
  | "PSL-TD"
  | "Konfederacja"
  | "Polska2050"
  | "Razem"
  | "niez.";

export type Tone =
  | "konfrontacyjny"
  | "techniczny"
  | "argumentowy"
  | "emocjonalny"
  | "apel"
  | "neutralny";

export type ViralQuote = {
  text: string;
  speaker: string;
  mpId?: number | null;
  photoUrl?: string | null;
  club: Club | null;
  function: string | null;
  tone: Tone;
  reason: string;
};

export type Vote = {
  time: string;
  votingNumber: number;
  result: "PRZYJĘTA" | "ODRZUCONA" | "WNIOSEK PRZYJĘTY" | "WNIOSEK ODRZUCONY";
  subtitle?: string | null;
  za: number;
  przeciw: number;
  wstrzym: number;
  nieob: number;
  margin: number;
  motionPolarity?: "pass" | "reject" | "amendment" | "minority" | "procedural" | null;
  byClub?: Partial<Record<Club, { za: number; pr: number; ws: number; nb: number }>>;
  plainNote?: string | null;
};

export type AgendaPoint = {
  ord: number;
  date: string;
  timeStart: string;
  timeEnd: string;
  durMin: number;
  title: string;
  shortTitle: string;
  plainSummary: string;
  stages: string[];
  prints: { term: number; number: string }[];
  procesy: { term: number; number: string }[];
  stats: { wypowiedzi: number; mowcy: number; glosowania: number };
  tones: Partial<Record<Tone, number>>;
  topics: TopicId[];
  importance: "flagship" | "normal";
  ongoing: boolean;
  planned: boolean;
  viralQuote: ViralQuote | null;
  vote: Vote | null;
};

export type Day = {
  idx: number;
  date: string;
  weekday: string;
  short: string;
  status: "done" | "live" | "planned";
  open: string | null;
  close: string | null;
  headline: string;
  stats: { punkty: number; wypowiedzi: number; glosowania: number };
};

export type TopQuote = {
  rank: number;
  text: string;
  speaker: string;
  mpId?: number | null;
  photoUrl?: string | null;
  club: Club;
  function: string;
  tone: Tone;
  reason: string;
  punktOrd: number;
  punktShort: string;
  punktTime: string;
};

export type TopSpeaker = {
  name: string;
  mpId?: number | null;
  photoUrl?: string | null;
  club: Club;
  function: string;
  minutes: number;
  wypowiedzi: number;
  dominantTone: Tone;
  bestQuote: string;
};

export type Starcie = {
  a: string;
  aClub: Club;
  b: string;
  bClub: Club;
  punktOrd: number;
  punktShort: string;
  exchanges: number;
  snippet: string;
};

export type Rebel = {
  name: string;
  mpId?: number | null;
  club: Club;
  expectedClub: Club;
  actual: "ZA" | "PR" | "WS";
  punktOrd: number;
  punktShort: string;
  note: string;
};

export type PlannedCard = {
  ord: number;
  title: string;
  subtitle: string;
  topic: TopicId | null;
  flag?: boolean;
};

export type ProceedingMock = {
  term: number;
  number: number;
  title: string;
  dates: string[];
  current: boolean;
  liveAt: string;
  totals: { punkty: number; wypowiedzi: number; glosowania: number; mowcy: number };
  days: Day[];
  punkty: AgendaPoint[];
  topQuotes: TopQuote[];
  topSpeakers: TopSpeaker[];
  starcia: Starcie[];
  renegaci: Rebel[];
  jutro: { date: string; weekday: string; headline: string; plannedPoints: PlannedCard[] };
};

// ─────────────────────────────────────────────────────────────────────────────
// Polish typographic quotes throughout: opening „ (U+201E) and closing " (U+201D).
// Plain ASCII " is reserved for string delimiters only.

export const MOCK: ProceedingMock = {
  term: 10,
  number: 19,
  title: "19. posiedzenie Sejmu Rzeczypospolitej Polskiej X kadencji",
  dates: ["2026-05-13", "2026-05-14", "2026-05-15"],
  current: true,
  liveAt: "16:42",
  totals: { punkty: 24, wypowiedzi: 612, glosowania: 47, mowcy: 218 },

  days: [
    {
      idx: 0,
      date: "2026-05-13",
      weekday: "środa",
      short: "13 maja",
      status: "done",
      open: "10:00",
      close: "21:48",
      headline:
        "Sejm przyjął w II czytaniu projekt podnoszący kwotę wolną do 60 tys. zł — rekordowo długa debata podatkowa zakończona poprawkami rządowymi.",
      stats: { punkty: 8, wypowiedzi: 224, glosowania: 18 },
    },
    {
      idx: 1,
      date: "2026-05-14",
      weekday: "czwartek",
      short: "14 maja",
      status: "live",
      open: "09:00",
      close: null,
      headline:
        "Trzecie czytanie PIT — ustawa przeszła stosunkiem 248–198. Wniosek o odwołanie Marszałka odrzucony.",
      stats: { punkty: 11, wypowiedzi: 296, glosowania: 23 },
    },
    {
      idx: 2,
      date: "2026-05-15",
      weekday: "piątek",
      short: "15 maja",
      status: "planned",
      open: "09:00",
      close: null,
      headline:
        "Zaplanowany blok głosowań końcowych — m.in. e-doręczenia (III czytanie) i pakiet onkologiczny.",
      stats: { punkty: 5, wypowiedzi: 92, glosowania: 6 },
    },
  ],

  punkty: [
    {
      ord: 1,
      date: "2026-05-14",
      timeStart: "09:02",
      timeEnd: "11:06",
      durMin: 124,
      title:
        "Sprawozdanie Komisji Finansów Publicznych o rządowym projekcie ustawy o zmianie ustawy o podatku dochodowym od osób fizycznych oraz niektórych innych ustaw",
      shortTitle: "Trzecie czytanie ustawy PIT — kwota wolna 60 tys. zł",
      plainSummary:
        "Końcowe głosowanie nad pakietem podnoszącym kwotę wolną do 60 tys. zł oraz wprowadzającym ulgę dla rodzin 2+. Pełny rozłam koalicja–opozycja; trzech posłów PiS zagłosowało wbrew klubowi.",
      stages: ["III czytanie", "Głosowanie"],
      prints: [
        { term: 10, number: "841" },
        { term: 10, number: "892" },
        { term: 10, number: "892-A" },
      ],
      procesy: [{ term: 10, number: "841" }],
      stats: { wypowiedzi: 41, mowcy: 28, glosowania: 12 },
      tones: { konfrontacyjny: 18, emocjonalny: 7, argumentowy: 9, techniczny: 5, neutralny: 2 },
      topics: ["biznes-podatki", "edukacja-rodzina"],
      importance: "flagship",
      ongoing: false,
      planned: false,
      viralQuote: {
        text: "Zwiększacie kwotę wolną o sześć złotych dziennie i nazywacie to ulgą dla rodzin. To nie ulga — to alibi.",
        speaker: "Krzysztof Bosak",
        club: "Konfederacja",
        function: "poseł",
        tone: "konfrontacyjny",
        reason:
          "Mocna metafora („sześć złotych dziennie”) sprowadza abstrakcyjną liczbę 60 tys. do codziennego doświadczenia. „Alibi” zamiast „ulga” odwraca framing przeciwnika.",
      },
      vote: {
        time: "10:54",
        votingNumber: 84,
        result: "PRZYJĘTA",
        za: 248,
        przeciw: 198,
        wstrzym: 12,
        nieob: 2,
        margin: 50,
        motionPolarity: "pass",
        byClub: {
          KO: { za: 142, pr: 0, ws: 1, nb: 0 },
          Lewica: { za: 26, pr: 0, ws: 0, nb: 0 },
          "PSL-TD": { za: 32, pr: 0, ws: 0, nb: 0 },
          Polska2050: { za: 32, pr: 0, ws: 0, nb: 0 },
          PiS: { za: 3, pr: 167, ws: 8, nb: 1 },
          Konfederacja: { za: 0, pr: 14, ws: 3, nb: 0 },
          Razem: { za: 8, pr: 0, ws: 0, nb: 0 },
          "niez.": { za: 5, pr: 17, ws: 0, nb: 1 },
        },
        plainNote:
          "Większością 50 głosów. Trzech posłów PiS (Suski, Mularczyk, Czartoryski) złamało dyscyplinę i zagłosowało ZA.",
      },
    },
    {
      ord: 2,
      date: "2026-05-14",
      timeStart: "11:15",
      timeEnd: "12:50",
      durMin: 95,
      title:
        "Sprawozdanie Komisji Regulaminowej, Spraw Poselskich i Immunitetowych w sprawie wniosku o odwołanie Marszałka Sejmu",
      shortTitle: "Wniosek o odwołanie Marszałka — odrzucony",
      plainSummary:
        "Wniosek klubu PiS o odwołanie Marszałka odrzucony: 162 ZA, 281 PRZECIW. Zarzut: jednostronne stosowanie regulaminu w sprawie immunitetów.",
      stages: ["Wniosek formalny", "Głosowanie"],
      prints: [{ term: 10, number: "918" }],
      procesy: [],
      stats: { wypowiedzi: 22, mowcy: 18, glosowania: 1 },
      tones: { konfrontacyjny: 14, emocjonalny: 5, neutralny: 3 },
      topics: ["sady-prawa"],
      importance: "flagship",
      ongoing: false,
      planned: false,
      viralQuote: {
        text: "Pan marszałek prowadzi obrady jak prezes spółki z o.o. — tylko z większościowym pakietem. Sejm to nie spółka.",
        speaker: "Mariusz Błaszczak",
        club: "PiS",
        function: "przewodniczący klubu",
        tone: "konfrontacyjny",
        reason:
          "Porównanie Marszałka do prezesa spółki to wprost zarzut o instrumentalizację. Krótka pointa, mocna typografia mentalna — idealna na cytat.",
      },
      vote: {
        time: "12:42",
        votingNumber: 85,
        result: "WNIOSEK ODRZUCONY",
        za: 162,
        przeciw: 281,
        wstrzym: 4,
        nieob: 13,
        margin: 119,
        motionPolarity: "procedural",
        byClub: {
          PiS: { za: 162, pr: 0, ws: 1, nb: 7 },
          Konfederacja: { za: 0, pr: 14, ws: 3, nb: 0 },
          KO: { za: 0, pr: 142, ws: 0, nb: 1 },
          Lewica: { za: 0, pr: 26, ws: 0, nb: 0 },
          "PSL-TD": { za: 0, pr: 32, ws: 0, nb: 0 },
          Polska2050: { za: 0, pr: 32, ws: 0, nb: 0 },
          Razem: { za: 0, pr: 8, ws: 0, nb: 0 },
          "niez.": { za: 0, pr: 27, ws: 0, nb: 0 },
        },
      },
    },
    {
      ord: 3,
      date: "2026-05-14",
      timeStart: "13:00",
      timeEnd: "14:00",
      durMin: 60,
      title: "Pytania w sprawach bieżących",
      shortTitle: "Pytania w sprawach bieżących",
      plainSummary:
        "15 pytań od opozycji i koalicji. Dominujące tematy: ceny energii (4 pytania), CPK (3), sytuacja w służbie zdrowia (3).",
      stages: ["Pytania w sprawach bieżących"],
      prints: [],
      procesy: [],
      stats: { wypowiedzi: 30, mowcy: 30, glosowania: 0 },
      tones: { argumentowy: 10, konfrontacyjny: 8, neutralny: 12 },
      topics: ["zdrowie", "transport"],
      importance: "normal",
      ongoing: false,
      planned: false,
      viralQuote: null,
      vote: null,
    },
    {
      ord: 4,
      date: "2026-05-14",
      timeStart: "14:30",
      timeEnd: "17:37",
      durMin: 187,
      title:
        "Sprawozdanie Komisji Zdrowia o poselskim projekcie ustawy o zmianie ustawy o świadczeniach opieki zdrowotnej finansowanych ze środków publicznych",
      shortTitle: "Bezpłatne leki dla seniorów 75+ — rozszerzenie listy",
      plainSummary:
        "Projekt rozszerza listę 75+ o 312 nowych pozycji. Przyjęto z poprawką Senatu obniżającą wiek do 70 lat dla osób z chorobami przewlekłymi.",
      stages: ["II czytanie", "Sprawozdanie komisji", "Głosowanie"],
      prints: [
        { term: 10, number: "763" },
        { term: 10, number: "871" },
      ],
      procesy: [{ term: 10, number: "763" }],
      stats: { wypowiedzi: 51, mowcy: 29, glosowania: 4 },
      tones: { argumentowy: 24, emocjonalny: 11, neutralny: 8, techniczny: 6, apel: 2 },
      topics: ["zdrowie", "emerytury"],
      importance: "flagship",
      ongoing: true,
      planned: false,
      viralQuote: {
        text: "Lek za złotówkę to nie jałmużna. To umowa pokoleniowa, którą państwo wreszcie zaczyna spłacać.",
        speaker: "Marek Sawicki",
        club: "PSL-TD",
        function: "poseł",
        tone: "argumentowy",
        reason:
          "Rzadkie cytowanie z PSL — partia nieprzyzwyczajona do mocnych pointów. Słowo „spłacać” przesuwa narrację z „dawania” na „oddawania należnego”.",
      },
      vote: {
        time: "16:30",
        votingNumber: 88,
        result: "PRZYJĘTA",
        za: 412,
        przeciw: 24,
        wstrzym: 18,
        nieob: 6,
        margin: 388,
        motionPolarity: "pass",
        plainNote:
          "Konsensus parlamentarny — wszystkie kluby ZA poza częścią Konfederacji.",
      },
    },
    {
      ord: 5,
      date: "2026-05-14",
      timeStart: "17:40",
      timeEnd: "18:30",
      durMin: 50,
      title:
        "Informacja Ministra Infrastruktury o stanie realizacji Centralnego Portu Komunikacyjnego",
      shortTitle: "Informacja MI o stanie CPK",
      plainSummary:
        "Aktualizacja harmonogramu: pierwsza fala wywłaszczeń przesunięta na II połowę 2027. Brak rozstrzygnięcia w sprawie finansowania linii dużych prędkości.",
      stages: ["Informacja"],
      prints: [],
      procesy: [],
      stats: { wypowiedzi: 28, mowcy: 22, glosowania: 0 },
      tones: { techniczny: 14, argumentowy: 8, konfrontacyjny: 4, neutralny: 2 },
      topics: ["transport", "biznes-podatki"],
      importance: "normal",
      ongoing: false,
      planned: false,
      viralQuote: {
        text: "Trzy lata mówicie „za chwilę”. W tym tempie pierwszego pociągu doczeka się moja wnuczka — i to tylko jeśli zostanie inżynierem.",
        speaker: "Anna Maria Siarkowska",
        club: "PiS",
        function: "posłanka",
        tone: "emocjonalny",
        reason:
          "Personalizacja zarzutu („moja wnuczka”) plus suchy żart polityczny — łatwo udostępniać.",
      },
      vote: null,
    },
    {
      ord: 6,
      date: "2026-05-14",
      timeStart: "18:35",
      timeEnd: "20:18",
      durMin: 103,
      title:
        "Sprawozdanie Komisji Infrastruktury oraz Komisji Samorządu Terytorialnego i Polityki Regionalnej o rządowym projekcie ustawy o zmianie ustawy — Prawo budowlane oraz niektórych innych ustaw",
      shortTitle: "Reforma planowania przestrzennego — etap II",
      plainSummary:
        "Cyfrowy rejestr planów, skrócenie procedur środowiskowych, ograniczenie zabudowy rozproszonej. Wniosek o odroczenie III czytania.",
      stages: ["II czytanie", "Sprawozdanie komisji"],
      prints: [
        { term: 10, number: "812" },
        { term: 10, number: "812-A" },
        { term: 10, number: "812-B" },
      ],
      procesy: [{ term: 10, number: "812" }],
      stats: { wypowiedzi: 38, mowcy: 24, glosowania: 0 },
      tones: { argumentowy: 16, techniczny: 11, konfrontacyjny: 7, neutralny: 4 },
      topics: ["mieszkanie-media", "srodowisko-klimat"],
      importance: "normal",
      ongoing: false,
      planned: false,
      viralQuote: {
        text: "Plan miejscowy to nie biurokracja. To umowa między mieszkańcami a deweloperem — i ona nie może już być pisana ołówkiem.",
        speaker: "Dorota Niedziela",
        club: "KO",
        function: "sprawozdawca",
        tone: "argumentowy",
        reason:
          "Eleganckie odwrócenie populizmu („biurokracja”) w stronę praw obywatelskich. „Pisana ołówkiem” — wizualna, pamięciowa metafora.",
      },
      vote: null,
    },
    {
      ord: 7,
      date: "2026-05-14",
      timeStart: "20:25",
      timeEnd: "21:18",
      durMin: 53,
      title:
        "Sprawozdanie Komisji Spraw Zagranicznych o stanowisku Sejmu wobec polityki UE",
      shortTitle: "Stanowisko Sejmu wobec polityki UE",
      plainSummary:
        "Stanowisko poparte przez koalicję — odrzucone poprawki PiS dot. mechanizmu warunkowości. Konfederacja: przeciw całemu stanowisku.",
      stages: ["II czytanie", "Głosowanie"],
      prints: [{ term: 10, number: "901" }],
      procesy: [{ term: 10, number: "901" }],
      stats: { wypowiedzi: 22, mowcy: 16, glosowania: 6 },
      tones: { konfrontacyjny: 9, argumentowy: 7, neutralny: 4, techniczny: 2 },
      topics: ["sady-prawa", "bezpieczenstwo-obrona"],
      importance: "normal",
      ongoing: false,
      planned: false,
      viralQuote: null,
      vote: {
        time: "21:10",
        votingNumber: 91,
        result: "PRZYJĘTA",
        za: 294,
        przeciw: 132,
        wstrzym: 28,
        nieob: 6,
        margin: 162,
        motionPolarity: "pass",
      },
    },
    {
      ord: 8,
      date: "2026-05-14",
      timeStart: "21:25",
      timeEnd: "21:48",
      durMin: 23,
      title: "Punkt porządku obrad — komunikaty Marszałka Sejmu",
      shortTitle: "Komunikaty Marszałka i zakończenie dnia",
      plainSummary:
        "Komunikaty proceduralne i ogłoszenie planu jutrzejszego dnia. 5 zaplanowanych głosowań końcowych.",
      stages: ["Informacja"],
      prints: [],
      procesy: [],
      stats: { wypowiedzi: 4, mowcy: 4, glosowania: 0 },
      tones: { neutralny: 4 },
      topics: [],
      importance: "normal",
      ongoing: false,
      planned: false,
      viralQuote: null,
      vote: null,
    },
    {
      ord: 9,
      date: "2026-05-15",
      timeStart: "09:00",
      timeEnd: "10:00",
      durMin: 60,
      title:
        "Trzecie czytanie rządowego projektu ustawy o e-doręczeniach administracyjnych — ciąg dalszy",
      shortTitle: "E-doręczenia administracyjne — III czytanie",
      plainSummary:
        "Cyfryzacja korespondencji urzędowej. Po negatywnej opinii Senatu rząd wprowadza autopoprawkę wydłużającą okres przejściowy do 18 mies.",
      stages: ["III czytanie", "Głosowanie"],
      prints: [{ term: 10, number: "856" }],
      procesy: [{ term: 10, number: "856" }],
      stats: { wypowiedzi: 0, mowcy: 0, glosowania: 0 },
      tones: {},
      topics: ["biznes-podatki"],
      importance: "normal",
      ongoing: false,
      planned: true,
      viralQuote: null,
      vote: null,
    },
    {
      ord: 10,
      date: "2026-05-15",
      timeStart: "10:15",
      timeEnd: "11:30",
      durMin: 75,
      title:
        "Informacja Ministra Zdrowia o realizacji programu wczesnego wykrywania nowotworów u dzieci",
      shortTitle: "Informacja MZ o programie onkologicznym dzieci",
      plainSummary:
        "Coroczny raport. Zwiększona kwota refundacji terapii CAR-T; rozszerzenie programu badań przesiewowych do 16 województw.",
      stages: ["Informacja"],
      prints: [],
      procesy: [],
      stats: { wypowiedzi: 0, mowcy: 0, glosowania: 0 },
      tones: {},
      topics: ["zdrowie", "edukacja-rodzina"],
      importance: "normal",
      ongoing: false,
      planned: true,
      viralQuote: null,
      vote: null,
    },
    {
      ord: 11,
      date: "2026-05-15",
      timeStart: "12:00",
      timeEnd: "13:30",
      durMin: 90,
      title: "Blok głosowań końcowych — punkty 4, 6, 9, 12",
      shortTitle: "Blok głosowań końcowych",
      plainSummary:
        "Zaplanowano łącznie 14 głosowań końcowych: pakiet onkologiczny, e-doręczenia, prawo budowlane, sprawa Marszałka — wszystkie do rozstrzygnięcia.",
      stages: ["Głosowanie"],
      prints: [],
      procesy: [],
      stats: { wypowiedzi: 0, mowcy: 0, glosowania: 0 },
      tones: {},
      topics: [],
      importance: "flagship",
      ongoing: false,
      planned: true,
      viralQuote: null,
      vote: null,
    },
  ],

  topQuotes: [
    {
      rank: 1,
      text: "Zwiększacie kwotę wolną o sześć złotych dziennie i nazywacie to ulgą dla rodzin. To nie ulga — to alibi.",
      speaker: "Krzysztof Bosak",
      club: "Konfederacja",
      function: "poseł",
      tone: "konfrontacyjny",
      reason:
        "Mocna metafora („sześć złotych dziennie”) sprowadza abstrakcyjną liczbę 60 tys. do codziennego doświadczenia. „Alibi” zamiast „ulga” odwraca framing przeciwnika.",
      punktOrd: 1,
      punktShort: "Trzecie czytanie ustawy PIT",
      punktTime: "10:48",
    },
    {
      rank: 2,
      text: "Pan marszałek prowadzi obrady jak prezes spółki z o.o. — tylko z większościowym pakietem. Sejm to nie spółka.",
      speaker: "Mariusz Błaszczak",
      club: "PiS",
      function: "przewodniczący klubu",
      tone: "konfrontacyjny",
      reason:
        "Porównanie Marszałka do prezesa spółki to wprost zarzut o instrumentalizację. Krótka pointa, mocna typografia mentalna — idealna na cytat.",
      punktOrd: 2,
      punktShort: "Wniosek o odwołanie Marszałka",
      punktTime: "11:42",
    },
    {
      rank: 3,
      text: "Lek za złotówkę to nie jałmużna. To umowa pokoleniowa, którą państwo wreszcie zaczyna spłacać.",
      speaker: "Marek Sawicki",
      club: "PSL-TD",
      function: "poseł",
      tone: "argumentowy",
      reason:
        "Rzadkie cytowanie z PSL — partia nieprzyzwyczajona do mocnych pointów. Słowo „spłacać” przesuwa narrację z „dawania” na „oddawania należnego”.",
      punktOrd: 4,
      punktShort: "Bezpłatne leki 75+",
      punktTime: "15:12",
    },
    {
      rank: 4,
      text: "Plan miejscowy to nie biurokracja. To umowa między mieszkańcami a deweloperem — i ona nie może już być pisana ołówkiem.",
      speaker: "Dorota Niedziela",
      club: "KO",
      function: "sprawozdawca",
      tone: "argumentowy",
      reason:
        "Eleganckie odwrócenie populizmu („biurokracja”) w stronę praw obywatelskich. „Pisana ołówkiem” — wizualna, pamięciowa metafora.",
      punktOrd: 6,
      punktShort: "Reforma planowania przestrzennego",
      punktTime: "19:23",
    },
    {
      rank: 5,
      text: "Trzy lata mówicie „za chwilę”. W tym tempie pierwszego pociągu doczeka się moja wnuczka — i to tylko jeśli zostanie inżynierem.",
      speaker: "Anna Maria Siarkowska",
      club: "PiS",
      function: "posłanka",
      tone: "emocjonalny",
      reason:
        "Personalizacja zarzutu („moja wnuczka”) plus suchy żart polityczny — łatwo udostępniać.",
      punktOrd: 5,
      punktShort: "Informacja MI o stanie CPK",
      punktTime: "18:02",
    },
  ],

  topSpeakers: [
    {
      name: "Andrzej Domański",
      club: "KO",
      function: "Minister Finansów",
      minutes: 78,
      wypowiedzi: 9,
      dominantTone: "techniczny",
      bestQuote:
        "Skala redystrybucji w tym pakiecie jest największa od czasu wprowadzenia 500+. Liczby są publiczne — każdy może sprawdzić.",
    },
    {
      name: "Krzysztof Bosak",
      club: "Konfederacja",
      function: "poseł",
      minutes: 64,
      wypowiedzi: 14,
      dominantTone: "konfrontacyjny",
      bestQuote:
        "Zwiększacie kwotę wolną o sześć złotych dziennie i nazywacie to ulgą dla rodzin. To nie ulga — to alibi.",
    },
    {
      name: "Mariusz Błaszczak",
      club: "PiS",
      function: "przewodniczący klubu",
      minutes: 52,
      wypowiedzi: 11,
      dominantTone: "konfrontacyjny",
      bestQuote:
        "Pan marszałek prowadzi obrady jak prezes spółki z o.o. — tylko z większościowym pakietem.",
    },
    {
      name: "Anna Maria Siarkowska",
      club: "PiS",
      function: "posłanka",
      minutes: 38,
      wypowiedzi: 7,
      dominantTone: "emocjonalny",
      bestQuote:
        "Trzy lata mówicie „za chwilę”. W tym tempie pierwszego pociągu doczeka się moja wnuczka.",
    },
    {
      name: "Dorota Niedziela",
      club: "KO",
      function: "sprawozdawca",
      minutes: 34,
      wypowiedzi: 5,
      dominantTone: "argumentowy",
      bestQuote:
        "Plan miejscowy to nie biurokracja. To umowa między mieszkańcami a deweloperem.",
    },
    {
      name: "Marek Sawicki",
      club: "PSL-TD",
      function: "poseł",
      minutes: 29,
      wypowiedzi: 6,
      dominantTone: "argumentowy",
      bestQuote:
        "Lek za złotówkę to nie jałmużna. To umowa pokoleniowa, którą państwo wreszcie zaczyna spłacać.",
    },
    {
      name: "Magdalena Biejat",
      club: "Lewica",
      function: "wicemarszałek Sejmu",
      minutes: 24,
      wypowiedzi: 4,
      dominantTone: "argumentowy",
      bestQuote:
        "Jeśli mówimy „rodzina”, musimy mówić też o opiece — bo bez niej praca jest złudzeniem.",
    },
    {
      name: "Włodzimierz Czarzasty",
      club: "Lewica",
      function: "Marszałek Sejmu",
      minutes: 21,
      wypowiedzi: 8,
      dominantTone: "neutralny",
      bestQuote:
        "Proszę nie przerywać. Pan poseł skończy myśl i wtedy będzie czas na repliki.",
    },
  ],

  starcia: [
    {
      a: "Bosak",
      aClub: "Konfederacja",
      b: "Domański",
      bClub: "KO",
      punktOrd: 1,
      punktShort: "Trzecie czytanie ustawy PIT",
      exchanges: 6,
      snippet:
        "Bosak: „Liczby są fałszywe, bo zakłada się stałą inflację 2,5%.” Domański: „Pan poseł czyta jeden slajd, a w drugim jest waloryzacja kwartalna.”",
    },
    {
      a: "Błaszczak",
      aClub: "PiS",
      b: "Czarzasty",
      bClub: "Lewica",
      punktOrd: 2,
      punktShort: "Wniosek o odwołanie Marszałka",
      exchanges: 4,
      snippet:
        "Błaszczak: „Pan marszałek nie udziela głosu posłom opozycji.” Czarzasty: „Udzielam głosu kolejno z listy, panie pośle — proszę się z nią zapoznać.”",
    },
    {
      a: "Siarkowska",
      aClub: "PiS",
      b: "Klimczak",
      bClub: "Polska2050",
      punktOrd: 5,
      punktShort: "Informacja MI o CPK",
      exchanges: 3,
      snippet:
        "Siarkowska: „Trzy lata i ani jednej łopaty.” Klimczak: „Pani posłanka mówi o łopatach — my mówimy o procedurach środowiskowych, których wasi nie chcieli zacząć.”",
    },
  ],

  renegaci: [
    {
      name: "Marek Suski",
      club: "PiS",
      expectedClub: "PiS",
      actual: "ZA",
      punktOrd: 1,
      punktShort: "PIT — kwota wolna 60 tys.",
      note: "Trzeci raz w tej kadencji wyłamuje się klubowi w głosowaniu podatkowym. Powołuje się na okręg radomski.",
    },
    {
      name: "Arkadiusz Mularczyk",
      club: "PiS",
      expectedClub: "PiS",
      actual: "ZA",
      punktOrd: 1,
      punktShort: "PIT — kwota wolna 60 tys.",
      note: "Były wiceminister sprawiedliwości — pierwszy raz głosuje za projektem koalicji.",
    },
    {
      name: "Zbigniew Hoffmann",
      club: "Konfederacja",
      expectedClub: "Konfederacja",
      actual: "WS",
      punktOrd: 4,
      punktShort: "Bezpłatne leki 75+",
      note: "Klub Konfederacji ZA, Hoffmann WSTRZ. — sygnalizuje sceptycyzm wobec dalszej rozbudowy programów osłonowych.",
    },
    {
      name: "Joanna Mucha",
      club: "Polska2050",
      expectedClub: "Polska2050",
      actual: "PR",
      punktOrd: 7,
      punktShort: "Stanowisko Sejmu wobec polityki UE",
      note: "Klub ZA, Mucha PRZECIW — uzasadnia dystansem wobec mechanizmu warunkowości w obecnej formie.",
    },
  ],

  jutro: {
    date: "2026-05-15",
    weekday: "piątek",
    headline:
      "Piątek otworzy trzecie czytanie e-doręczeń i blok 14 głosowań końcowych. Z dziewiętnastego posiedzenia zostają już tylko decyzje.",
    plannedPoints: [
      {
        ord: 9,
        title: "E-doręczenia — III czytanie",
        subtitle: "rządowy projekt o cyfryzacji korespondencji urzędowej",
        topic: "biznes-podatki",
      },
      {
        ord: 10,
        title: "Informacja Ministra Zdrowia",
        subtitle: "o realizacji programu wczesnego wykrywania nowotworów u dzieci",
        topic: "zdrowie",
      },
      {
        ord: 11,
        title: "Blok głosowań końcowych",
        subtitle: "zaplanowano łącznie 14 głosowań, m.in. pakiet onkologiczny",
        topic: null,
        flag: true,
      },
    ],
  },
};
