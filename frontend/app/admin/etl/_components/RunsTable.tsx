import { ChevronRightIcon } from "lucide-react";

import type { EtlRun, EtlStep } from "@/lib/db/etl";
import {
  KeyValueChips,
  StatusBadge,
  elapsedSeconds,
  fmtDateTime,
  fmtDuration,
} from "./format";

// One shared column template so the header strip and every <summary> line up.
const COLS = [
  "w-24 shrink-0", // status
  "w-14 shrink-0", // id
  "w-20 shrink-0", // kind
  "w-14 shrink-0", // term
  "w-44 shrink-0", // started
  "w-28 shrink-0", // duration
  "w-24 shrink-0", // git sha
  "w-24 shrink-0", // host
  "min-w-0 flex-1", // failed steps
];

const HEADERS = [
  "status",
  "id",
  "rodzaj",
  "kad.",
  "start",
  "czas",
  "commit",
  "host",
  "kroki z błędem",
];

function ErrorBlock({ text }: { text: string }) {
  return (
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-red-500/5 p-2 font-mono text-[11px] leading-snug text-red-700 dark:bg-red-400/10 dark:text-red-300">
      {text}
    </pre>
  );
}

function StepsTable({ steps }: { steps: EtlStep[] }) {
  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground italic">Brak zapisanych kroków.</p>;
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <th className="py-1.5 pr-3 font-normal">krok</th>
          <th className="py-1.5 pr-3 font-normal">status</th>
          <th className="py-1.5 pr-3 font-normal">czas</th>
          <th className="py-1.5 font-normal">liczniki</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((step) => (
          <tr key={step.name} className="border-b border-border/60 align-top last:border-0">
            <td className="py-2 pr-3 font-mono text-[12px] whitespace-nowrap">{step.name}</td>
            <td className="py-2 pr-3">
              <StatusBadge status={step.status} />
            </td>
            <td className="py-2 pr-3 font-mono text-[12px] whitespace-nowrap tabular-nums">
              {fmtDuration(step.duration_s)}
            </td>
            <td className="py-2 min-w-0">
              <KeyValueChips entries={Object.entries(step.counts ?? {})} empty="—" />
              {step.error && (
                <div className="mt-2">
                  <ErrorBlock text={step.error} />
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RunRow({ run }: { run: EtlRun }) {
  const failed = run.steps.filter((s) => s.status === "failed");
  const duration = run.finished_at
    ? fmtDuration(elapsedSeconds(run.started_at, run.finished_at))
    : "w toku";

  return (
    <details className="group border-b border-border last:border-0 open:bg-muted/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <span className={COLS[0]}>
          <StatusBadge status={run.status} />
        </span>
        <span className={`${COLS[1]} font-mono text-[12px] tabular-nums`}>#{run.id}</span>
        <span className={`${COLS[2]} font-mono text-[12px]`}>{run.kind}</span>
        <span className={`${COLS[3]} font-mono text-[12px] tabular-nums`}>
          {run.term ?? "—"}
        </span>
        <span className={`${COLS[4]} font-mono text-[12px] tabular-nums`}>
          {fmtDateTime(run.started_at)}
        </span>
        <span className={`${COLS[5]} font-mono text-[12px] tabular-nums`}>{duration}</span>
        <span className={`${COLS[6]} font-mono text-[12px]`}>{run.git_sha ?? "—"}</span>
        <span className={`${COLS[7]} font-mono text-[12px] truncate`}>{run.host ?? "—"}</span>
        <span className={`${COLS[8]} truncate font-mono text-[12px]`}>
          {failed.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="text-red-700 dark:text-red-300">
              {failed.length}: {failed.map((s) => s.name).join(", ")}
            </span>
          )}
        </span>
      </summary>

      <div className="space-y-4 border-t border-border/60 px-2 py-4 sm:px-8">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Argumenty
          </div>
          <KeyValueChips entries={Object.entries(run.args ?? {})} empty="brak" />
        </div>

        {run.errors.length > 0 && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Błędy przebiegu ({run.errors.length})
            </div>
            <div className="space-y-2">
              {run.errors.map((e, i) => (
                <div key={`${e.step}-${i}`}>
                  <div className="font-mono text-[11px] mb-1">{e.step}</div>
                  <ErrorBlock text={e.error} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Kroki ({run.steps.length})
          </div>
          <StepsTable steps={run.steps} />
        </div>
      </div>
    </details>
  );
}

export function RunsTable({ runs }: { runs: EtlRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="border border-border p-6 text-sm text-muted-foreground">
        Brak przebiegów dla wybranych filtrów.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-border">
      <div className="min-w-[980px]">
        <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="size-3.5 shrink-0" />
          {HEADERS.map((h, i) => (
            <span key={h} className={COLS[i]}>
              {h}
            </span>
          ))}
        </div>
        {runs.map((run) => (
          <RunRow key={run.id} run={run} />
        ))}
      </div>
    </div>
  );
}
