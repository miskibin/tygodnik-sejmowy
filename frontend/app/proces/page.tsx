import {
  getThreadsInFlight,
  getPassedProcesses,
  type ProcessSummary,
} from "@/lib/db/threads";
import { stageLabel } from "@/lib/stages";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";

export const metadata = {
  title: "Procesy legislacyjne — Tygodnik Sejmowy",
  description:
    "Wszystkie projekty ustaw w 10. kadencji Sejmu — pogrupowane po fazie procesu. Sejm, Senat, Prezydent, ostatnio uchwalone.",
};

type InFlightKey = "sejm" | "senat" | "prezydent";
type GroupKey = InFlightKey | "uchwalone";

const GROUP_HEADING: Record<GroupKey, string> = {
  sejm: "W Sejmie",
  senat: "W Senacie",
  prezydent: "U Prezydenta",
  uchwalone: "Ostatnio uchwalone",
};

const GROUP_BLURB: Record<GroupKey, string> = {
  sejm: "Projekty po wpłynięciu, w komisjach albo w czytaniach plenarnych.",
  senat: "Sejm zakończył pracę, Senat ma 30 dni na decyzję (20 — budżet, 14 — pilna).",
  prezydent: "Po głosowaniach w obu izbach. Prezydent ma 21 dni (7 — pilna/budżet) na podpis, weto lub TK.",
  uchwalone: "Uchwalone w ciągu ostatnich 90 dni — opublikowane lub czekające na Dz.U.",
};

const SENATE_STAGE_TYPES = new Set([
  "SenatePosition",
  "SenatePositionConsideration",
  "SenateAmendments",
]);

const PRESIDENT_STAGE_TYPES = new Set([
  "ToPresident",
  "PresidentSignature",
  "PresidentVeto",
  "Veto",
  "PresidentMotionConsideration",
  "ConstitutionalTribunal",
]);

function classify(p: ProcessSummary): InFlightKey {
  const t = p.lastStageType ?? "";
  if (SENATE_STAGE_TYPES.has(t)) return "senat";
  if (PRESIDENT_STAGE_TYPES.has(t)) return "prezydent";
  return "sejm";
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

function ProcessRow({ p, passed }: { p: ProcessSummary; passed: boolean }) {
  const days = daysAgo(p.lastStageDate);
  const stageText = stageLabel(p.lastStageType, p.lastStageName);
  return (
    <li className="py-4 border-b border-dotted border-border">
      <a
        href={`/proces/${p.term}/${encodeURIComponent(p.number)}`}
        className="grid gap-x-5 gap-y-1.5 group"
        style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
      >
        <div className="min-w-0">
          <div className="font-sans text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-1.5 flex items-center gap-2 flex-wrap">
            <span className="font-mono tracking-wide normal-case text-destructive">
              druk {p.number}
            </span>
            <span className="text-border">·</span>
            <span>{stageText}</span>
            {days != null && (
              <>
                <span className="text-border">·</span>
                <span className="font-mono tracking-wide normal-case">
                  {passed
                    ? days === 0
                      ? "uchwalono dziś"
                      : `uchwalono ${days} dni temu`
                    : days === 0
                      ? "dziś"
                      : `${days} dni temu`}
                </span>
              </>
            )}
          </div>
          <h2
            className="font-serif font-medium leading-[1.2] text-foreground group-hover:text-destructive transition-colors m-0"
            style={{ fontSize: "clamp(1rem, 1.8vw, 1.25rem)", letterSpacing: "-0.015em" }}
          >
            {p.shortTitle || p.title || `Druk ${p.number}`}
          </h2>
        </div>
        <div className="self-center font-mono text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
          {shortDate(p.lastStageDate)}
        </div>
      </a>
    </li>
  );
}

function GroupSection({
  k,
  items,
  passed,
}: {
  k: GroupKey;
  items: ProcessSummary[];
  passed: boolean;
}) {
  return (
    <section className="mt-10">
      <div className="border-b border-foreground pb-2 mb-1 flex items-baseline justify-between gap-4 flex-wrap">
        <h2
          className="font-serif font-medium m-0 text-foreground"
          style={{ fontSize: 22, letterSpacing: "-0.015em" }}
        >
          {GROUP_HEADING[k]}
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {items.length === 0
            ? "brak"
            : items.length === 1
              ? "1 proces"
              : items.length < 5
                ? `${items.length} procesy`
                : `${items.length} procesów`}
        </span>
      </div>
      <p className="font-sans text-[12px] text-secondary-foreground leading-[1.55] mt-2 mb-3 max-w-[760px]">
        {GROUP_BLURB[k]}
      </p>
      {items.length === 0 ? (
        <p className="font-serif italic text-muted-foreground py-3">
          Brak procesów w tej fazie.
        </p>
      ) : (
        <ul className="mt-1">
          {items.map((p) => (
            <ProcessRow key={`${p.term}-${p.number}`} p={p} passed={passed} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error("[/proces] data fetch failed", err);
    return fallback;
  }
}

export default async function ProcesIndexPage() {
  const [inFlight, passed] = await Promise.all([
    safe(getThreadsInFlight(120, 90), [] as ProcessSummary[]),
    safe(getPassedProcesses(50, 90), [] as ProcessSummary[]),
  ]);

  const grouped: Record<InFlightKey, ProcessSummary[]> = {
    sejm: [],
    senat: [],
    prezydent: [],
  };
  for (const p of inFlight) grouped[classify(p)].push(p);

  return (
    <main className="bg-background text-foreground font-serif pb-20">
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8 md:pt-10">
        <PageBreadcrumb
          items={[{ label: "Procesy" }]}
          subtitle="Projekty ustaw w 10. kadencji — pogrupowane wg fazy procesu. Aktywność w ostatnich 90 dniach."
        />

        <GroupSection k="sejm" items={grouped.sejm} passed={false} />
        <GroupSection k="senat" items={grouped.senat} passed={false} />
        <GroupSection k="prezydent" items={grouped.prezydent} passed={false} />
        <GroupSection k="uchwalone" items={passed} passed={true} />
      </div>
    </main>
  );
}
