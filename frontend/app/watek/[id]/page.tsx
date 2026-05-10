import { notFound } from "next/navigation";
import { getThread, type ThreadStage, type ThreadStageVoting } from "@/lib/db/threads";
import { stageLabel } from "@/lib/stages";
import { PageHeading } from "@/components/chrome/PageHeading";
import { NotFoundPage } from "@/components/chrome/NotFoundPage";


// Term defaults to current Sejm cadence — keeps URLs short ("/watek/2180" not
// "/watek/10/2180"). When a future term ships we'll add ?term=... or a
// /watek/[term]/[number] variant.
const DEFAULT_TERM = 10;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

function VotingPill({ v }: { v: ThreadStageVoting }) {
  return (
    <div
      className="mt-3 inline-flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3.5 py-2 font-mono text-[12px]"
      style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
    >
      <span style={{ color: "var(--success)" }}>ZA {v.yes}</span>
      <span style={{ color: "var(--destructive)" }}>PRZECIW {v.no}</span>
      <span className="text-muted-foreground">WSTRZ {v.abstain}</span>
      {v.notParticipating != null && (
        <span className="text-muted-foreground">NIEOB {v.notParticipating}</span>
      )}
      {v.votingNumber != null && (
        <span className="text-muted-foreground">· głos. nr {v.votingNumber}</span>
      )}
    </div>
  );
}

function StageEvent({
  stage,
  state,
  showVoting,
}: {
  stage: ThreadStage;
  state: "done" | "current" | "pending";
  showVoting: ThreadStageVoting | null;
}) {
  const label = stageLabel(stage.stageType, stage.stageName);
  const isHighlight = state === "current";
  const markerStyle: React.CSSProperties = (() => {
    if (state === "pending") {
      return {
        background: "var(--background)",
        border: "1px dashed var(--muted-foreground)",
      };
    }
    return {
      background: isHighlight ? "var(--destructive)" : "var(--foreground)",
      border: "2px solid var(--background)",
      boxShadow: "0 0 0 1px var(--foreground)",
    };
  })();

  const cardStyle: React.CSSProperties = isHighlight
    ? {
        background: "var(--highlight)",
        border: "1px solid var(--warning)",
        boxShadow: "4px 4px 0 var(--foreground)",
      }
    : {
        background: "var(--background)",
        border: "1px solid var(--border)",
      };

  return (
    <div className="relative mb-7">
      <div
        className="absolute rounded-full"
        style={{
          left: -28,
          top: 18,
          width: 13,
          height: 13,
          ...markerStyle,
        }}
      />
      <div className="px-5 py-4" style={cardStyle}>
        <div className="flex justify-between items-baseline flex-wrap gap-2 mb-1">
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
            {stage.stageDate ? formatDate(stage.stageDate) : "oczekuje"}
          </span>
          {stage.sittingNum != null && (
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-destructive">
              pos. {stage.sittingNum}
            </span>
          )}
        </div>
        <h3 className="font-serif font-medium text-[20px] leading-[1.2] m-0">{label}</h3>
        {stage.stageName && stage.stageName !== label && (
          <p className="font-sans text-[11px] text-muted-foreground uppercase tracking-[0.08em] mt-1 mb-0">
            {stage.stageName}
          </p>
        )}
        {stage.decision && (
          <p className="font-serif text-[14px] leading-[1.55] mt-2 mb-0 text-secondary-foreground">
            {stage.decision}
          </p>
        )}
        {showVoting && <VotingPill v={showVoting} />}
      </div>
    </div>
  );
}

export default async function WatekDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let thread: Awaited<ReturnType<typeof getThread>> = null;
  try {
    thread = await getThread(DEFAULT_TERM, id);
  } catch (err) {
    console.error("[/watek/[id]] getThread failed", { id, err });
    return (
      <NotFoundPage
        entity="Wątek"
        gender="m"
        id={id}
        message="Nie udało się załadować wątku. Spróbuj odświeżyć stronę."
      />
    );
  }
  if (!thread) notFound();

  // Top-level only — sub-stages (depth>0) are committee internals; we surface
  // them via decision text on the parent row to keep the timeline single-thread.
  const events = thread.stages.filter((s) => s.depth === 0);

  // The "current" event is the first one without a stage_date (i.e. pending),
  // unless every stage is dated — then highlight the last dated one.
  const firstPendingIdx = events.findIndex((s) => !s.stageDate);
  const currentIdx = firstPendingIdx === -1 ? events.length - 1 : firstPendingIdx;

  // If we have a canonical voting (linked via voting_print_links) attach it to
  // the latest Voting-type stage to avoid double-display.
  const lastVotingStageIdx = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].stageType === "Voting") return i;
    }
    return -1;
  })();

  return (
    <div className="bg-background text-foreground font-serif pb-24">
      <div className="max-w-[860px] mx-auto px-4 md:px-8 lg:px-12 pt-8 md:pt-10">
        <div className="font-sans text-[11px] tracking-[0.16em] uppercase mb-3 flex items-center gap-3 flex-wrap">
          <a href="/watek" className="text-muted-foreground hover:text-destructive">‹ Wątki</a>
          <span className="text-border">/</span>
          <span className="text-destructive">wątek ustawy</span>
          <span className="font-mono text-muted-foreground tracking-wide normal-case">
            druk {thread.number} · kadencja {thread.term}
          </span>
        </div>

        <PageHeading className="mb-3 max-w-[760px]">
          {thread.shortTitle || thread.title}
        </PageHeading>

        <div className="font-sans text-[12px] text-secondary-foreground mb-3 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            {events.length} {events.length === 1 ? "etap" : events.length < 5 ? "etapy" : "etapów"}
          </span>
          {thread.passed ? (
            <>
              <span className="text-border">·</span>
              <span style={{ color: "var(--success)" }}>● uchwalona</span>
            </>
          ) : (
            <>
              <span className="text-border">·</span>
              <span className="text-warning">● w toku</span>
            </>
          )}
          {thread.lastRefreshedAt && (
            <>
              <span className="text-border">·</span>
              <span className="font-mono">
                aktualizacja {formatDate(thread.lastRefreshedAt)}
              </span>
            </>
          )}
        </div>

        <div className="font-sans text-[12px] mb-9 flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={`/druk/${thread.term}/${encodeURIComponent(thread.number)}`}
            className="text-destructive underline decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            ↗ Otwórz druk
          </a>
        </div>

        {thread.passed && thread.act && (
          <div
            className="mb-9 px-4 py-3.5 border-l-2"
            style={{ borderColor: "var(--success)", background: "var(--muted)" }}
          >
            <div className="font-sans text-[10px] tracking-[0.16em] uppercase text-success mb-1.5">
              ✓ Opublikowana w Dzienniku Ustaw
            </div>
            <div className="font-serif text-[17px] text-foreground leading-snug mb-1">
              {thread.act.displayAddress}
            </div>
            {thread.act.publishedAt && (
              <div className="font-sans text-[11px] text-muted-foreground mb-2">
                opubl. {formatLongDate(thread.act.publishedAt)}
                {thread.act.status ? ` · ${thread.act.status}` : ""}
              </div>
            )}
            {thread.act.sourceUrl && (
              <a
                href={thread.act.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-sans text-[12px] text-destructive underline decoration-dotted underline-offset-4"
              >
                ↗ Tekst ustawy w ISAP
              </a>
            )}
          </div>
        )}

        {thread.passed && !thread.act && (
          <div
            className="mb-9 px-4 py-3 border-l-2 font-sans text-[12px] text-secondary-foreground leading-[1.55]"
            style={{ borderColor: "var(--warning)", background: "var(--muted)" }}
          >
            <span className="font-medium text-foreground">Uchwalono</span> — oczekuje na
            publikację w Dz.U.{thread.closureDate ? ` (${formatLongDate(thread.closureDate)})` : ""}
          </div>
        )}

        {events.length === 0 ? (
          <p className="font-serif italic text-muted-foreground mt-6">
            Brak etapów procesu legislacyjnego dla tego druku.
          </p>
        ) : (
          <div className="relative" style={{ paddingLeft: 28 }}>
            <div
              className="absolute"
              style={{ left: 6, top: 18, bottom: 24, width: 1, background: "var(--border)" }}
            />
            {events.map((s, i) => {
              const state: "done" | "current" | "pending" =
                i < currentIdx ? "done" : i === currentIdx ? "current" : "pending";
              // Attach canonical final voting only to the last Voting stage.
              const showVoting =
                i === lastVotingStageIdx && thread.finalVoting
                  ? thread.finalVoting
                  : s.voting;
              return (
                <StageEvent
                  key={`${s.ord}-${i}`}
                  stage={s}
                  state={state}
                  showVoting={showVoting}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
