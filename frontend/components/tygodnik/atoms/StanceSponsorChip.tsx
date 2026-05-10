import { sponsorAuthorityLabel } from "@/lib/labels";

// Stance + sponsor strip for prints. Renders only when at least one slot
// resolves; hides stance pill below confidence threshold (LLM said "I'm
// guessing"). Total height ~24px so it slots between title and Dotyczy
// callout without bloating the card.

const STANCE_LABEL: Record<string, string> = {
  FOR: "rozszerza",
  AGAINST: "ogranicza",
  NEUTRAL: "neutralny",
  MIXED: "mieszany",
};

const STANCE_COLOR: Record<string, string> = {
  FOR: "var(--success)",
  AGAINST: "var(--destructive)",
  NEUTRAL: "var(--muted-foreground)",
  MIXED: "var(--muted-foreground)",
};

const MIN_STANCE_CONFIDENCE = 0.6;

export function StanceSponsorChip({
  stance,
  stanceConfidence,
  sponsorAuthority,
}: {
  stance: string | null;
  stanceConfidence: number | null;
  sponsorAuthority: string | null;
}) {
  const showStance =
    !!stance &&
    STANCE_LABEL[stance] !== undefined &&
    (stanceConfidence ?? 0) >= MIN_STANCE_CONFIDENCE;
  const sponsorText = sponsorAuthorityLabel(sponsorAuthority);
  if (!showStance && !sponsorText) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 font-sans text-[11px]">
      {showStance && stance && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5"
          style={{
            borderColor: STANCE_COLOR[stance],
            color: STANCE_COLOR[stance],
          }}
          title={`pewność: ${Math.round((stanceConfidence ?? 0) * 100)}%`}
        >
          <span className="font-mono text-[9px] tracking-[0.14em] uppercase opacity-70">
            stanowisko
          </span>
          <span className="font-medium">{STANCE_LABEL[stance]}</span>
        </span>
      )}
      {sponsorText && (
        <span className="inline-flex items-center gap-1.5 text-secondary-foreground">
          <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground">
            wniósł
          </span>
          <span>{sponsorText}</span>
        </span>
      )}
    </div>
  );
}
