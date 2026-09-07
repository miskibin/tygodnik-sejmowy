import "server-only";

import { supabase } from "@/lib/supabase";

// Reader for the updater's run ledger (migration 0105): `python -m supagraf
// daily` writes one etl_runs row per run with per-step timings/counters as
// jsonb, and etl_cursors holds the delta high-water marks. Read-only.

export type EtlRunStatus = "running" | "ok" | "partial" | "failed";
export type EtlStepStatus = "running" | "ok" | "failed" | "skipped";

export type EtlStep = {
  name: string;
  status: EtlStepStatus | string;
  duration_s: number | null;
  /** Arbitrary per-step counters; values may be nested objects/arrays. */
  counts: Record<string, unknown> | null;
  error: string | null;
};

export type EtlRunError = { step: string; error: string };

export type EtlRun = {
  id: number;
  kind: string;
  term: number | null;
  status: EtlRunStatus | string;
  started_at: string;
  finished_at: string | null;
  args: Record<string, unknown> | null;
  steps: EtlStep[];
  errors: EtlRunError[];
  host: string | null;
  git_sha: string | null;
};

export type EtlCursor = {
  name: string;
  value: string;
  updated_at: string;
};

type RawRun = {
  id: number;
  kind: string | null;
  term: number | null;
  status: string | null;
  started_at: string;
  finished_at: string | null;
  args: unknown;
  steps: unknown;
  errors: unknown;
  host: string | null;
  git_sha: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Key order is preserved as delivered by the API. Note that Postgres `jsonb`
// normalises object keys (by length, then bytewise), so this is a stable order
// but not the updater's execution order — that is lost at write time.
function parseSteps(raw: unknown): EtlStep[] {
  if (!isRecord(raw)) return [];
  // jsonb normalises key order, so the writer stamps each step with `seq`
  // (its execution index). Rows from before that stamp keep API order.
  const entries = Object.entries(raw).map(([name, value], i) => {
    const step = isRecord(value) ? value : {};
    return { name, step, seq: typeof step.seq === "number" ? step.seq : i };
  });
  entries.sort((a, b) => a.seq - b.seq);
  return entries.map(({ name, step }) => {
    const counts = isRecord(step.counts) ? step.counts : null;
    return {
      name,
      status: typeof step.status === "string" ? step.status : "unknown",
      duration_s: typeof step.duration_s === "number" ? step.duration_s : null,
      counts,
      error: typeof step.error === "string" ? step.error : null,
    };
  });
}

function parseErrors(raw: unknown): EtlRunError[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    return [
      {
        step: typeof entry.step === "string" ? entry.step : "?",
        error: typeof entry.error === "string" ? entry.error : String(entry.error ?? ""),
      },
    ];
  });
}

function toRun(row: RawRun): EtlRun {
  return {
    id: row.id,
    kind: row.kind ?? "?",
    term: row.term,
    status: row.status ?? "unknown",
    started_at: row.started_at,
    finished_at: row.finished_at,
    args: isRecord(row.args) ? row.args : null,
    steps: parseSteps(row.steps),
    errors: parseErrors(row.errors),
    host: row.host,
    git_sha: row.git_sha,
  };
}

export async function getEtlRuns({
  limit = 50,
  kind,
}: { limit?: number; kind?: string } = {}): Promise<EtlRun[]> {
  let q = supabase()
    .from("etl_runs")
    .select("id,kind,term,status,started_at,finished_at,args,steps,errors,host,git_sha")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (kind) q = q.eq("kind", kind);

  const { data, error } = await q;
  if (error) throw new Error(`etl_runs: ${error.message}`);
  return (data as RawRun[] | null)?.map(toRun) ?? [];
}

export async function getEtlCursors(): Promise<EtlCursor[]> {
  const { data, error } = await supabase()
    .from("etl_cursors")
    .select("name,value,updated_at")
    .order("name", { ascending: true });
  if (error) throw new Error(`etl_cursors: ${error.message}`);
  return (data as EtlCursor[] | null) ?? [];
}
