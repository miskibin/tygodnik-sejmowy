// Compact horizontal vote-result bar — title kicker, proportional fill,
// inline za/przeciw/wstrz/nb numbers, verdict pill on the right. Replaces
// the full hemicycle chart in the tygodnik feed (the hemicycle still lives
// on the druk detail page where there's room to study it). Embedded inside
// print cards when a voting links to that print, and used standalone for
// votes whose linked print isn't already in the feed.
import { computeBillOutcome, verdictChipLabel } from "@/lib/voting/bill_outcome";
import type { MotionPolarity } from "@/lib/promiseAlignment";

export type VoteResult = {
  votingNumber: number;
  yes: number;
  no: number;
  abstain: number;
  notParticipating: number;
  majorityVotes?: number | null;
  motionPolarity?: MotionPolarity | null;
};

function motionTypeLabel(polarity: MotionPolarity | null | undefined): string | null {
  if (polarity === "pass") return "nad całością projektu";
  if (polarity === "reject") return "o odrzucenie projektu";
  if (polarity === "amendment") return "nad poprawkami";
  if (polarity === "minority") return "nad wnioskiem mniejszości";
  if (polarity === "procedural") return "nad wnioskiem proceduralnym";
  return null;
}

function verdict(r: VoteResult): { label: string; color: string } {
  const motionPassed = r.majorityVotes != null ? r.yes >= r.majorityVotes : r.yes > r.no;
  if (r.motionPolarity) {
    const outcome = computeBillOutcome(r.motionPolarity, motionPassed);
    if (outcome !== "indeterminate") {
      return {
        label: verdictChipLabel(outcome),
        color: outcome === "passed" || outcome === "continues"
          ? "var(--success)"
          : "var(--destructive)",
      };
    }
  }
  // Fallback when motion polarity is missing/indeterminate: describe motion only.
  if (motionPassed) return { label: "wniosek przyjęty", color: "var(--success)" };
  if (!motionPassed) return { label: "wniosek odrzucony", color: "var(--destructive)" };
  return { label: "remis", color: "var(--muted-foreground)" };
}

export function VoteResultBar({ result }: { result: VoteResult }) {
  const total = result.yes + result.no + result.abstain;
  const yesPct = total > 0 ? (result.yes / total) * 100 : 0;
  const noPct = total > 0 ? (result.no / total) * 100 : 0;
  const abstPct = total > 0 ? (result.abstain / total) * 100 : 0;
  const v = verdict(result);
  const motionLabel = motionTypeLabel(result.motionPolarity);

  return (
    <div className="my-5">
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">
          wynik głosowania nr {result.votingNumber}
          {motionLabel && (
            <span className="normal-case tracking-normal font-sans text-[11px] ml-1.5">
              · {motionLabel}
            </span>
          )}
        </span>
        <span
          className="font-mono text-[10px] tracking-[0.18em] uppercase font-semibold px-2.5 py-0.5 rounded-full border"
          style={{ color: v.color, borderColor: v.color }}
        >
          {v.label}
        </span>
      </div>

      <div className="flex h-[6px] rounded-full overflow-hidden bg-border" aria-hidden>
        <div style={{ width: `${yesPct}%`, background: "var(--success)" }} />
        <div style={{ width: `${noPct}%`, background: "var(--destructive)" }} />
        <div style={{ width: `${abstPct}%`, background: "var(--muted-foreground)", opacity: 0.4 }} />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mt-2 font-sans text-[12px]">
        <span>
          <span className="font-serif text-[16px] font-medium" style={{ color: "var(--success)" }}>
            {result.yes}
          </span>
          <span className="ml-1 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            za
          </span>
        </span>
        <span>
          <span className="font-serif text-[16px] font-medium" style={{ color: "var(--destructive)" }}>
            {result.no}
          </span>
          <span className="ml-1 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            przeciw
          </span>
        </span>
        <span>
          <span className="font-serif text-[16px] font-medium text-secondary-foreground">
            {result.abstain}
          </span>
          <span className="ml-1 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            wstrz.
          </span>
        </span>
        <span>
          <span className="font-serif text-[16px] font-medium text-muted-foreground">
            {result.notParticipating}
          </span>
          <span className="ml-1 font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            nb.
          </span>
        </span>
      </div>
    </div>
  );
}
