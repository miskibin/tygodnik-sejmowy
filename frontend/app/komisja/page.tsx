import {
  getCommitteeList,
  getCommitteeActivityStats,
  activityTier,
  type CommitteeListItem,
  type CommitteeActivity,
} from "@/lib/db/committees";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { CommitteeRow } from "@/components/komisja/CommitteeRow";

type GroupKey = "STANDING" | "EXTRAORDINARY" | "INVESTIGATIVE" | "OTHER";

const GROUP_HEADING: Record<GroupKey, string> = {
  STANDING: "Komisje stałe",
  EXTRAORDINARY: "Komisje nadzwyczajne",
  INVESTIGATIVE: "Komisje śledcze",
  OTHER: "Pozostałe",
};

const GROUP_BLURB: Record<GroupKey, string> = {
  STANDING: "Stałe komitety przedmiotowe (zdrowie, edukacja, finanse…). Pracują przez całą kadencję.",
  EXTRAORDINARY: "Powołane ad hoc do konkretnego tematu lub projektu ustawy.",
  INVESTIGATIVE: "Sejmowe komisje badające konkretne sprawy publiczne. Funkcja zbliżona do procesu sądowego.",
  OTHER: "Komisje pozostałe — np. regulaminowa, etyki, sprawozdawcza.",
};

function sortByActivity(
  items: CommitteeListItem[],
  stats: Map<number, CommitteeActivity>,
): CommitteeListItem[] {
  return [...items].sort((a, b) => {
    const sa = stats.get(a.id);
    const sb = stats.get(b.id);
    const aCount = sa?.last30dCount ?? 0;
    const bCount = sb?.last30dCount ?? 0;
    if (bCount !== aCount) return bCount - aCount;
    const aDate = sa?.lastSittingDate ? new Date(sa.lastSittingDate).getTime() : 0;
    const bDate = sb?.lastSittingDate ? new Date(sb.lastSittingDate).getTime() : 0;
    if (bDate !== aDate) return bDate - aDate;
    return a.name.localeCompare(b.name, "pl");
  });
}

export default async function KomisjaIndexPage() {
  const [committees, activity] = await Promise.all([
    getCommitteeList(),
    getCommitteeActivityStats(),
  ]);

  const grouped: Record<GroupKey, CommitteeListItem[]> = {
    STANDING: [],
    EXTRAORDINARY: [],
    INVESTIGATIVE: [],
    OTHER: [],
  };
  for (const c of committees) {
    if (c.type === "STANDING") grouped.STANDING.push(c);
    else if (c.type === "EXTRAORDINARY") grouped.EXTRAORDINARY.push(c);
    else if (c.type === "INVESTIGATIVE") grouped.INVESTIGATIVE.push(c);
    else grouped.OTHER.push(c);
  }
  for (const k of Object.keys(grouped) as GroupKey[]) {
    grouped[k] = sortByActivity(grouped[k], activity);
  }

  // Aggregate counters: active = had at least one sitting in last 30d.
  const activeCount = committees.filter((c) => {
    const a = activity.get(c.id);
    return (a?.last30dCount ?? 0) > 0;
  }).length;
  const hotCount = committees.filter((c) => {
    const a = activity.get(c.id);
    return a ? activityTier(a) === "hot" : false;
  }).length;

  const order: GroupKey[] = ["STANDING", "EXTRAORDINARY", "INVESTIGATIVE", "OTHER"];

  return (
    <main className="bg-background text-foreground font-serif pb-20">
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8">
        <PageBreadcrumb
          items={[{ label: "Komisje" }]}
          subtitle={
            <>
              {committees.length} komisji w X kadencji ·{" "}
              <span className="text-foreground">{activeCount}</span> aktywnych w ostatnim miesiącu
              {hotCount > 0 && (
                <>
                  {" · "}
                  <span className="text-destructive">{hotCount}</span> bardzo aktywnych
                </>
              )}
              . Sortowane wg częstości posiedzeń.
            </>
          }
        />
      </div>

      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-2 md:pt-4 space-y-12">
        {/* Legend bar */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-sans text-muted-foreground border-b border-border pb-3">
          <span className="font-sans text-[10.5px] tracking-[0.14em] uppercase">Aktywność:</span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-destructive border border-destructive" />
            3+ posiedzeń / 30 dni
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-foreground border border-foreground" />
            posiedzenie w ostatnim miesiącu
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full border border-foreground/60" />
            w ostatnich 3 miesiącach
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full border border-border" />
            nieaktywna
          </span>
        </div>

        {order.map((k) => {
          const list = grouped[k];
          if (list.length === 0) return null;
          const isDim = k === "OTHER";

          // Within standing committees, split active vs quiet to keep the
          // signal-to-noise high. Quiet = no sittings in last 30d AND
          // last sitting >90 days ago. Hidden under <details>.
          const visible: CommitteeListItem[] = [];
          const quiet: CommitteeListItem[] = [];
          for (const c of list) {
            const a = activity.get(c.id);
            const isQuiet = !a || (a.last30dCount === 0 && (a.daysSinceLast === null || a.daysSinceLast > 90));
            if (isQuiet && k !== "OTHER") quiet.push(c);
            else visible.push(c);
          }

          return (
            <section key={k}>
              <div
                className={`font-sans text-[11px] tracking-[0.16em] uppercase mb-2 ${
                  isDim ? "text-muted-foreground" : "text-destructive"
                }`}
              >
                ✶ {GROUP_HEADING[k]} · {list.length}
              </div>
              <p className="font-sans text-[12px] text-muted-foreground max-w-[680px] mb-4 leading-relaxed">
                {GROUP_BLURB[k]}
              </p>
              <ul className="grid gap-2">
                {visible.map((c) => (
                  <li key={c.id}>
                    <CommitteeRow c={c} activity={activity.get(c.id) ?? null} />
                  </li>
                ))}
              </ul>
              {quiet.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-sans text-[11px] tracking-[0.14em] uppercase text-muted-foreground hover:text-destructive py-2">
                    Uśpione w ostatnich 3 miesiącach · {quiet.length}
                  </summary>
                  <ul className="grid gap-2 mt-2">
                    {quiet.map((c) => (
                      <li key={c.id}>
                        <CommitteeRow c={c} activity={activity.get(c.id) ?? null} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
