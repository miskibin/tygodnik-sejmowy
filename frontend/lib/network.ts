export type NetworkNode = {
  mp_id: number;
  name: string;
  current_club: string | null;
  active: boolean;
  photo_url?: string | null;
};
export type Evidence = { date: string | null; title: string; url: string };
export type QuestionEdge = {
  a: number; b: number; weight: number; coauthored_count: number; evidence: Evidence[];
};
export type VoteEdge = {
  a: number; b: number; n: number; agreement: number;
  baseline_agreement: number; excess: number; evidence: Evidence[];
};
export type NetworkSnapshot = {
  schema_version: "1";
  term: number;
  generated_at: string;
  window: { days: number; from: string; to: string };
  sampling: {
    questions: { selected: number; scan_limit: number; with_multiple_authors: number };
    votings: { eligible: number; selected: number; limit: number; selection: string };
  };
  nodes: NetworkNode[];
  layers: {
    questions: { edges: QuestionEdge[] };
    votes: { edges: VoteEdge[]; mp_deviations: { mp_id: number; n: number; deviations: number; rate: number }[] };
  };
  limitations: string[];
};

export function isNetworkSnapshot(value: unknown): value is NetworkSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<NetworkSnapshot>;
  return v.schema_version === "1" && typeof v.term === "number"
    && typeof v.generated_at === "string" && !Number.isNaN(Date.parse(v.generated_at))
    && !!v.window && typeof v.window.days === "number" && typeof v.window.from === "string" && typeof v.window.to === "string"
    && Array.isArray(v.nodes) && v.nodes.every(n => Number.isInteger(n.mp_id) && typeof n.name === "string" && (n.current_club === null || typeof n.current_club === "string"))
    && Array.isArray(v.layers?.questions?.edges) && v.layers.questions.edges.every(e => Number.isInteger(e.a) && Number.isInteger(e.b) && Number.isFinite(e.weight) && Number.isInteger(e.coauthored_count) && validEvidence(e.evidence))
    && Array.isArray(v.layers?.votes?.edges) && v.layers.votes.edges.every(e => Number.isInteger(e.a) && Number.isInteger(e.b) && Number.isInteger(e.n) && Number.isFinite(e.agreement) && Number.isFinite(e.baseline_agreement) && Number.isFinite(e.excess) && validEvidence(e.evidence))
    && Array.isArray(v.layers?.votes?.mp_deviations) && v.layers.votes.mp_deviations.every(d => Number.isInteger(d.mp_id) && Number.isInteger(d.n) && Number.isInteger(d.deviations))
    && Number.isInteger(v.sampling?.questions?.selected) && Number.isInteger(v.sampling?.questions?.scan_limit)
    && Number.isInteger(v.sampling?.votings?.selected) && Number.isInteger(v.sampling?.votings?.limit)
    && Array.isArray(v.limitations) && v.limitations.every(l => typeof l === "string");
}

function validEvidence(value: unknown): value is Evidence[] {
  return Array.isArray(value) && value.every(e => e && typeof e.title === "string" && typeof e.url === "string" && (e.date === null || typeof e.date === "string"));
}

export function sourceUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && (parsed.hostname === "api.sejm.gov.pl" || parsed.hostname === "www.sejm.gov.pl" || parsed.hostname === "sejm.gov.pl")) return url;
  } catch { /* Malformed source must never become an executable link. */ }
  return undefined;
}
