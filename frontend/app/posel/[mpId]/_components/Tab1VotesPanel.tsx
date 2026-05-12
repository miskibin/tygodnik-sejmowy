import type { MpVotesData, MpVoteRow, VoteValue } from "@/lib/db/posel-tabs";
import { VotesList } from "./VotesList";
import { EventMarkers } from "@/components/charts/EventMarkers";
import { getEventsForMp, type TimelineEvent } from "@/lib/timeline-events";

// Maps an ISO date onto a monthly bar chart: locate its YYYY-MM bucket,
// then position by day-of-month within that column. Out-of-window = null.
function makeMonthlyXFor(yms: string[], padL: number, colW: number) {
  if (yms.length === 0) return () => null;
  const idx = new Map(yms.map((ym, i) => [ym, i]));
  return (iso: string): number | null => {
    const ym = iso.slice(0, 7);
    const i = idx.get(ym);
    if (i === undefined) return null;
    const day = Number(iso.slice(8, 10)) || 1;
    const frac = Math.min(1, Math.max(0, (day - 1) / 30));
    return padL + (i + frac) * colW;
  };
}

const PL_MONTHS = ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"];

const VOTE_COLOR: Record<VoteValue, string> = {
  YES: "var(--success)",
  NO: "var(--destructive)",
  ABSTAIN: "var(--warning)",
  ABSENT: "var(--muted-foreground)",
  PRESENT: "var(--muted-foreground)",
};

const VOTE_LABEL: Record<VoteValue, string> = {
  YES: "Za",
  NO: "Przeciw",
  ABSTAIN: "Wstrzymał się",
  ABSENT: "Nieobecny",
  PRESENT: "Obecny",
};

function formatYM(ym: string): string {
  const m = Number(ym.slice(5, 7));
  const y = ym.slice(2, 4);
  return `${PL_MONTHS[m - 1]} '${y}`;
}

function KpiTile({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="py-4 px-4 border border-border" style={{ background: "var(--muted)" }}>
      <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-1.5 flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-sm" style={{ background: color }} />
        {label}
      </div>
      <div
        className="font-serif font-medium leading-none mb-1.5 tracking-[-0.025em] text-foreground"
        style={{ fontSize: "clamp(1.6rem, 3vw, 2.1rem)" }}
      >
        {count.toLocaleString("pl-PL")}
      </div>
      <div className="font-mono text-[10.5px] text-muted-foreground tracking-wide">
        {pct.toFixed(1).replace(".", ",")}% z {total.toLocaleString("pl-PL")}
      </div>
    </div>
  );
}

function MonthlyChart({
  monthly,
  events,
}: {
  monthly: Array<{ ym: string; yes: number; no: number; abstain: number; absent: number }>;
  events: TimelineEvent[];
}) {
  if (monthly.length === 0) return null;
  const W = 920;
  const H = 220;
  const padL = 38;
  const padB = 26;
  const padT = 10;
  const colsCount = monthly.length;
  const colW = (W - padL - 6) / colsCount;
  const xForDate = makeMonthlyXFor(monthly.map((m) => m.ym), padL, colW);
  const max = Math.max(...monthly.map((m) => m.yes + m.no + m.abstain + m.absent), 1);
  const niceMax = Math.ceil(max / 50) * 50 || max;
  const yScale = (v: number) => (v / niceMax) * (H - padT - padB);
  const ticks = [0, niceMax / 2, niceMax];

  return (
    <div className="border border-border p-5" style={{ background: "var(--muted)" }}>
      <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-3">
        Rozkład głosów w czasie
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
        {ticks.map((t) => {
          const y = H - padB - yScale(t);
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={W - 4} y2={y} stroke="var(--border)" strokeDasharray="2,3" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontFamily="ui-monospace" fontSize="9" fill="var(--muted-foreground)">
                {Math.round(t)}
              </text>
            </g>
          );
        })}
        {monthly.map((m, i) => {
          const x = padL + i * colW + 3;
          const w = Math.max(2, colW - 6);
          const y0 = H - padB;
          let yCursor = y0;
          const segs: Array<{ key: VoteValue | "ABSENT"; v: number; color: string }> = [
            { key: "YES", v: m.yes, color: "var(--success)" },
            { key: "NO", v: m.no, color: "var(--destructive)" },
            { key: "ABSTAIN", v: m.abstain, color: "var(--warning)" },
            { key: "ABSENT", v: m.absent, color: "var(--muted-foreground)" },
          ];
          return (
            <g key={m.ym}>
              {segs.map((s) => {
                if (s.v <= 0) return null;
                const h = yScale(s.v);
                yCursor -= h;
                return (
                  <rect
                    key={s.key}
                    x={x}
                    y={yCursor}
                    width={w}
                    height={Math.max(0.5, h)}
                    fill={s.color}
                    opacity={0.92}
                  >
                    <title>
                      {VOTE_LABEL[s.key as VoteValue]} {formatYM(m.ym)}: {s.v}
                    </title>
                  </rect>
                );
              })}
              <text
                x={x + w / 2}
                y={H - padB + 16}
                textAnchor="middle"
                fontFamily="ui-monospace"
                fontSize="10"
                fill="var(--muted-foreground)"
                letterSpacing="0.05em"
              >
                {formatYM(m.ym)}
              </text>
            </g>
          );
        })}
        <EventMarkers
          events={events
            .map((e) => ({ ...e, x: xForDate(e.date) }))
            .filter((e): e is typeof e & { x: number } => e.x != null)}
          yTop={padT}
          yBottom={H - padB}
          variant="full"
        />
      </svg>
      <div className="flex flex-wrap gap-3 mt-3 font-sans text-[11px] text-secondary-foreground">
        {(
          [
            { c: "var(--success)", l: "Za" },
            { c: "var(--destructive)", l: "Przeciw" },
            { c: "var(--warning)", l: "Wstrzymał się" },
            { c: "var(--muted-foreground)", l: "Nieobecny" },
          ] as const
        ).map((it) => (
          <span key={it.l} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: it.c }} />
            {it.l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Tab1VotesPanel({
  data,
  klubRef,
}: {
  data: MpVotesData;
  klubRef: string | null;
}) {
  if (data.rows.length === 0) {
    return (
      <p className="font-serif italic text-muted-foreground text-center py-12">
        Brak danych o głosowaniach tego posła w tej kadencji.
      </p>
    );
  }
  const total = data.rows.length;
  const events = getEventsForMp({ klubRef });

  return (
    <div className="grid gap-7">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Za" count={data.totals.yes} total={total} color="var(--success)" />
        <KpiTile label="Przeciw" count={data.totals.no} total={total} color="var(--destructive)" />
        <KpiTile label="Wstrzymał się" count={data.totals.abstain} total={total} color="var(--warning)" />
        <KpiTile label="Nieobecny" count={data.totals.absent + data.totals.present} total={total} color="var(--muted-foreground)" />
      </div>

      <MonthlyChart monthly={data.monthly} events={events} />

      <VotesList rows={data.rows as MpVoteRow[]} dissentCount={data.dissentCount} />
    </div>
  );
}
