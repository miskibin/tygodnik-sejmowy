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

  const { headline, tone, motionDescription } = verdictStampWords(header.motion_polarity, passed);
  // Headline color comes from BILL outcome (not motion outcome) so a citizen
  // sees green/red that matches what happened to the project, not what
  // happened to a procedural motion. neutral = amendment/minority/procedural.
  const headlineColor =
    tone === "success" ? "var(--success)" :
    tone === "destructive" ? "var(--destructive)" :
    "var(--foreground)";

  return (
    <div className="flex items-center flex-wrap gap-4 sm:gap-6 mb-7">
      <div
        className="font-serif flex flex-col"
        style={{ lineHeight: 0.9 }}
      >
        <div
          style={{
            fontStyle: "italic",
            // clamp keeps the headline inside a 320px viewport without breaking
            // the 80px headline scale on desktop. Some bill-outcome strings
            // ("PROJEKT IDZIE DALEJ") are two words — slightly smaller cap
            // than the old single-word stamp so it wraps cleanly.
            fontSize: "clamp(44px, 11.5vw, 80px)",
            fontWeight: 500,
            color: headlineColor,
            letterSpacing: "-0.04em",
          }}
        >
          {headline}
        </div>
        {motionDescription && (
          <div
            className="font-sans"
            style={{
              fontSize: 13,
              color: "var(--muted-foreground)",
              marginTop: 10,
              fontStyle: "italic",
            }}
          >
            {motionDescription}
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
