import Link from "next/link";
import { ClubResultBar } from "./ClubResultBar";
import { Kicker } from "./SectionHead";
import type { ClubTallyRaw } from "@/lib/events-types";
import type { MotionPolarity } from "@/lib/promiseAlignment";

export type VoteResultKind =
  | "PRZYJĘTA"
  | "ODRZUCONA"
  | "WNIOSEK PRZYJĘTY"
  | "WNIOSEK ODRZUCONY";

// Editorial mini-card for a single voting — kicker, large serif verdict,
// optional subtitle, yes/no/abstain/absent bar, ClubResultBar per-party
// segment row, and the "całe głosowanie →" link. Shared between
// /posiedzenie (one card per agenda point with a primary voting) and
// /tygodnik (right-side card on print/vote feed rows).

function verdictInk(
  result: string,
  motionPolarity?: MotionPolarity | null,
): string {
  if (motionPolarity === "procedural") return "var(--warning)";
  if (motionPolarity === "reject" || motionPolarity === "minority") {
    if (result.includes("PRZYJ")) return "var(--destructive)";
    if (result.includes("ODRZUC")) return "var(--success)";
  }
  if (result.includes("PRZYJ")) return "var(--success)";
  if (result.includes("ODRZUC")) return "var(--destructive)";
  return "var(--warning)";
}

export function VoteResultCard({
  time,
  result,
  subtitle,
  yes,
  no,
  abstain,
  absent,
  margin,
  motionPolarity,
  clubTally,
  detailHref,
}: {
  time?: string;
  result: VoteResultKind;
  subtitle?: string | null;
  yes: number;
  no: number;
  abstain: number;
  absent: number;
  margin: number;
  motionPolarity?: MotionPolarity | null;
  clubTally?: ClubTallyRaw[];
  detailHref?: string;
}) {
  const accent = verdictInk(result, motionPolarity);
  return (
    <div
      style={{
        padding: "14px 16px",
        border: "1.5px solid var(--foreground)",
        background: "var(--background)",
      }}
    >
      <Kicker className="mb-1.5">
        głosowanie{time ? ` · ${time}` : ""}
      </Kicker>
      <div
        className="font-serif italic font-medium"
        style={{
          fontSize: 22,
          color: accent,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {result}
      </div>
      {subtitle && (
        <div
          className="font-sans"
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            marginBottom: 8,
          }}
        >
          {subtitle}
        </div>
      )}
      <div
        className="font-sans"
        style={{ fontSize: 12, color: "var(--secondary-foreground)", marginBottom: 10 }}
      >
        większością <b>{yes}–{no}</b>, różnica {margin}
      </div>

      <div
        className="flex"
        style={{ height: 8, border: "1px solid var(--border)" }}
        aria-hidden
      >
        <div style={{ width: `${(yes / 460) * 100}%`, background: "var(--success)" }} />
        <div style={{ width: `${(no / 460) * 100}%`, background: "var(--destructive)" }} />
        <div style={{ width: `${(abstain / 460) * 100}%`, background: "var(--warning)" }} />
        <div style={{ width: `${(absent / 460) * 100}%`, background: "var(--border)" }} />
      </div>

      {clubTally && clubTally.length > 0 && <ClubResultBar clubTally={clubTally} />}

      {detailHref ? (
        <Link
          href={detailHref}
          className="mt-3 font-mono uppercase no-underline block"
          style={{
            fontSize: 10,
            color: "var(--destructive-deep)",
            letterSpacing: "0.14em",
          }}
        >
          całe głosowanie →
        </Link>
      ) : (
        <div
          className="mt-3 font-mono uppercase"
          style={{
            fontSize: 10,
            color: "var(--destructive-deep)",
            letterSpacing: "0.14em",
          }}
        >
          całe głosowanie →
        </div>
      )}
    </div>
  );
}
