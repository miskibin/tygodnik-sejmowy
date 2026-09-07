import type { EtlRun } from "@/lib/db/etl";
import { elapsedSeconds, fmtDuration, statusFill } from "./format";

const MAX_BARS = 30;
const MIN_BAR_PCT = 6;

// Deliberately not recharts: a bar per run with a status tint is the whole
// chart, and a plain div strip keeps this page free of client-side JS.
export function DurationStrip({ runs }: { runs: EtlRun[] }) {
  const bars = runs
    .slice(0, MAX_BARS)
    .map((r) => ({
      run: r,
      seconds: elapsedSeconds(r.started_at, r.finished_at) ?? 0,
    }))
    .reverse();

  if (bars.length < 2) return null;

  const max = Math.max(...bars.map((b) => b.seconds), 1);

  return (
    <section className="mt-6">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Czas trwania · {bars.length} ostatnich przebiegów (max {fmtDuration(max)})
      </div>
      <div className="flex h-16 items-end gap-1 border-b border-border">
        {bars.map(({ run, seconds }) => (
          <div
            key={run.id}
            title={`#${run.id} · ${run.kind} · ${run.status} · ${fmtDuration(seconds)}`}
            className={`min-w-[6px] flex-1 rounded-t-sm ${statusFill(run.status)}`}
            style={{ height: `${Math.max(MIN_BAR_PCT, (seconds / max) * 100)}%` }}
          />
        ))}
      </div>
    </section>
  );
}
