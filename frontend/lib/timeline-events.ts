// Hand-curated historical events overlaid on every time-series chart in the
// app (poll trend sparklines, MP voting bars, MP statement activity).
//
// Edit this file to add or remove events — they go live on next deploy.
// Global events (no partyCode) show on every chart. Party-scoped events show
// only on that party's poll sparkline and on the chart of every MP belonging
// to that party (mapping via KLUB_TO_POLL_PARTY below).

export type TimelineEventKind =
  | "election"
  | "leadership"
  | "coalition"
  | "scandal"
  | "policy"
  | "other";

export type TimelineEvent = {
  date: string; // ISO YYYY-MM-DD
  title: string;
  partyCode?: string; // omitted = global; matches POLL_PARTY_COLORS keys
  kind: TimelineEventKind;
  description?: string;
  // 1 = critical (always shown, incl. dense sparklines). 2 = normal (only on
  // full-size charts). Default 2.
  importance?: 1 | 2;
};

// Add events here. Keep titles short — hover description carries detail.
// Sorted by date ascending. Dates verified against news/Wikipedia sources;
// month-level reporting on a few items (Nawrocki vetoes, party congresses)
// may shift by a day or two — see PR description for sources.
export const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    date: "2023-11-13",
    title: "Hołownia marszałkiem Sejmu",
    partyCode: "Polska2050",
    kind: "leadership",
    description:
      "Szymon Hołownia obejmuje funkcję marszałka Sejmu w ramach umowy koalicyjnej rotacji.",
  },
  {
    date: "2023-12-11",
    title: "Powołanie rządu Tuska",
    kind: "coalition",
    description: "Sejm udziela wotum zaufania rządowi Donalda Tuska (248 za, 201 przeciw).",
  },
  {
    date: "2023-12-12",
    title: "Braun gasi świece chanukowe",
    partyCode: "Konfederacja",
    kind: "scandal",
    description: "Grzegorz Braun gaśnicą gasi menorę w Sejmie; wykluczony z obrad.",
    importance: 1,
  },
  {
    date: "2023-12-13",
    title: "Zaprzysiężenie rządu Tuska",
    kind: "coalition",
    description: "Prezydent Duda zaprzysięga rząd Tuska; Kosiniak-Kamysz wicepremierem i MON.",
    importance: 1,
  },
  {
    date: "2023-12-19",
    title: "Przejęcie mediów publicznych",
    partyCode: "KO",
    kind: "policy",
    description: "Minister Sienkiewicz odwołuje zarządy TVP, PR i PAP; początek sporu o media publiczne.",
  },
  {
    date: "2023-12-20",
    title: "Prawomocny wyrok dla Kamińskiego i Wąsika",
    partyCode: "PiS",
    kind: "scandal",
    description: "Sąd skazuje obu polityków PiS na 2 lata więzienia w tzw. aferze gruntowej.",
  },
  {
    date: "2024-01-09",
    title: "Zatrzymanie Kamińskiego i Wąsika",
    partyCode: "PiS",
    kind: "scandal",
    description: "Policja zatrzymuje byłych szefów CBA w Pałacu Prezydenckim; trafiają do aresztu.",
    importance: 1,
  },
  {
    date: "2024-01-23",
    title: "Drugie ułaskawienie Kamińskiego i Wąsika",
    partyCode: "PiS",
    kind: "scandal",
    description: "Prezydent Duda ponownie ułaskawia skazanych polityków; spór o mandaty trwa.",
  },
  {
    date: "2024-02-19",
    title: "Start komisji śledczej ws. Pegasusa",
    kind: "policy",
    description: "Sejmowa komisja rozpoczyna badanie inwigilacji Pegasusem w latach 2015-2023.",
  },
  {
    date: "2024-03-11",
    title: "Start komisji śledczej ws. afery wizowej",
    kind: "policy",
    description: "Komisja bada nieprawidłowości w wydawaniu wiz za rządów PiS.",
  },
  {
    date: "2024-04-07",
    title: "Wybory samorządowe",
    kind: "election",
    description: "Pierwsza tura wyborów samorządowych 2024.",
    importance: 1,
  },
  {
    date: "2024-06-09",
    title: "Wybory do PE",
    kind: "election",
    description: "Wybory do Parlamentu Europejskiego 2024.",
    importance: 1,
  },
  {
    date: "2024-07-12",
    title: "Sejm uchyla immunitet Romanowskiemu",
    partyCode: "PiS",
    kind: "scandal",
    description: "Wniosek Bodnara ws. afery Funduszu Sprawiedliwości; późniejsza ucieczka na Węgry.",
  },
  {
    date: "2024-08-20",
    title: "Mentzen kandydatem Konfederacji",
    partyCode: "Konfederacja",
    kind: "leadership",
    description: "Rada Liderów wskazuje Sławomira Mentzena jako kandydata na prezydenta.",
  },
  {
    date: "2024-10-12",
    title: "Razem opuszcza klub Lewicy",
    partyCode: "Razem",
    kind: "coalition",
    description: "Kongres Razem decyduje o wyjściu z klubu Lewicy; Biejat i 4 posłanki opuszczają partię.",
    importance: 1,
  },
  {
    date: "2024-10-25",
    title: "Marek Woch przewodniczącym Bezpartyjnych",
    partyCode: "BS",
    kind: "leadership",
    description: "Kongres BS wybiera Wocha; późniejszy kandydat prezydencki.",
  },
  {
    date: "2024-11-18",
    title: "Wyrejestrowanie Polski Jest Jedna",
    partyCode: "PJJ",
    kind: "other",
    description: "Partia Rafała Piecha wykreślona z ewidencji; działalność kontynuowana jako stowarzyszenie.",
  },
  {
    date: "2024-11-22",
    title: "Trzaskowski wygrywa prawybory KO",
    partyCode: "KO",
    kind: "leadership",
    description: "Rafał Trzaskowski pokonuje Sikorskiego (~75%); zostaje kandydatem KO na prezydenta.",
    importance: 1,
  },
  {
    date: "2024-11-24",
    title: "Nawrocki kandydatem PiS",
    partyCode: "PiS",
    kind: "leadership",
    description: "Kaczyński ogłasza prezesa IPN jako kandydata obozu PiS w Krakowie.",
    importance: 1,
  },
  {
    date: "2024-11-29",
    title: "KORWiN → Nowa Nadzieja",
    partyCode: "Konfederacja",
    kind: "other",
    description: "Partia Mentzena formalnie zmienia nazwę z KORWiN na Nowa Nadzieja.",
  },
  {
    date: "2024-12-19",
    title: "ENA przeciw Romanowskiemu",
    partyCode: "PiS",
    kind: "scandal",
    description: "Sąd wydaje Europejski Nakaz Aresztowania; Romanowski uzyskuje azyl polityczny na Węgrzech.",
  },
  {
    date: "2025-01-01",
    title: "Polska prezydencja w Radzie UE",
    kind: "policy",
    description: "Druga w historii polska prezydencja w UE pod hasłem bezpieczeństwa.",
  },
  {
    date: "2025-01-17",
    title: "Braun wykluczony z Konfederacji",
    partyCode: "Konfederacja",
    kind: "leadership",
    description: "Sąd partyjny KWiN usuwa Brauna po ogłoszeniu konkurencyjnej kandydatury prezydenckiej.",
    importance: 1,
  },
  {
    date: "2025-03-10",
    title: "Posłowie KKP opuszczają klub Konfederacji",
    partyCode: "KKP",
    kind: "coalition",
    description: "Fritz i Skalik wystąpili z klubu KWiN; początek odrębnej obecności KKP w Sejmie.",
  },
  {
    date: "2025-05-18",
    title: "Wybory prezydenckie — I tura",
    kind: "election",
    importance: 1,
  },
  {
    date: "2025-06-01",
    title: "Wybory prezydenckie — II tura",
    kind: "election",
    importance: 1,
  },
  {
    date: "2025-06-04",
    title: "Powstanie koła poselskiego KKP",
    partyCode: "KKP",
    kind: "coalition",
    description: "Trzyosobowe koło Konfederacji Korony Polskiej w Sejmie (Fritz, Skalik, Zawiślak).",
    importance: 1,
  },
  {
    date: "2025-06-17",
    title: "Rozpad Trzeciej Drogi",
    partyCode: "TD",
    kind: "coalition",
    description: "Rada Naczelna PSL kończy projekt Trzeciej Drogi; Hołownia potwierdza.",
    importance: 1,
  },
  {
    date: "2025-06-28",
    title: "Kaczyński ponownie prezesem PiS",
    partyCode: "PiS",
    kind: "leadership",
    description: "VII Kongres PiS w Przysusze wybiera Kaczyńskiego na kolejną kadencję.",
  },
  {
    date: "2025-08-06",
    title: "Zaprzysiężenie prezydenta",
    kind: "other",
    description: "Zaprzysiężenie Karola Nawrockiego jako Prezydenta RP.",
    importance: 1,
  },
  {
    date: "2025-09-09",
    title: "Pierwsze weto Nawrockiego: wiatraki",
    kind: "policy",
    description: "Prezydent wetuje ustawę odległościową dla wiatraków; sygnał konfrontacji z rządem.",
  },
  {
    date: "2025-09-22",
    title: "Hołownia rezygnuje z lidera Polski 2050",
    partyCode: "Polska2050",
    kind: "leadership",
    description: "Hołownia ogłasza, że nie będzie ubiegał się o reelekcję; celuje w funkcję w UNHCR.",
    importance: 1,
  },
  {
    date: "2025-11-07",
    title: "Sejm uchyla immunitet Ziobrze",
    partyCode: "PiS",
    kind: "scandal",
    description: "Zgoda na zatrzymanie i areszt b. ministra sprawiedliwości; Ziobro przebywa na Węgrzech.",
  },
  {
    date: "2025-11-13",
    title: "Czarzasty marszałkiem Sejmu",
    kind: "leadership",
    description: "Rotacja koalicyjna: Hołownia ustępuje, Sejm wybiera Włodzimierza Czarzastego.",
    importance: 1,
  },
  {
    date: "2026-01-31",
    title: "Pełczyńska-Nałęcz nową szefową Polski 2050",
    partyCode: "Polska2050",
    kind: "leadership",
    description: "Pokonuje Hennig-Kloskę 350:309 w powtórzonej II turze.",
    importance: 1,
  },
  {
    date: "2026-03-12",
    title: "Weto Nawrockiego ws. SAFE",
    kind: "policy",
    description: "Prezydent w orędziu zapowiada weto ustawy wdrażającej unijny mechanizm SAFE.",
  },
  {
    date: "2026-03-21",
    title: "Polska 2050 zmienia nazwę",
    partyCode: "Polska2050",
    kind: "other",
    description: "Partia przyjmuje nazwę Polska 2050 Rzeczypospolitej Polskiej po Kongresie Nowego Otwarcia.",
  },
];

// Mirrors KLUB_LABELS keys from lib/atlas/constants.ts. Maps parliamentary
// klub codes to the poll-party code used in TIMELINE_EVENTS.partyCode and in
// POLL_PARTY_COLORS. Some klub codes have no obvious poll counterpart (e.g.
// "niez.", Republikanie) and are left unmapped — MPs in those klubs see only
// global events.
export const KLUB_TO_POLL_PARTY: Record<string, string> = {
  KO: "KO",
  PiS: "PiS",
  Polska2050: "Polska2050",
  Lewica: "Lewica",
  "PSL-TD": "PSL",
  Konfederacja: "Konfederacja",
  Konfederacja_KP: "KKP",
  Razem: "Razem",
};

export function pollPartyForKlub(klubRef: string | null | undefined): string | null {
  if (!klubRef) return null;
  return KLUB_TO_POLL_PARTY[klubRef] ?? null;
}

function inWindow(iso: string, from?: string, to?: string): boolean {
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

// Events to show on a chart scoped to `partyCode` (undefined = global-only).
// `maxImportance` filters out lower-priority events: pass 1 for compact
// sparklines (only critical events), omit / pass 2 for full charts.
export function getEventsForChart({
  partyCode,
  from,
  to,
  maxImportance = 2,
}: {
  partyCode?: string | null;
  from?: string;
  to?: string;
  maxImportance?: 1 | 2;
}): TimelineEvent[] {
  return TIMELINE_EVENTS.filter((e) => {
    if (e.partyCode && e.partyCode !== partyCode) return false;
    if ((e.importance ?? 2) > maxImportance) return false;
    return inWindow(e.date, from, to);
  }).sort((a, b) => a.date.localeCompare(b.date));
}

// Convenience for MP-page charts. Pass the MP's klub ref; returns global
// events plus events for that klub's poll party (if mapped).
export function getEventsForMp({
  klubRef,
  from,
  to,
  maxImportance,
}: {
  klubRef: string | null | undefined;
  from?: string;
  to?: string;
  maxImportance?: 1 | 2;
}): TimelineEvent[] {
  const partyCode = pollPartyForKlub(klubRef) ?? undefined;
  return getEventsForChart({ partyCode, from, to, maxImportance });
}
