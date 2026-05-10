// Compact horizontal vote-result bar — title kicker, proportional fill,
// inline za/przeciw/wstrz/nb numbers, verdict pill on the right. Replaces
// the full hemicycle chart in the tygodnik feed (the hemicycle still lives
// on the druk detail page where there's room to study it). Embedded inside
// print cards when a voting links to that print, and used standalone for
// votes whose linked print isn't already in the feed.

export type VoteResult = {
  votingNumber: number;
  yes: number;
  no: number;
  abstain: number;
  notParticipating: number;
};

function verdict(r: VoteResult): { label: string; color: string } {
  // Feed-level heuristic — sufficient for tygodnik scan; the druk page does
  // the proper quorum/majority math when it matters.
  if (r.yes > r.no) return { label: "przyjęta", color: "var(--success)" };
  if (r.no > r.yes) return { label: "odrzucona", color: "var(--destructive)" };
  return { label: "remis", color: "var(--muted-foreground)" };
}

export function VoteResultBar({ result }: { result: VoteResult }) {
  const total = result.yes + result.no + result.abstain;
  const yesPct = total > 0 ? (result.yes / total) * 100 : 0;
  const noPct = total > 0 ? (result.no / total) * 100 : 0;
  const abstPct = total > 0 ? (result.abstain / total) * 100 : 0;
  const v = verdict(result);

  return (
    <div className="my-5">
      <div className="flex items-baseline justify-between mb-2 gap-2">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">
          wynik głosowania nr {result.votingNumber}
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
