import type { VotingHeader } from "@/lib/db/voting";
import { verdictStampWords } from "@/lib/voting/bill_outcome";

export function VerdictStamp({
  header,
  passed,
}: {
  header: VotingHeader;
  // `passed` here is the MOTION result (yes >= majority). The bill-level
  // consequence is derived inside via header.motion_polarity — see issue #25.
  passed: boolean;
}) {
  const margin = Math.abs(header.yes - header.no);
  const turnoutDenom =
    header.yes + header.no + header.abstain + header.not_participating;
  const turnoutPct =
    turnoutDenom > 0
      ? Math.round(((header.yes + header.no + header.abstain) / turnoutDenom) * 1000) / 10
      : 0;

  const { subject, verb, sublabel } = verdictStampWords(header.motion_polarity, passed);

  return (
    <div className="flex items-center flex-wrap gap-4 sm:gap-6 mb-7">
      <div
        className="font-serif flex flex-col"
        style={{ lineHeight: 0.9 }}
      >
        <div
          className="font-mono uppercase"
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "var(--muted-foreground)",
            marginBottom: 6,
          }}
        >
          {subject}
        </div>
        <div
          style={{
            fontStyle: "italic",
            // clamp keeps the verb inside a 320px viewport without breaking the
            // 92px headline scale on desktop. ~10ch wide at 1cqi sizing.
            fontSize: "clamp(54px, 14vw, 92px)",
            fontWeight: 500,
            color: passed ? "var(--success)" : "var(--destructive)",
            letterSpacing: "-0.04em",
          }}
        >
          {verb}
        </div>
        {sublabel && (
          <div
            className="font-sans"
            style={{
              fontSize: 12,
              color: "var(--muted-foreground)",
              marginTop: 6,
              fontStyle: "italic",
            }}
          >
            {sublabel}
          </div>
        )}
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
