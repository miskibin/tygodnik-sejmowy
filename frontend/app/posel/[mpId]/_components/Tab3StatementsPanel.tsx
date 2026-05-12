import type { MpStatementsStats, MpStatementRow } from "@/lib/db/posel-tabs";
import { PoselStatementsListClient } from "./PoselStatementsListClient";
import { EventMarkers } from "@/components/charts/EventMarkers";
import { getEventsForMp, type TimelineEvent } from "@/lib/timeline-events";

const PL_MONTHS = ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"];

function formatYM(ym: string): string {
  const m = Number(ym.slice(5, 7));
  const y = ym.slice(2, 4);
  return `${PL_MONTHS[m - 1]} '${y}`;
}

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

function ActivityChart({
  monthly,
  events,
}: {
  monthly: Array<{ ym: string; count: number }>;
  events: TimelineEvent[];
}) {
  if (monthly.length === 0) return null;
  const W = 920;
  const H = 200;
  const padL = 36;
  const padB = 26;
  const padT = 14;
  const max = Math.max(...monthly.map((m) => m.count), 1);
  const niceMax = Math.max(5, Math.ceil(max / 5) * 5);
  const innerW = W - padL - 6;
  const innerH = H - padT - padB;
  const stepX = monthly.length > 1 ? innerW / (monthly.length - 1) : 0;
  const ymIndex = new Map(monthly.map((m, i) => [m.ym, i]));
  const lastIdx = monthly.length - 1;
  const xForDate = (iso: string): number | null => {
    const i = ymIndex.get(iso.slice(0, 7));
    if (i === undefined) return null;
    if (monthly.length <= 1) return padL + innerW / 2;
    const day = Number(iso.slice(8, 10)) || 1;
    const frac = Math.min(1, Math.max(0, (day - 1) / 30));
    // Anchors sit at i*stepX; the last anchor is the right edge. Clamp the
    // intra-month offset so markers in the final bucket never overshoot it.
    const pos = i === lastIdx ? lastIdx : i + frac;
    return padL + pos * stepX;
  };
  const yScale = (v: number) => H - padB - (v / niceMax) * innerH;
  const points = monthly.map((m, i) => ({
    x: padL + i * stepX,
    y: yScale(m.count),
    v: m.count,
    ym: m.ym,
  }));
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${H - padB} L ${points[0].x} ${H - padB} Z`;
  const ticks = [0, niceMax / 2, niceMax];

  return (
    <div className="border border-border p-5" style={{ background: "var(--muted)" }}>
      <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-3">
        Wystąpienia w czasie
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full block"
        style={{ overflow: "visible" }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} y1={yScale(t)} x2={W - 4} y2={yScale(t)} stroke="var(--border)" strokeDasharray="2,3" />
            <text
              x={padL - 6}
              y={yScale(t) + 3}
              textAnchor="end"
              fontFamily="ui-monospace"
              fontSize="9"
              fill="var(--muted-foreground)"
            >
              {Math.round(t)}
            </text>
          </g>
        ))}
        <path d={areaD} fill="var(--destructive)" opacity="0.08" />
        <path d={pathD} fill="none" stroke="var(--destructive)" strokeWidth="1.5" />
        <EventMarkers
          events={events
            .map((e) => ({ ...e, x: xForDate(e.date) }))
            .filter((e): e is typeof e & { x: number } => e.x != null)}
          yTop={padT}
          yBottom={H - padB}
          variant="full"
          chartWidth={W}
        />
        {points.map((p) => (
          <g key={p.ym}>
            <circle cx={p.x} cy={p.y} r={3.5} fill="var(--background)" stroke="var(--destructive)" strokeWidth="1.5">
              <title>
                {formatYM(p.ym)}: {p.v} wystąpień
              </title>
            </circle>
            <text
              x={p.x}
              y={H - padB + 16}
              textAnchor="middle"
              fontFamily="ui-monospace"
              fontSize="10"
              fill="var(--muted-foreground)"
              letterSpacing="0.05em"
            >
              {formatYM(p.ym)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function Tab3StatementsPanel({
  stats,
  initialRows,
  mpId,
  klubRef,
}: {
  stats: MpStatementsStats;
  initialRows: MpStatementRow[];
  mpId: number;
  klubRef: string | null;
}) {
  if (stats.total === 0) {
    return (
      <p className="font-serif italic text-muted-foreground text-center py-12">
        Ten poseł nie wystąpił jeszcze na posiedzeniach Sejmu w tej kadencji.
      </p>
    );
  }
  const events = getEventsForMp({ klubRef });
  const avgPerProc =
    stats.proceedingsTouched > 0
      ? (stats.total / stats.proceedingsTouched).toFixed(1).replace(".", ",")
      : "—";
  const longestKchars = Math.round(stats.longest / 1000);

  return (
    <div className="grid gap-7">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiTile
          label="Wystąpień łącznie"
          value={stats.total.toLocaleString("pl-PL")}
          sub={`na ${stats.proceedingsTouched} posiedzeniach`}
          color="var(--destructive)"
        />
        <KpiTile
          label="Średnio na posiedzenie"
          value={avgPerProc}
          sub="wystąpień"
          color="var(--warning)"
        />
        <KpiTile
          label="Najdłuższe wystąpienie"
          value={longestKchars > 0 ? `${longestKchars}k` : stats.longest.toString()}
          sub="znaków tekstu"
          color="var(--success)"
        />
      </div>

      <ActivityChart monthly={stats.monthly} events={events} />

      <div>
        <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-3">
          Wystąpienia chronologicznie
        </div>
        <PoselStatementsListClient mpId={mpId} initialRows={initialRows} total={stats.total} />
      </div>
    </div>
  );
}
