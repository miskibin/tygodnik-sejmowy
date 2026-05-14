import type { ProceedingPoint } from "@/lib/db/prints";

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

function pluralPunktow(n: number): string {
  if (n === 1) return "1 punkt";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} punkty`;
  return `${n} punktów`;
}

function pluralWypowiedzi(n: number): string {
  if (n === 1) return "1 wypowiedź";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} wypowiedzi`;
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

function SittingGroupRow({ group }: { group: SittingGroup }) {
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
        <span className="font-sans text-[11px] text-muted-foreground ml-auto">
          {pluralPunktow(group.points.length)}
        </span>
      </div>

      <ul className="list-none p-0 m-0 space-y-2">
        {group.points.map((p) => (
          <li
            key={p.agendaItemId}
            className="flex items-baseline gap-3"
            style={{ paddingLeft: 4 }}
          >
            <span
              className="font-mono text-muted-foreground shrink-0"
              style={{ fontSize: 12, minWidth: 28 }}
            >
              pkt {p.ord}
            </span>
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
        ))}
      </ul>
    </li>
  );
}
