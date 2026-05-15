// 7-step pipeline visualization for a Sejm legislative process. Maps the
// many stage_type enum values from process_stages onto 7 broad buckets so
// the bar reads at a glance without needing to know parliamentary procedure.
//
// Termination: when `process_state.End` is reached without `processPassed`,
// the project died mid-flow (rejected in I czytanie, withdrawn, etc.).
// The full 7-step bar implies the project is moving toward Prezydent —
// citizen review caught this contradiction (#4: "Zakończono" badge +
// progressing bar on /proces/10/2197). Terminated processes now
// render a compact "Proces zakończony" badge instead.
//
// Why "plenum" is its own step (split from "głosowanie"):
//   `SejmReading` is "I/II/III czytanie na posiedzeniu Sejmu" — a debate
//   on the floor, NOT a vote. Lumping it with `Voting` (the actual roll
//   call) labelled the bar GŁOSOWANIE for prints that were still in
//   II czytanie, misleading citizens into thinking the vote already
//   happened. PLENUM is the dedicated step for floor debate before vote.

const STEPS = [
  { key: "intake", label: "wpłynęło" },
  { key: "first_reading", label: "I czytanie" },
  { key: "committee", label: "komisja" },
  { key: "plenum", label: "plenum" },
  { key: "vote", label: "głosowanie" },
  { key: "senate", label: "senat" },
  { key: "president", label: "prezydent" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

// Mapping from process_stages.stage_type → bucket. Anything outside this
// table falls back to "intake" so the bar always renders something useful.
const STAGE_TO_STEP: Record<string, StepKey> = {
  Start: "intake",
  Opinion: "intake",
  GovermentPosition: "intake",
  GovernmentPosition: "intake",
  ExpertOpinion: "intake",
  Referral: "first_reading",
  ReadingReferral: "first_reading",
  Reading: "first_reading",
  CommitteeWork: "committee",
  CommitteeReport: "committee",
  SejmReading: "plenum",
  Voting: "vote",
  SenatePosition: "senate",
  SenateAmendments: "senate",
  SenatePositionConsideration: "senate",
  ToPresident: "president",
  PresidentSignature: "president",
  PresidentVeto: "president",
  PresidentMotionConsideration: "president",
  ConstitutionalTribunal: "president",
  Promulgation: "president",
};

function stepIndexFor(stageType: string | null, processPassed: boolean | null): number {
  if (processPassed) return STEPS.length - 1;
  if (!stageType) return 0;
  const bucket = STAGE_TO_STEP[stageType];
  if (!bucket) return 0;
  return STEPS.findIndex((s) => s.key === bucket);
}

export function ProcessStageBar({
  currentStageType,
  processPassed,
}: {
  currentStageType: string | null;
  processPassed: boolean | null;
}) {
  if (!currentStageType && !processPassed) return null;

  // Terminated mid-flow — End/Withdrawn/Rejected with passed=false.
  // Replace the misleading 6-step bar with a single terminal badge.
  const terminated =
    !processPassed &&
    (currentStageType === "End" ||
      currentStageType === "Withdrawn" ||
      currentStageType === "Rejected");
  if (terminated) {
    const label =
      currentStageType === "Withdrawn" ? "Projekt wycofany" :
      currentStageType === "Rejected" ? "Projekt odrzucony" :
      "Proces zakończony";
    return (
      <div className="mb-4">
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.14em] uppercase rounded-full border px-2.5 py-1"
          style={{ color: "var(--muted-foreground)", borderColor: "var(--border)" }}
        >
          <span aria-hidden style={{ color: "var(--destructive)" }}>●</span>
          {label}
        </span>
      </div>
    );
  }

  const currentIdx = stepIndexFor(currentStageType, processPassed);

  return (
    <div className="mb-4" style={{ minHeight: 32 }}>
      <div className="flex items-center gap-1 mb-1.5">
        {STEPS.map((step, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          const bg = done
            ? "var(--secondary-foreground)"
            : current
            ? "var(--destructive)"
            : "var(--border)";
          return (
            <div
              key={step.key}
              className="flex-1 h-[3px] rounded-full"
              style={{ background: bg }}
              aria-hidden
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground">
        {STEPS.map((step, i) => {
          const current = i === currentIdx;
          return (
            <span
              key={step.key}
              className="truncate"
              style={{
                color: current ? "var(--destructive)" : undefined,
                fontWeight: current ? 600 : undefined,
                maxWidth: `${100 / STEPS.length}%`,
              }}
            >
              {step.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
