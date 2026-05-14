import { stageLabel } from "@/lib/stages";
import type { ProceedingPoint, ProceedingPointStage } from "@/lib/db/prints";

function SectionHead({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div className="mb-5 flex items-baseline gap-4 border-b border-border pb-3">
      <h2
        className="font-serif font-medium text-foreground m-0"
        style={{ fontSize: 22, lineHeight: 1, letterSpacing: "-0.015em" }}
      >
        {title}
      </h2>
      {subtitle && (
        <span className="font-sans text-[11.5px] text-muted-foreground ml-auto">{subtitle}</span>
      )}
    </div>
  );
}

function pluralPosiedzen(n: number): string {
  if (n === 1) return "1 posiedzenie";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} posiedzenia`;
  return `${n} posiedzeń`;
}

function pluralWypowiedzi(n: number): string {
  if (n === 1) return "1 wypowiedź";
  return `${n} wypowiedzi`;
}

function formatSittingDates(dates: string[]): string {
  if (dates.length === 0) return "—";
  const fmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  if (dates.length === 1) return fmt.format(new Date(dates[0]));
  const first = new Date(dates[0]);
  const last = new Date(dates[dates.length - 1]);
  const sameYear = first.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && first.getMonth() === last.getMonth();
  if (sameMonth) {
    const monthYear = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(first);
    return `${first.getDate()}–${last.getDate()} ${monthYear}`;
  }
  return `${fmt.format(first)} – ${fmt.format(last)}`;
}

// Collapse a stage row to a short badge string. stage_name carries the
// czytanie ordinal ("I czytanie / II czytanie / III czytanie") that
// stage_type alone loses, so we prefer it when the name disambiguates.
function stageBadge(stage: ProceedingPointStage): string {
  return stageLabel(stage.stageType, stage.stageName);
}

// Same stage_type often repeats per sitting (e.g. 2x "Voting" on different
// votings within the same SejmReading). Collapse exact duplicates to keep
// the badge row compact. Order preserved by first occurrence.
function dedupBadges(stages: ProceedingPointStage[]): { label: string; date: string | null }[] {
  const seen = new Set<string>();
  const out: { label: string; date: string | null }[] = [];
  for (const s of stages) {
    const label = stageBadge(s);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, date: s.stageDate });
  }
  return out;
}

type SittingGroup = {
  sittingNum: number;
  sittingTitle: string;
  sittingDates: string[];
  points: ProceedingPoint[];
};

function groupBySitting(points: ProceedingPoint[]): SittingGroup[] {
  const byNum = new Map<number, SittingGroup>();
  for (const p of points) {
    let g = byNum.get(p.sittingNum);
    if (!g) {
      g = {
        sittingNum: p.sittingNum,
        sittingTitle: p.sittingTitle,
        sittingDates: p.sittingDates,
        points: [],
      };
      byNum.set(p.sittingNum, g);
    }
    g.points.push(p);
  }
  return Array.from(byNum.values()).sort((a, b) => a.sittingNum - b.sittingNum);
}

export function ProceedingPoints({ points }: { points: ProceedingPoint[] }) {
  if (points.length === 0) return null;
  const groups = groupBySitting(points);

  return (
    <section className="py-12 px-3 md:px-4 lg:px-5 border-b border-border">
      <div className="max-w-[1280px] mx-auto">
        <SectionHead
          title="Punkty obrad plenarnych"
          subtitle={pluralPosiedzen(groups.length)}
        />

        <ol className="list-none p-0 m-0">
          {groups.map((g) => (
            <SittingGroupRow key={g.sittingNum} group={g} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function StageBadge({ label }: { label: string }) {
  return (
    <span
      className="font-sans uppercase shrink-0"
      style={{
        fontSize: 10,
        letterSpacing: "0.08em",
        color: "var(--destructive-deep)",
        background: "var(--muted)",
        border: "1px solid var(--border)",
        padding: "2px 6px",
        borderRadius: 2,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function SittingGroupRow({ group }: { group: SittingGroup }) {
  // All badges across all points in this sitting — stages attach to the
  // first point of each sitting by the dataloader contract, but render at
  // sitting level so they're visible even on stage-only rows (no agenda).
  const allStages = group.points.flatMap((p) => p.stages);
  const badges = dedupBadges(allStages);

  return (
    <li className="py-5 border-b border-border last:border-b-0">
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <h3
          className="font-serif font-medium m-0 text-foreground"
          style={{ fontSize: 18, letterSpacing: "-0.005em" }}
        >
          Posiedzenie nr {group.sittingNum}
        </h3>
        <span
          className="font-mono uppercase"
          style={{ fontSize: 10, color: "var(--muted-foreground)", letterSpacing: "0.12em" }}
        >
          {formatSittingDates(group.sittingDates)}
        </span>
        {badges.length > 0 && (
          <div className="flex gap-1.5 flex-wrap ml-auto">
            {badges.map((b) => (
              <StageBadge key={b.label} label={b.label} />
            ))}
          </div>
        )}
      </div>

      <ul className="list-none p-0 m-0 space-y-2">
        {group.points.map((p, i) => {
          // Stage-only synthetic point: no ord, no title. Skip the row —
          // the badges in the header already convey "był procedowany".
          if (p.agendaItemId === null) return null;
          return (
            <li
              key={p.agendaItemId ?? `stage-${i}`}
              className="flex items-baseline gap-3"
              style={{ paddingLeft: 4 }}
            >
              {p.ord !== null && (
                <span
                  className="font-mono text-muted-foreground shrink-0"
                  style={{ fontSize: 12, minWidth: 28 }}
                >
                  pkt {p.ord}
                </span>
              )}
              <span
                className="font-serif text-secondary-foreground flex-1"
                style={{ fontSize: 14.5, lineHeight: 1.5, textWrap: "pretty" as never }}
              >
                {p.title}
              </span>
              {p.statementCount > 0 && (
                <span
                  className="font-sans text-muted-foreground shrink-0"
                  style={{ fontSize: 11, letterSpacing: "0.02em" }}
                >
                  {pluralWypowiedzi(p.statementCount)}
                </span>
              )}
            </li>
          );
        })}
        {group.points.every((p) => p.agendaItemId === null) && (
          <li
            className="font-serif italic text-muted-foreground"
            style={{ fontSize: 13, paddingLeft: 4 }}
          >
            Procedowany bez wpisu w porządku obrad — etapy procesu poniżej.
          </li>
        )}
      </ul>
    </li>
  );
}
