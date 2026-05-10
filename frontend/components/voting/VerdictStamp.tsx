import type { VotingHeader } from "@/lib/db/voting";

export function VerdictStamp({
  header,
  passed,
}: {
  header: VotingHeader;
  passed: boolean;
}) {
  const margin = Math.abs(header.yes - header.no);
  const turnoutDenom =
    header.yes + header.no + header.abstain + header.not_participating;
  const turnoutPct =
    turnoutDenom > 0
      ? Math.round(((header.yes + header.no + header.abstain) / turnoutDenom) * 1000) / 10
      : 0;

  return (
    <div className="flex items-center flex-wrap gap-4 sm:gap-6 mb-7">
      <div
        className="font-serif"
        style={{
          fontStyle: "italic",
          // clamp keeps "ODRZUCONA" inside a 320px viewport without breaking the
          // 92px headline scale on desktop. ~10ch wide at 1cqi sizing.
          fontSize: "clamp(54px, 14vw, 92px)",
          lineHeight: 0.9,
          fontWeight: 500,
          color: passed ? "var(--success)" : "var(--destructive)",
          letterSpacing: "-0.04em",
        }}
      >
        {passed ? "PRZYJĘTA" : "ODRZUCONA"}
      </div>
      <div
        className="font-sans sm:border-l sm:border-border sm:pl-[18px]"
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--muted-foreground)",
          paddingTop: 8,
        }}
      >
        <div>
          większością{" "}
          <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
            {header.yes}–{header.no}
          </span>
        </div>
        <div>
          różnica{" "}
          <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
            {margin} głosów
          </span>
        </div>
        <div>
          frekwencja{" "}
          <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
            {turnoutPct}%
          </span>
        </div>
      </div>
    </div>
  );
}
