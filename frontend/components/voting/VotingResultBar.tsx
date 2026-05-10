import type { VotingHeader } from "@/lib/db/voting";

type Segment = {
  n: number;
  color: string;
  label: string;
  inkOnLight: boolean;
};

export function VotingResultBar({ header }: { header: VotingHeader }) {
  const total =
    header.yes + header.no + header.abstain + header.not_participating;

  const segs: Segment[] = [
    { n: header.yes, color: "var(--success)", label: "ZA", inkOnLight: false },
    { n: header.no, color: "var(--destructive)", label: "PRZECIW", inkOnLight: false },
    { n: header.abstain, color: "var(--warning)", label: "WSTRZ.", inkOnLight: false },
    { n: header.not_participating, color: "var(--border)", label: "NIEOB.", inkOnLight: true },
  ];

  const majority =
    header.majority_votes != null
      ? header.majority_votes
      : Math.floor(total / 2) + 1;
  const majorityPct = total > 0 ? (majority / total) * 100 : 0;
  const majorityLabel =
    header.majority_votes != null
      ? `▼ większość ${majority}`
      : "▼ większość";

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
    </div>
  );
}
