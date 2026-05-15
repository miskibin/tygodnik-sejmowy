// Mock data for the proceeding-points view mockup.
// Shape mirrors what a real loader would return from agenda_items joined with
// agenda_item_processes, agenda_item_prints, proceeding_statements + enrichment.

export type StageBadge =
  | "I czytanie"
  | "II czytanie"
  | "III czytanie"
  | "Głosowanie"
  | "Sprawozdanie komisji"
  | "Pierwsze czytanie"
  | "Informacja"
  | "Pytania w sprawach bieżących"
  | "Wniosek formalny";

export type ProcessRef = {
  term: number;
  number: string;
  shortTitle: string;
  topicTag?: string;
};

export type PrintRef = {
  term: number;
  number: string;
};

export type ViralQuote = {
  statementId: number;
  speakerName: string;
  clubRef: string | null;
  function: string | null;
  quote: string;
};

export type AgendaPoint = {
  agendaItemId: number;
  ord: number;
  title: string;
  /** ISO date when this point was discussed (some span multiple days). */
  date: string;
  /** Best-effort start time on that day. */
  startTime: string | null;
  /** Duration in minutes (sum of statement durations). */
  durationMin: number | null;
  stages: StageBadge[];
  processes: ProcessRef[];
  prints: PrintRef[];
  statementCount: number;
  votingCount: number;
  uniqueSpeakers: number;
  viralQuote: ViralQuote | null;
  /** Optional one-line LLM summary (proceeding_statements_enrichment-style). */
  summary: string | null;
  topicTags: string[];
};

export type ProceedingMock = {
  term: number;
  number: number;
  title: string;
  dates: string[];
  current: boolean;
  totalStatements: number;
  totalVotings: number;
  totalSpeakers: number;
  totalPoints: number;
  points: AgendaPoint[];
};

export const MOCK_SITTING: ProceedingMock = {
  term: 10,
  number: 19,
  title:
    "19. posiedzenie Sejmu Rzeczypospolitej Polskiej X kadencji",
  dates: ["2026-05-13", "2026-05-14", "2026-05-15"],
  current: true,
  totalStatements: 612,
  totalVotings: 47,
  totalSpeakers: 218,
  totalPoints: 24,
  points: [
    {
      agendaItemId: 1,
      ord: 1,
      title:
        "Sprawozdanie Komisji Finansów Publicznych o rządowym projekcie ustawy o zmianie ustawy o podatku dochodowym od osób fizycznych oraz niektórych innych ustaw",
      date: "2026-05-13",
      startTime: "10:08",
      durationMin: 142,
      stages: ["II czytanie", "Sprawozdanie komisji", "Głosowanie"],
      processes: [
        {
          term: 10,
          number: "841",
          shortTitle: "Zmiany w PIT — kwota wolna 60 tys. zł",
          topicTag: "podatki",
        },
      ],
      prints: [
        { term: 10, number: "841" },
        { term: 10, number: "892" },
        { term: 10, number: "892-A" },
      ],
      statementCount: 84,
      votingCount: 6,
      uniqueSpeakers: 41,
      summary:
        "II czytanie projektu podnoszącego kwotę wolną do 60 tys. zł i wprowadzającego ulgę dla rodzin 2+; przyjęto poprawki rządowe, odrzucono wniosek opozycji o pełną indeksację.",
      topicTags: ["podatki", "budżet", "rodzina"],
      viralQuote: {
        statementId: 412901,
        speakerName: "Krzysztof Bosak",
        clubRef: "Konfederacja",
        function: "poseł",
        quote:
          "Zwiększacie kwotę wolną o sześć złotych dziennie i nazywacie to ulgą dla rodzin. To nie ulga — to alibi.",
      },
    },
    {
      agendaItemId: 2,
      ord: 2,
      title:
        "Pierwsze czytanie rządowego projektu ustawy o ochronie sygnalistów oraz o zmianie niektórych ustaw",
      date: "2026-05-13",
      startTime: "13:42",
      durationMin: 96,
      stages: ["I czytanie"],
      processes: [
        {
          term: 10,
          number: "905",
          shortTitle: "Ochrona sygnalistów — implementacja dyrektywy UE",
          topicTag: "praworządność",
        },
      ],
      prints: [{ term: 10, number: "905" }],
      statementCount: 38,
      votingCount: 1,
      uniqueSpeakers: 22,
      summary:
        "Projekt implementuje dyrektywę 2019/1937. Spór dotyczył zakresu podmiotowego (sektor prywatny od 50 pracowników) i roli RPO jako organu rozpatrującego zgłoszenia zewnętrzne.",
      topicTags: ["praca", "praworządność", "UE"],
      viralQuote: {
        statementId: 412944,
        speakerName: "Agnieszka Dziemianowicz-Bąk",
        clubRef: "Lewica",
        function: "Minister Rodziny, Pracy i Polityki Społecznej",
        quote:
          "Sygnalista to nie donosiciel. To człowiek, który widzi nieprawidłowość i nie chce udawać, że jej nie ma.",
      },
    },
    {
      agendaItemId: 3,
      ord: 3,
      title:
        "Informacja Ministra Spraw Zagranicznych na temat polityki zagranicznej RP w 2026 roku",
      date: "2026-05-13",
      startTime: "16:15",
      durationMin: 178,
      stages: ["Informacja"],
      processes: [],
      prints: [],
      statementCount: 67,
      votingCount: 0,
      uniqueSpeakers: 67,
      summary:
        "Coroczne exposé szefa MSZ. Główne osie: relacje z USA po wyborze administracji, bezpieczeństwo wschodniej flanki, członkostwo Ukrainy w UE, polityka migracyjna.",
      topicTags: ["polityka zagraniczna", "bezpieczeństwo", "UE"],
      viralQuote: {
        statementId: 413102,
        speakerName: "Radosław Sikorski",
        clubRef: null,
        function: "Minister Spraw Zagranicznych",
        quote:
          "Polska nie będzie peryferiami Europy. Polska jest tą Europą, która stawia jej granice — także moralne.",
      },
    },
    {
      agendaItemId: 4,
      ord: 4,
      title:
        "Sprawozdanie Komisji Zdrowia o poselskim projekcie ustawy o zmianie ustawy o świadczeniach opieki zdrowotnej finansowanych ze środków publicznych",
      date: "2026-05-14",
      startTime: "09:02",
      durationMin: 124,
      stages: ["II czytanie", "Sprawozdanie komisji", "Głosowanie"],
      processes: [
        {
          term: 10,
          number: "763",
          shortTitle: "Bezpłatne leki dla seniorów 75+ — rozszerzenie listy",
          topicTag: "zdrowie",
        },
      ],
      prints: [
        { term: 10, number: "763" },
        { term: 10, number: "871" },
      ],
      statementCount: 51,
      votingCount: 4,
      uniqueSpeakers: 29,
      summary:
        "Projekt rozszerza listę 75+ o 312 nowych pozycji. Przyjęto z poprawką Senatu obniżającą wiek do 70 lat dla osób z chorobami przewlekłymi.",
      topicTags: ["zdrowie", "seniorzy"],
      viralQuote: {
        statementId: 413288,
        speakerName: "Marek Sawicki",
        clubRef: "PSL-TD",
        function: "poseł",
        quote:
          "Lek za złotówkę to nie jałmużna. To umowa pokoleniowa, którą państwo wreszcie zaczyna spłacać.",
      },
    },
    {
      agendaItemId: 5,
      ord: 5,
      title:
        "Pytania w sprawach bieżących",
      date: "2026-05-14",
      startTime: "12:00",
      durationMin: 60,
      stages: ["Pytania w sprawach bieżących"],
      processes: [],
      prints: [],
      statementCount: 30,
      votingCount: 0,
      uniqueSpeakers: 30,
      summary:
        "15 pytań od opozycji i koalicji. Dominujące tematy: ceny energii (4 pytania), CPK (3), sytuacja w służbie zdrowia (3).",
      topicTags: ["energia", "infrastruktura", "zdrowie"],
      viralQuote: null,
    },
    {
      agendaItemId: 6,
      ord: 6,
      title:
        "Sprawozdanie Komisji Infrastruktury oraz Komisji Samorządu Terytorialnego i Polityki Regionalnej o rządowym projekcie ustawy o zmianie ustawy — Prawo budowlane oraz niektórych innych ustaw",
      date: "2026-05-14",
      startTime: "14:30",
      durationMin: 187,
      stages: ["II czytanie", "Sprawozdanie komisji"],
      processes: [
        {
          term: 10,
          number: "812",
          shortTitle: "Reforma planowania przestrzennego — etap II",
          topicTag: "budownictwo",
        },
      ],
      prints: [
        { term: 10, number: "812" },
        { term: 10, number: "812-A" },
        { term: 10, number: "812-B" },
      ],
      statementCount: 73,
      votingCount: 0,
      uniqueSpeakers: 38,
      summary:
        "Kontynuacja reformy: cyfrowy rejestr planów, skrócenie procedur środowiskowych, ograniczenie zabudowy rozproszonej. Wniosek o odroczenie III czytania.",
      topicTags: ["mieszkalnictwo", "samorząd", "ekologia"],
      viralQuote: {
        statementId: 413541,
        speakerName: "Dorota Niedziela",
        clubRef: "KO",
        function: "sprawozdawca",
        quote:
          "Plan miejscowy to nie biurokracja. To umowa między mieszkańcami a deweloperem — i ona nie może już być pisana ołówkiem.",
      },
    },
    {
      agendaItemId: 7,
      ord: 7,
      title:
        "Trzecie czytanie rządowego projektu ustawy o zmianie ustawy o podatku dochodowym od osób fizycznych oraz niektórych innych ustaw",
      date: "2026-05-15",
      startTime: "10:00",
      durationMin: 22,
      stages: ["III czytanie", "Głosowanie"],
      processes: [
        {
          term: 10,
          number: "841",
          shortTitle: "Zmiany w PIT — kwota wolna 60 tys. zł",
          topicTag: "podatki",
        },
      ],
      prints: [{ term: 10, number: "841" }],
      statementCount: 8,
      votingCount: 12,
      uniqueSpeakers: 6,
      summary:
        "Ustawa przyjęta: 248 ZA, 198 PRZECIW, 12 WSTRZ. Pełny rozłam koalicja–opozycja; trzech posłów PiS zagłosowało ZA.",
      topicTags: ["podatki"],
      viralQuote: null,
    },
    {
      agendaItemId: 8,
      ord: 8,
      title:
        "Wniosek o odwołanie Marszałka Sejmu",
      date: "2026-05-15",
      startTime: "11:45",
      durationMin: 95,
      stages: ["Wniosek formalny", "Głosowanie"],
      processes: [],
      prints: [{ term: 10, number: "918" }],
      statementCount: 22,
      votingCount: 1,
      uniqueSpeakers: 18,
      summary:
        "Wniosek złożony przez klub PiS odrzucony: 162 ZA, 281 PRZECIW. Główny zarzut: jednostronne stosowanie regulaminu w sprawie immunitetów.",
      topicTags: ["regulamin", "władze Sejmu"],
      viralQuote: {
        statementId: 413892,
        speakerName: "Mariusz Błaszczak",
        clubRef: "PiS",
        function: "przewodniczący klubu",
        quote:
          "Pan marszałek prowadzi obrady jak prezes spółki z o.o. — tylko z większościowym pakietem. Sejm to nie spółka.",
      },
    },
  ],
};
