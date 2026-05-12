export type DocumentCategory =
  | "projekt_ustawy"
  | "opinia_organu"
  | "sprawozdanie_komisji"
  | "autopoprawka"
  | "wniosek_personalny"
  | "pismo_marszalka"
  | "uchwala_upamietniajaca"
  | "uchwala_senatu"
  | "weto_prezydenta"
  | "wotum_nieufnosci"
  | "wniosek_organizacyjny"
  | "informacja"
  | "inne"
  | null;

export type SponsorAuthority =
  | "rzad"
  | "prezydent"
  | "klub_poselski"
  | "senat"
  | "komisja"
  | "prezydium"
  | "obywatele"
  | "inne"
  | null;

export type AffectedGroup = {
  tag: string;
  severity: "low" | "medium" | "high";
  estPopulation: number | null;
};

export type SittingInfo = {
  term: number;
  sittingNum: number;
  title: string;
  firstDate: string;
  lastDate: string;
  printCount: number;
  eventCount: number;
  topTopics: string[];
};

export type PrintEventPayload = {
  print_id: number;
  number: string;
  short_title: string | null;
  title: string;
  impact_punch: string | null;
  summary_plain: string | null;
  citizen_action: string | null;
  affected_groups: { tag: string; severity: "low" | "medium" | "high"; est_population: number | null }[] | null;
  topic_tags: string[] | null;
  change_date: string | null;
  document_category: string | null;
  sponsor_authority?: string | null;
  current_stage_type?: string | null;
  process_passed?: boolean | null;
};

export type PrintEvent = {
  term: number;
  sittingNum: number;
  eventDate: string | null;
  impactScore: number;
  sourceUrl: string;
  payload: PrintEventPayload;
};

// ───────────────── Rich weekly events (mirrors frontend/lib/events-types.ts) ─

export type EventType =
  | "print"
  | "vote"
  | "eli_inforce"
  | "late_interpellation"
  | "viral_quote";

export type LinkedPrintRef = {
  print_id: number;
  number: string;
  short_title: string | null;
  role: string;
  impact_punch?: string | null;
};

export type ClubTally = {
  club_short: string;
  club_name: string;
  yes: number;
  no: number;
  abstain: number;
  not_voting: number;
  total: number;
};

export type VoteEventPayload = {
  voting_id: number;
  voting_number: number;
  sitting: number;
  sitting_day: number;
  date: string;
  title: string;
  topic: string;
  yes: number;
  no: number;
  abstain: number;
  not_participating: number;
  total_voted: number;
  linked_prints: LinkedPrintRef[];
  club_tally: ClubTally[];
};

export type ActKind =
  | "ustawa_nowa"
  | "nowelizacja"
  | "tekst_jednolity"
  | "obwieszczenie"
  | "rozporzadzenie"
  | "uchwala_sejmu"
  | "inne";

export type EliInforcePayload = {
  act_id: number;
  eli_id: string;
  publisher: string;
  year: number;
  position: number;
  type: string;
  act_kind: ActKind | null;
  title: string;
  short_title: string | null;
  in_force: string | null;
  legal_status_date: string | null;
  announcement_date: string | null;
  promulgation_date: string | null;
  display_address: string | null;
  keywords: string[] | null;
};

export type InterpellationAuthor = {
  mp_id: number;
  first_last_name: string | null;
};

export type LateInterpellationPayload = {
  question_id: number;
  kind: "interpellation" | "written";
  num: number;
  title: string;
  sent_date: string;
  answer_delayed_days: number;
  recipient_titles: string[];
  authors: InterpellationAuthor[];
};

export type ViralQuotePayload = {
  statement_id: number;
  speaker_name: string;
  function: string | null;
  mp_id: number | null;
  date: string;
  viral_quote: string | null;
  viral_reason: string | null;
  tone: string | null;
  topic_tags: string[] | null;
  summary_one_line: string | null;
  addressee: string | null;
};

type EventCommon = {
  term: number;
  sittingNum: number;
  eventDate: string | null;
  impactScore: number;
  sourceUrl: string;
};

export type WeeklyEvent =
  | (EventCommon & { eventType: "print"; payload: PrintEventPayload })
  | (EventCommon & { eventType: "vote"; payload: VoteEventPayload })
  | (EventCommon & { eventType: "eli_inforce"; payload: EliInforcePayload })
  | (EventCommon & { eventType: "late_interpellation"; payload: LateInterpellationPayload })
  | (EventCommon & { eventType: "viral_quote"; payload: ViralQuotePayload });

export const ACT_KIND_NEW_LAW: ReadonlySet<ActKind> = new Set([
  "ustawa_nowa",
  "nowelizacja",
]);

export type ProcessStage = {
  ord: number;
  depth: number;
  stageName: string;
  stageType: string;
  stageDate: string | null;
  decision: string | null;
  sittingNum: number | null;
};

export type LinkedVoting = {
  votingId: number;
  role: "main" | "autopoprawka" | "sprawozdanie" | "poprawka" | "joint" | "other";
  votingNumber: number;
  sitting: number;
  date: string;
  title: string;
  yes: number;
  no: number;
  abstain: number;
  notParticipating: number;
};

export type ProcessAct = {
  eliId: string;
  displayAddress: string;
  title: string | null;
  status: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
};

export type ProcessOutcome = {
  passed: boolean;
  closureDate: string | null;
  act: ProcessAct | null;
  urgencyStatus: "NORMAL" | "URGENT" | null;
  documentType: string | null;
};

export type PrintDetail = {
  id: number;
  term: number;
  number: string;
  shortTitle: string;
  title: string;
  changeDate: string | null;
  documentDate: string | null;
  impactPunch: string;
  summary: string | null;
  summaryPlain: string | null;
  citizenAction: string | null;
  affectedGroups: AffectedGroup[];
  topics: string[];
  documentCategory: DocumentCategory;
  parentNumber: string | null;
  isProcedural: boolean;
  isMetaDocument: boolean;
  sponsorAuthority: SponsorAuthority;
  sponsorMps: string[];
  stance: string | null;
};

export type PrintWithStages = {
  print: PrintDetail;
  stages: ProcessStage[];
  mainVoting: LinkedVoting | null;
  relatedVotings: LinkedVoting[];
  outcome: ProcessOutcome | null;
  attachments: string[];
};

export const SPONSOR_LABEL: Record<NonNullable<SponsorAuthority>, string> = {
  rzad: "Rząd",
  prezydent: "Prezydent",
  klub_poselski: "Klub poselski",
  senat: "Senat",
  komisja: "Komisja",
  prezydium: "Prezydium",
  obywatele: "Obywatele",
  inne: "Inne",
};

export const CATEGORY_LABEL: Record<NonNullable<DocumentCategory>, string> = {
  projekt_ustawy: "Projekt ustawy",
  opinia_organu: "Opinia",
  sprawozdanie_komisji: "Sprawozdanie komisji",
  autopoprawka: "Autopoprawka",
  wniosek_personalny: "Wniosek personalny",
  pismo_marszalka: "Pismo marszałka",
  uchwala_upamietniajaca: "Uchwała upamiętniająca",
  uchwala_senatu: "Uchwała Senatu",
  weto_prezydenta: "Weto Prezydenta",
  wotum_nieufnosci: "Wotum nieufności",
  wniosek_organizacyjny: "Wniosek organizacyjny",
  informacja: "Informacja",
  inne: "Inne",
};

// 26 persona tags from supagraf/enrich/print_personas.py (taxonomy is locked;
// adding/removing requires migration + prompt bump). Slugs leak into the UI
// otherwise — citizen sees "rodzic-ucznia" instead of "Rodzice uczniów".
export const AFFECTED_GROUP_LABEL: Record<string, string> = {
  najemca: "Najemcy",
  "wlasciciel-mieszkania": "Właściciele mieszkań",
  "rodzic-ucznia": "Rodzice uczniów",
  "pacjent-nfz": "Pacjenci NFZ",
  "kierowca-zawodowy": "Kierowcy zawodowi",
  rolnik: "Rolnicy",
  jdg: "JDG (samozatrudnieni)",
  emeryt: "Emeryci",
  "pracownik-najemny": "Pracownicy najemni",
  student: "Studenci",
  "przedsiebiorca-pracodawca": "Pracodawcy",
  niepelnosprawny: "Osoby z niepełnosprawnościami",
  wies: "Mieszkańcy wsi",
  "duze-miasto": "Mieszkańcy dużych miast",
  "podatnik-pit": "Podatnicy PIT",
  "podatnik-vat": "Podatnicy VAT",
  "kierowca-prywatny": "Kierowcy prywatni",
  "odbiorca-energii": "Odbiorcy energii",
  "beneficjent-rodzinny": "Rodziny z dziećmi",
  "opiekun-seniora": "Opiekunowie seniorów",
  dzialkowicz: "Działkowicze",
  wedkarz: "Wędkarze",
  mysliwy: "Myśliwi",
  hodowca: "Hodowcy",
  konsument: "Konsumenci",
  imigrant: "Cudzoziemcy w PL",
};

export function affectedGroupLabel(tag: string): string {
  return AFFECTED_GROUP_LABEL[tag] ?? tag.replace(/-/g, " ");
}

// process_stages.stage_type vocab from tests/.../test_cross_entity_links.py.
// Single source of truth — keep in sync with KNOWN_STAGE_CODES.
export const STAGE_TYPE_LABEL: Record<string, string> = {
  Voting: "Głosowanie",
  CommitteeReport: "Sprawozdanie komisji",
  SenatePosition: "Stanowisko Senatu",
  SenatePositionConsideration: "Rozpatrzenie stanowiska Senatu",
  SejmReading: "Czytanie w Sejmie",
  Reading: "Czytanie",
  FirstReading: "Pierwsze czytanie",
  SecondReading: "Drugie czytanie",
  ThirdReading: "Trzecie czytanie",
  ReadingReferral: "Skierowanie do czytania",
  Referral: "Skierowanie do komisji",
  CommitteeWork: "Prace w komisji",
  ToPresident: "Skierowanie do Prezydenta",
  PresidentSignature: "Podpis Prezydenta",
  Opinion: "Opinia",
  Veto: "Weto",
  Amendment: "Poprawka",
  Procedural: "Procedura",
  Election: "Wybór",
  Motion: "Wniosek",
  End: "Zakończenie",
};

export function stageTypeLabel(t: string): string {
  return STAGE_TYPE_LABEL[t] ?? t;
}

// Display chip for the current state of a Sejm process. Per
// .claude/skills/polski-proces-legislacyjny: "passed by Sejm" ≠ "in Dz.U."
// — bills can still be vetoed, struck down by TK, or sit unsigned.
// Without a publication signal in the event payload we honestly label
// passed bills "Uchwalono przez Sejm", not "Obowiązuje".
export type ProcessChip = { label: string; kind: "ok" | "info" | "warn" };

export function processChip(
  currentStageType: string | null | undefined,
  processPassed: boolean | null | undefined,
): ProcessChip | null {
  if (processPassed) return { label: "Uchwalono przez Sejm", kind: "ok" };
  switch (currentStageType) {
    case "PresidentSignature":
    case "ToPresident":
      return { label: "U Prezydenta", kind: "info" };
    case "Veto":
      return { label: "Weto Prezydenta", kind: "warn" };
    case "SenatePosition":
    case "SenatePositionConsideration":
      return { label: "W Senacie", kind: "info" };
    case "CommitteeReport":
      return { label: "Sprawozdanie komisji", kind: "info" };
    case "ThirdReading":
      return { label: "Trzecie czytanie", kind: "info" };
    case "SecondReading":
      return { label: "Drugie czytanie", kind: "info" };
    case "FirstReading":
    case "Reading":
    case "SejmReading":
    case "ReadingReferral":
      return { label: "Pierwsze czytanie", kind: "info" };
    case "CommitteeWork":
    case "Referral":
      return { label: "W komisji", kind: "info" };
    default:
      return null;
  }
}
