import type { EtlRun } from "@/lib/db/etl";
import {
  StatusBadge,
  elapsedSeconds,
  fmtDateTime,
  fmtDuration,
  statusClass,
} from "./format";

const SUMMARY_WINDOW = 30;
const STATUS_ORDER = ["ok", "partial", "failed", "running"] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm break-words">{children}</div>
    </div>
  );
}

export function SummaryStrip({ runs }: { runs: EtlRun[] }) {
  const last = runs[0];
  const window = runs.slice(0, SUMMARY_WINDOW);
  const running = runs.find((r) => r.status === "running" && !r.finished_at);

  const counts = new Map<string, number>();
  for (const r of window) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);

  if (!last) {
    return (
      <div className="border border-border bg-muted/40 p-4 sm:p-5 text-sm text-muted-foreground">
        Brak przebiegów w rejestrze <code className="font-mono">etl_runs</code>.
      </div>
    );
  }

  const lastDuration = elapsedSeconds(last.started_at, last.finished_at);

  return (
    <section className="border border-border bg-muted/40">
      <div className="grid gap-4 p-4 sm:p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Ostatni przebieg">
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={last.status} />
            <span className="font-mono text-[12px]">
              #{last.id} · {last.kind}
              {last.term !== null ? ` · kad. ${last.term}` : ""}
            </span>
          </span>
        </Field>
        <Field label="Start / czas">
          <span className="font-mono text-[12px]">
            {fmtDateTime(last.started_at)}
            {" · "}
            {last.finished_at ? fmtDuration(lastDuration) : "w toku"}
          </span>
        </Field>
        <Field label="Wersja / host">
          <span className="font-mono text-[12px]">
            {last.git_sha ?? "—"} @ {last.host ?? "—"}
          </span>
        </Field>
        <Field label={`Statusy (ostatnie ${window.length})`}>
          <span className="flex flex-wrap gap-1.5">
            {STATUS_ORDER.filter((s) => counts.has(s)).map((s) => (
              <span
                key={s}
                className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${statusClass(s)}`}
              >
                {s} {counts.get(s)}
              </span>
            ))}
          </span>
        </Field>
      </div>

      {running && (
        <div className="border-t border-border px-4 sm:px-5 py-2.5 font-mono text-[12px] text-blue-700 dark:text-blue-300">
          Trwa przebieg #{running.id} ({running.kind}) — od{" "}
          {fmtDateTime(running.started_at)}, już{" "}
          {fmtDuration(elapsedSeconds(running.started_at, null))}.
        </div>
      )}
    </section>
  );
}
