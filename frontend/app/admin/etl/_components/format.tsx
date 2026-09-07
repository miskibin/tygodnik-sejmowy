import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PL_DATETIME = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Warsaw",
});

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return PL_DATETIME.format(d);
}

/** Elapsed seconds between two timestamps, or null when either is unusable. */
export function elapsedSeconds(from: string, to: string | null): number | null {
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return (end - start) / 1000;
}

export function fmtDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds.toFixed(1).replace(".", ",")} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m} min ${s} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

// Tailwind palette rather than the site's --success/--warning tokens: these
// need a tinted background as well as a foreground, and both halves have to
// stay legible in the dark theme.
const STATUS_CLASS: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  partial: "bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  failed: "bg-red-500/10 text-red-700 dark:bg-red-400/15 dark:text-red-300",
  running: "bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  skipped: "bg-muted text-muted-foreground",
};

export const STATUS_LABEL: Record<string, string> = {
  ok: "ok",
  partial: "częściowo",
  failed: "błąd",
  running: "w toku",
  skipped: "pominięty",
};

export function statusClass(status: string): string {
  return STATUS_CLASS[status] ?? "bg-muted text-muted-foreground";
}

// Solid fills for the duration bars — the badge classes carry a tinted
// background plus a dark foreground, which reads as mud at full opacity.
const STATUS_FILL: Record<string, string> = {
  ok: "bg-emerald-600 dark:bg-emerald-400",
  partial: "bg-amber-500 dark:bg-amber-400",
  failed: "bg-red-600 dark:bg-red-400",
  running: "bg-blue-600 dark:bg-blue-400",
};

export function statusFill(status: string): string {
  return STATUS_FILL[status] ?? "bg-muted-foreground/40";
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-mono text-[11px] tracking-wide",
        statusClass(status),
        className
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/** Compact `key=value` rendering; nested values fall back to JSON. */
export function formatCountValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString("pl-PL");
  if (typeof value === "boolean") return value ? "tak" : "nie";
  if (typeof value === "string") return value;
  const json = JSON.stringify(value);
  return json.length > 160 ? `${json.slice(0, 157)}…` : json;
}

export function KeyValueChips({
  entries,
  empty = "brak",
}: {
  entries: Array<[string, unknown]>;
  empty?: string;
}) {
  if (entries.length === 0) {
    return <span className="font-mono text-[11px] text-muted-foreground italic">{empty}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex max-w-full items-baseline gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-tight"
        >
          <span className="text-muted-foreground">{k}</span>
          <span className="break-all">{formatCountValue(v)}</span>
        </span>
      ))}
    </div>
  );
}
