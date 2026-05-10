import type { MpPromiseAlignments, PromiseAlignmentVote } from "@/lib/db/posel-tabs";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function dotColor(vote: PromiseAlignmentVote["vote"]): string {
  switch (vote) {
    case "YES":
      return "var(--success)";
    case "NO":
      return "var(--destructive)";
    case "ABSTAIN":
      return "var(--warning)";
    default:
      return "var(--border)";
  }
}

function dotLabel(vote: PromiseAlignmentVote["vote"]): string {
  switch (vote) {
    case "YES":
      return "ZA";
    case "NO":
      return "PRZ";
    case "ABSTAIN":
      return "WSTRZ";
    case "ABSENT":
      return "NIEOB";
    case "PRESENT":
      return "OBEC";
    default:
      return "—";
  }
}

function KpiTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="py-4 px-4 border border-border" style={{ background: "var(--muted)" }}>
      <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-1.5 flex items-center gap-1.5">
        {color && <span className="inline-block w-2 h-2 rounded-sm" style={{ background: color }} />}
        {label}
      </div>
      <div
        className="font-serif font-medium leading-none mb-1.5 tracking-[-0.025em] text-foreground"
        style={{ fontSize: "clamp(1.6rem, 3vw, 2.1rem)" }}
      >
        {value}
      </div>
      <div className="font-mono text-[10.5px] text-muted-foreground tracking-wide">{sub}</div>
    </div>
  );
}

export function Tab4PromisesPanel({ data }: { data: MpPromiseAlignments }) {
  if (!data.partyCode) {
    return (
      <p className="font-serif italic text-muted-foreground text-center py-12">
        Brak mapowania klubu posła na partię z bazą obietnic.
      </p>
    );
  }
  if (data.rows.length === 0) {
    return (
      <p className="font-serif italic text-muted-foreground text-center py-12">
        Brak potwierdzonych dopasowań obietnic do druków dla klubu tego posła w bieżącej kadencji.
      </p>
    );
  }

  const totalVotePoints = data.alignedCount + data.againstCount;
  const alignedPct =
    totalVotePoints > 0 ? Math.round((data.alignedCount / totalVotePoints) * 100) : 0;

  return (
    <div className="grid gap-7">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiTile
          label="Obietnic z głosowaniami"
          value={data.totalPromises.toString()}
          sub="potwierdzone dopasowania"
          color="var(--foreground)"
        />
        <KpiTile
          label="Zagłosował zgodnie"
          value={data.alignedCount.toString()}
          sub={totalVotePoints > 0 ? `${alignedPct}% z ${totalVotePoints}` : "brak głosów"}
          color="var(--success)"
        />
        <KpiTile
          label="Zagłosował przeciw / wstrzymał się"
          value={data.againstCount.toString()}
          sub="z linią obietnicy"
          color="var(--destructive)"
        />
      </div>

      <div className="border border-border p-5" style={{ background: "var(--muted)" }}>
        <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-4">
          Obietnice partii vs głosy posła
        </div>
        <ul>
          {data.rows.map((row) => (
            <li
              key={row.promiseId}
              className="py-3 border-b border-dotted border-border last:border-b-0 grid gap-3 items-start"
              style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)" }}
            >
              <div className="min-w-0">
                <div className="font-serif italic text-[15px] text-foreground leading-snug">
                  &ldquo;{row.promiseTitle}&rdquo;
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-1 tracking-wide">
                  {row.votes.length} powiązan{row.votes.length === 1 ? "e" : "ych"} druk{row.votes.length === 1 ? "" : "ów"}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-start md:justify-end">
                {row.votes.map((v, i) => {
                  const color = dotColor(v.vote);
                  const tooltip = [
                    v.printShort ?? `druk ${v.printNumber}`,
                    v.date ? formatDate(v.date) : null,
                    `głos: ${dotLabel(v.vote)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const inner = (
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full font-mono text-[8px] font-semibold"
                      style={{
                        background: v.vote === "NONE" ? "transparent" : color,
                        color: v.vote === "NONE" ? "var(--muted-foreground)" : "var(--background)",
                        border: v.vote === "NONE" ? "1px dashed var(--border)" : "none",
                      }}
                      title={tooltip}
                    >
                      {dotLabel(v.vote)[0]}
                    </span>
                  );
                  return (
                    <a
                      key={`${row.promiseId}-${i}`}
                      href={`/druk/${v.printTerm}/${v.printNumber}`}
                      className="cursor-pointer hover:opacity-80"
                    >
                      {inner}
                    </a>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-3 font-sans text-[11px] text-secondary-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: "var(--success)" }} />
            za drukiem
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: "var(--destructive)" }} />
            przeciw
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: "var(--warning)" }} />
            wstrzymał się
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: "var(--muted-foreground)" }} />
            nieobecny
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ border: "1px dashed var(--border)" }}
            />
            brak głosowania
          </span>
        </div>
      </div>

      <aside
        className="font-serif text-[13.5px] leading-[1.65] text-secondary-foreground p-4"
        style={{ borderLeft: "3px solid var(--warning)", background: "var(--muted)" }}
      >
        <p className="m-0">
          <strong className="text-foreground">Heurystyka.</strong>{" "}
          Dopasowanie obietnica → druk pochodzi z LLM-rerankera, ograniczone do par oznaczonych jako
          „confirmed". Głosowanie wybierane w pierwszej kolejności jako <em>main</em>{" "}
          z <code className="font-mono text-[12px]">voting_print_links</code>; jeśli brak — pierwsze powiązane.
        </p>
      </aside>
    </div>
  );
}
