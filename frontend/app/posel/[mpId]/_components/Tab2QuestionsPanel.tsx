import type { MpQuestionsStats, MpQuestionRow } from "@/lib/db/posel-tabs";
import { PoselInterpellationsListClient } from "./PoselInterpellationsListClient";

function KpiTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="py-4 px-4 border border-border" style={{ background: "var(--muted)" }}>
      <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-1.5 flex items-center gap-1.5">
        {color && <span className="inline-block w-2 h-2 rounded-sm" style={{ background: color }} />}
        {label}
      </div>
      <div
        className="font-serif font-medium leading-none mb-1.5 tracking-[-0.025em] text-foreground"
        style={{ fontSize: "clamp(1.6rem, 3vw, 2.1rem)" }}
      >
        {value}
      </div>
      <div className="font-mono text-[10.5px] text-muted-foreground tracking-wide">{sub}</div>
    </div>
  );
}

function RecipientBars({ items }: { items: Array<{ name: string; count: number }> }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="border border-border p-5" style={{ background: "var(--muted)" }}>
      <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-4">
        Adresaci interpelacji
      </div>
      <ul>
        {items.map((it) => {
          const pct = (it.count / max) * 100;
          return (
            <li key={it.name} className="mb-3 last:mb-0">
              <div className="flex items-baseline justify-between mb-1 gap-3">
                <span className="font-serif text-[14px] text-foreground leading-snug truncate">
                  {it.name.replace(/^minister\s+/i, "min. ")}
                </span>
                <span className="font-mono text-[12px] text-foreground font-semibold">{it.count}</span>
              </div>
              <div className="h-2 border border-border relative" style={{ background: "var(--background)" }}>
                <div
                  className="absolute left-0 top-0 bottom-0"
                  style={{ width: `${pct}%`, background: "var(--destructive)", opacity: 0.85 }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Tab2QuestionsPanel({
  stats,
  initialRows,
  mpId,
}: {
  stats: MpQuestionsStats;
  initialRows: MpQuestionRow[];
  mpId: number;
}) {
  if (stats.total === 0) {
    return (
      <p className="font-serif italic text-muted-foreground text-center py-12">
        Ten poseł nie złożył jeszcze interpelacji ani zapytań w tej kadencji.
      </p>
    );
  }

  const onTime = stats.total - stats.delayedCount;
  const onTimePct = stats.total > 0 ? (onTime / stats.total) * 100 : 0;

  return (
    <div className="grid gap-7">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiTile
          label="Złożone"
          value={stats.total.toLocaleString("pl-PL")}
          sub="interpelacji i zapytań"
          color="var(--destructive)"
        />
        <KpiTile
          label="Z odpowiedzią w terminie"
          value={`${onTimePct.toFixed(0)}%`}
          sub={`${onTime} z ${stats.total}`}
          color="var(--success)"
        />
        <KpiTile
          label="Spóźnionych odpowiedzi"
          value={stats.delayedCount.toString()}
          sub={
            stats.avgDelayDays != null
              ? `średnio ${Math.round(stats.avgDelayDays)} dni opóźnienia`
              : "termin >30 dni"
          }
          color="var(--warning)"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_1.2fr] items-start">
        <RecipientBars items={stats.recipientsTop} />

        <div>
          <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-3">
            Interpelacje i zapytania (najnowsze wpisy)
          </div>
          <PoselInterpellationsListClient mpId={mpId} initialRows={initialRows} total={stats.total} />
        </div>
      </div>
    </div>
  );
}
