import type { VotingHeader } from "@/lib/db/voting";

type Segment = {
  n: number;
  color: string;
  label: string;
  inkOnLight: boolean;
};

// Citizen-language gloss for each majority_type value the Sejm API ships.
// Counts across votings table (D 2026-05-11, 2421 rows):
//   SIMPLE_MAJORITY 1914 / ABSOLUTE_MAJORITY 437 / ABSOLUTE_STATUTORY_MAJORITY 62
//   STATUTORY_MAJORITY 4 / MAJORITY_THREE_FIFTHS 4.
// Constitutional references match skill polski-proces-legislacyjny.
const MAJORITY_META: Record<string, { label: string; rule: string; abstainCountsAgainst: boolean }> = {
  SIMPLE_MAJORITY: {
    label: "większość zwykła",
    rule: "Za > Przeciw. Wstrzymujący się nie liczą się do progu (Konst. art. 120).",
    abstainCountsAgainst: false,
  },
  ABSOLUTE_MAJORITY: {
    label: "większość bezwzględna",
    rule: "Za > (Przeciw + Wstrzymujący się). Wstrzymujący się działa jak przeciw.",
    abstainCountsAgainst: true,
  },
  ABSOLUTE_STATUTORY_MAJORITY: {
    label: "większość bezwzględna ustawowa",
    rule: "Za > (Przeciw + Wstrzymujący się), przy obecności ≥ 230 posłów.",
    abstainCountsAgainst: true,
  },
  STATUTORY_MAJORITY: {
    label: "większość ustawowa",
    rule: "Wymagana liczba głosów Za z ustawowej liczby 460 posłów.",
    abstainCountsAgainst: true,
  },
  MAJORITY_THREE_FIFTHS: {
    label: "większość 3/5",
    rule: "3/5 głosów oddanych przy quorum (Konst. art. 122 ust. 5 – odrzucenie weta Prezydenta).",
    abstainCountsAgainst: false,
  },
  MAJORITY_TWO_THIRDS: {
    label: "większość 2/3",
    rule: "2/3 głosów oddanych przy quorum (Konst. art. 235 – zmiana Konstytucji).",
    abstainCountsAgainst: false,
  },
};

export function VotingResultBar({ header }: { header: VotingHeader }) {
  const total =
    header.yes + header.no + header.abstain + header.not_participating;

  const meta = header.majority_type ? MAJORITY_META[header.majority_type] : undefined;

  const segs: Segment[] = [
    { n: header.yes, color: "var(--success)", label: "ZA", inkOnLight: false },
    { n: header.no, color: "var(--destructive)", label: "PRZECIW", inkOnLight: false },
    {
      n: header.abstain,
      color: "var(--warning)",
      label: meta?.abstainCountsAgainst ? "WSTRZ. (liczone przeciw)" : "WSTRZ.",
      inkOnLight: false,
    },
    { n: header.not_participating, color: "var(--border)", label: "NIEOB.", inkOnLight: true },
  ];

  return (
    <div>
      <div
        className="flex relative overflow-hidden"
        style={{
          height: 44,
          background: "var(--muted)",
          border: "1px solid var(--rule)",
        }}
      >
        {segs.map((s, i) => {
          const widthPct = total > 0 ? (s.n / total) * 100 : 0;
          return (
            <div
              key={i}
              className="relative"
              style={{ width: `${widthPct}%`, background: s.color }}
            >
              {widthPct > 6 && (
                <div
                  className="absolute inset-0 flex items-center justify-between font-mono"
                  style={{
                    padding: "0 10px",
                    fontSize: 11,
                    color: s.inkOnLight ? "var(--secondary-foreground)" : "var(--background)",
                    letterSpacing: "0.06em",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{s.label}</span>
                  <span>{s.n}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(meta || header.majority_votes != null || total > 0) && (
        <div
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono"
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            letterSpacing: "0.04em",
          }}
          title={meta?.rule}
        >
          {meta && <span style={{ color: "var(--secondary-foreground)" }}>Wymagana: {meta.label}</span>}
          {header.majority_votes != null && header.majority_votes > 1 && (
            <span>próg {header.majority_votes} głosów</span>
          )}
          {total > 0 && (
            <span
              style={{
                color: total >= 230 ? undefined : "var(--destructive)",
              }}
              title="Quorum Sejmu = 230 posłów (Konst. art. 120). Frekwencja liczy ZA + PRZECIW + WSTRZ. + NIEOB., bo wszystkie cztery odzwierciedlają obecność na sali."
            >
              frekwencja {total}/460 {total >= 230 ? "· kworum ✓" : "· brak kworum"}
            </span>
          )}
          {meta && <span style={{ opacity: 0.85 }}>· {meta.rule}</span>}
        </div>
      )}
    </div>
  );
}
