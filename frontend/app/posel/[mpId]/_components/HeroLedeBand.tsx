import { getMpThisWeek } from "@/lib/db/mps";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "long" });
  } catch {
    return "";
  }
}

// Pick verb form from first-name vowel ending — same heuristic as the
// page-level Poseł/Posłanka guess. Imperfect (e.g. "Maria" male is rare but
// possible) but matches the rest of the site's labeling.
function pickVerbs(firstLastName: string): { stmt: string; q: string } {
  const first = (firstLastName.split(/\s+/)[0] ?? "").replace(/[.,]/g, "").toLowerCase();
  const female = first.endsWith("a");
  return female
    ? { stmt: "Wystąpiła z mównicy", q: "Złożyła interpelację" }
    : { stmt: "Wystąpił z mównicy", q: "Złożył interpelację" };
}

// Hero "W tym tygodniu" pull-quote band. Renders nothing if the MP has no
// recent activity in the DB — never invents a headline.
export async function HeroLedeBand({ mpId, firstLastName }: { mpId: number; firstLastName: string }) {
  const events = await getMpThisWeek(mpId, undefined, 1);
  const latest = events[0];
  if (!latest) return null;

  const verbs = pickVerbs(firstLastName);
  const kindLabel = latest.kind === "question" ? verbs.q : verbs.stmt;
  return (
    <div
      className="border-y border-rule"
      style={{ background: "color-mix(in oklab, var(--highlight) 38%, var(--background))" }}
    >
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 py-6 sm:py-8 grid gap-4 sm:gap-8 items-baseline grid-cols-1 sm:grid-cols-[140px_1fr]">
        <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.18em] uppercase text-destructive leading-[1.3]">
          ✶ Ostatnia<br />aktywność{" "}
          {latest.date && (
            <span className="text-muted-foreground normal-case tracking-normal font-mono text-[11px] block mt-1">
              {fmtDate(latest.date)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="font-sans text-[10px] sm:text-[11px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
            {kindLabel}
          </div>
          <h2
            className="font-serif font-medium m-0 leading-[1.15] tracking-[-0.015em] text-balance"
            style={{ fontSize: "clamp(1.25rem, 3.6vw, 2rem)" }}
          >
            {latest.kind === "statement" && latest.statementId != null ? (
              <a href={`/mowa/${latest.statementId}`} className="hover:text-destructive">
                {latest.title}
              </a>
            ) : (
              latest.title
            )}
          </h2>
          {latest.subtitle && (
            <p className="font-sans text-[12px] sm:text-[13px] text-muted-foreground mt-2 mb-0">{latest.subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
