import type { LinkedPrintRich, ClubBreakdownRow } from "@/lib/db/voting";

type Props = {
  linkedPrint: LinkedPrintRich | null;
  clubs: ClubBreakdownRow[];
  passed: boolean;
};

function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/\.[\s\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.endsWith(".") || s.endsWith("!") || s.endsWith("?") ? s : `${s}.`));
  return parts;
}

function buildAffected(linkedPrint: LinkedPrintRich): string | null {
  const groups = linkedPrint.affected_groups;
  if (groups && groups.length > 0) {
    const descs = groups
      .map((g) => g?.description?.trim())
      .filter((d): d is string => !!d && d.length > 0)
      .slice(0, 3);
    if (descs.length > 0) return descs.join(", ");
  }
  if (linkedPrint.impact_punch && linkedPrint.impact_punch.trim().length > 0) {
    return linkedPrint.impact_punch.trim();
  }
  return null;
}

function buildOpposition(clubs: ClubBreakdownRow[], passed: boolean): string | null {
  const targetDominant: "YES" | "NO" = passed ? "NO" : "YES";
  const verbCount = (c: ClubBreakdownRow) => (targetDominant === "NO" ? c.no : c.yes);
  const filtered = clubs
    .filter((c) => c.dominant === targetDominant && verbCount(c) > 0)
    .sort((a, b) => verbCount(b) - verbCount(a))
    .slice(0, 3);
  if (filtered.length === 0) return null;

  const verbWord = passed ? "głosów przeciw" : "głosów za";
  const sum = filtered.reduce((acc, c) => acc + verbCount(c), 0);
  const piece = filtered
    .map((c) => `${c.club_short} (${verbCount(c)}/${c.total})`)
    .join(" i ");
  return `${piece} — łącznie ${sum} ${verbWord}.`;
}

export function VotingMeaning({ linkedPrint, clubs, passed }: Props) {
  if (!linkedPrint || !linkedPrint.summary_plain) {
    const punch = linkedPrint?.impact_punch?.trim();
    if (!punch) return null;
    return (
      <section
        style={{
          background: "var(--highlight)",
          borderTop: "2px solid var(--rule)",
          borderBottom: "2px solid var(--rule)",
        }}
      >
        <div className="mx-auto px-4 sm:px-8 md:px-14 py-10" style={{ maxWidth: 1100 }}>
          <div
            className="font-mono uppercase mb-4"
            style={{
              fontSize: 11,
              color: "var(--destructive-deep)",
              letterSpacing: "0.2em",
            }}
          >
            ✶ &nbsp; co to znaczy w praktyce &nbsp; ✶
          </div>
          <p
            className="font-serif m-0"
            style={{ fontSize: 17, lineHeight: 1.5, color: "var(--secondary-foreground)" }}
          >
            {punch}
          </p>
        </div>
      </section>
    );
  }

  const sentences = splitSentences(linkedPrint.summary_plain).slice(0, 3);
  if (sentences.length === 0) return null;

  const affected = buildAffected(linkedPrint);
  const opposition = buildOpposition(clubs, passed);
  const opposingLabel = passed ? "kto był przeciw" : "kto był za";

  return (
    <section
      style={{
        background: "var(--highlight)",
        borderTop: "2px solid var(--rule)",
        borderBottom: "2px solid var(--rule)",
      }}
    >
      <div className="mx-auto px-4 sm:px-8 md:px-14 py-12 sm:py-14" style={{ maxWidth: 1100 }}>
        <div
          className="font-mono uppercase mb-[18px]"
          style={{
            fontSize: 11,
            color: "var(--destructive-deep)",
            letterSpacing: "0.2em",
          }}
        >
          ✶ &nbsp; co to znaczy w praktyce &nbsp; ✶
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-3"
          style={{ gap: 36 }}
        >
          {sentences.map((sentence, i) => (
            <div
              key={i}
              className="relative"
              style={{
                paddingTop: 22,
                borderTop: "1px solid var(--foreground)",
              }}
            >
              <div
                className="font-serif italic absolute"
                style={{
                  fontSize: 32,
                  lineHeight: 0.9,
                  color: "var(--destructive-deep)",
                  top: 18,
                  right: 0,
                }}
              >
                {i + 1}
              </div>
              <p
                className="font-serif m-0"
                style={{
                  fontSize: 19,
                  lineHeight: 1.45,
                  color: "var(--foreground)",
                  textWrap: "pretty",
                  paddingRight: 32,
                }}
              >
                {sentence}
              </p>
            </div>
          ))}
        </div>

        {(affected || opposition) && (
          <div
            className="grid grid-cols-1 md:grid-cols-2"
            style={{
              marginTop: 40,
              paddingTop: 22,
              borderTop: "1px dotted var(--foreground)",
              gap: 40,
            }}
          >
            {affected && (
              <div>
                <div
                  className="font-mono uppercase mb-1.5"
                  style={{
                    fontSize: 10,
                    color: "var(--muted-foreground)",
                    letterSpacing: "0.16em",
                  }}
                >
                  kogo to dotyczy
                </div>
                <p
                  className="font-serif m-0"
                  style={{
                    fontSize: 16,
                    lineHeight: 1.55,
                    color: "var(--secondary-foreground)",
                  }}
                >
                  {affected}
                </p>
              </div>
            )}
            {opposition && (
              <div>
                <div
                  className="font-mono uppercase mb-1.5"
                  style={{
                    fontSize: 10,
                    color: "var(--muted-foreground)",
                    letterSpacing: "0.16em",
                  }}
                >
                  {opposingLabel}
                </div>
                <p
                  className="font-serif m-0"
                  style={{
                    fontSize: 16,
                    lineHeight: 1.55,
                    color: "var(--secondary-foreground)",
                  }}
                >
                  {opposition}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
