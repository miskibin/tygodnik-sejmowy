import { getThreadsInFlight, type ThreadSummary } from "@/lib/db/threads";
import { stageLabel } from "@/lib/stages";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";


function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

function ThreadRow({ t }: { t: ThreadSummary }) {
  const days = daysAgo(t.lastStageDate);
  const stageText = stageLabel(t.lastStageType, t.lastStageName);
  return (
    <li className="py-5 border-b border-dotted border-border">
      <a
        href={`/watek/${encodeURIComponent(t.number)}`}
        className="grid gap-x-5 gap-y-2 group"
        style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
      >
        <div className="min-w-0">
          <div className="font-sans text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-1.5 flex items-center gap-2 flex-wrap">
            <span className="font-mono tracking-wide normal-case text-destructive">
              druk {t.number}
            </span>
            <span className="text-border">·</span>
            <span>{stageText}</span>
            {days != null && (
              <>
                <span className="text-border">·</span>
                <span className="font-mono tracking-wide normal-case">
                  {days === 0 ? "dziś" : `${days} dni temu`}
                </span>
              </>
            )}
          </div>
          <h2
            className="font-serif font-medium leading-[1.2] text-foreground group-hover:text-destructive transition-colors"
            style={{ fontSize: "clamp(1.05rem, 2.2vw, 1.4rem)", letterSpacing: "-0.015em" }}
          >
            {t.shortTitle || t.title || `Druk ${t.number}`}
          </h2>
        </div>
        <div className="self-end font-sans text-[11px] tracking-[0.14em] uppercase text-muted-foreground group-hover:text-destructive whitespace-nowrap">
          otwórz wątek →
        </div>
      </a>
    </li>
  );
}

export default async function WatekIndexPage() {
  const threads = await getThreadsInFlight(30);

  return (
    <div className="bg-background text-foreground font-serif pb-24">
      <div className="max-w-[980px] mx-auto px-4 md:px-8 lg:px-14 pt-9 md:pt-12">
        <PageBreadcrumb
          items={[{ label: "Wątki" }]}
          subtitle="Aktywność w ostatnich 90 dniach · sortowane wg najnowszego etapu"
        />

        {threads.length === 0 ? (
          <p className="font-serif italic text-muted-foreground mt-8">
            Brak aktywnych wątków w wybranym okresie.
          </p>
        ) : (
          <ul className="mt-2">
            {threads.map((t) => (
              <ThreadRow key={`${t.term}-${t.number}`} t={t} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
