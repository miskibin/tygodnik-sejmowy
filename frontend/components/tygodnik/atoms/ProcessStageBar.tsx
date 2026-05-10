// 6-step pipeline visualization for a Sejm legislative process. Maps the
// many stage_type enum values from process_stages onto 6 broad buckets so
// the bar reads at a glance without needing to know parliamentary procedure.

const STEPS = [
  { key: "intake", label: "wpłynęło" },
  { key: "first_reading", label: "I czytanie" },
  { key: "committee", label: "komisja" },
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
  Referral: "first_reading",
  ReadingReferral: "first_reading",
  Reading: "first_reading",
  CommitteeWork: "committee",
  CommitteeReport: "committee",
  SejmReading: "vote",
  Voting: "vote",
  SenatePosition: "senate",
  ToPresident: "president",
  PresidentSignature: "president",
  End: "president",
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
  const currentIdx = stepIndexFor(currentStageType, processPassed);

  return (
    <div className="mb-4">
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
