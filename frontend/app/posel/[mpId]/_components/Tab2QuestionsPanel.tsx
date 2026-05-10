import type { MpQuestionsData } from "@/lib/db/posel-tabs";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function shortenRecipient(name: string): string {
  // "minister rodziny, pracy i polityki społecznej" → "MRPiPS"-ish — keep it readable instead.
  return name.replace(/^minister\s+/i, "min. ");
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

function RecipientBars({ items }: { items: Array<{ name: string; count: number }> }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="border border-border p-5" style={{ background: "var(--muted)" }}>
      <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-4">
        Adresaci interpelacji
      </div>
      <ul>
        {items.map((it) => {
          const pct = (it.count / max) * 100;
          return (
            <li key={it.name} className="mb-3 last:mb-0">
              <div className="flex items-baseline justify-between mb-1 gap-3">
                <span className="font-serif text-[14px] text-foreground leading-snug truncate">
                  {shortenRecipient(it.name)}
                </span>
                <span className="font-mono text-[12px] text-foreground font-semibold">{it.count}</span>
              </div>
              <div className="h-2 border border-border relative" style={{ background: "var(--background)" }}>
                <div
                  className="absolute left-0 top-0 bottom-0"
                  style={{ width: `${pct}%`, background: "var(--destructive)", opacity: 0.85 }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const KIND_LABELS: Record<string, string> = {
  interpellation: "Interpelacja",
  written: "Zapytanie",
  oral: "Pytanie ustne",
};

export function Tab2QuestionsPanel({ data }: { data: MpQuestionsData }) {
  if (data.total === 0) {
    return (
      <p className="font-serif italic text-muted-foreground text-center py-12">
        Ten poseł nie złożył jeszcze interpelacji ani zapytań w tej kadencji.
      </p>
    );
  }

  const onTime = data.total - data.delayedCount;
  const onTimePct = data.total > 0 ? (onTime / data.total) * 100 : 0;

  return (
    <div className="grid gap-7">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiTile
          label="Złożone"
          value={data.total.toLocaleString("pl-PL")}
          sub="interpelacji i zapytań"
          color="var(--destructive)"
        />
        <KpiTile
          label="Z odpowiedzią w terminie"
          value={`${onTimePct.toFixed(0)}%`}
          sub={`${onTime} z ${data.total}`}
          color="var(--success)"
        />
        <KpiTile
          label="Spóźnionych odpowiedzi"
          value={data.delayedCount.toString()}
          sub={
            data.avgDelayDays != null
              ? `średnio ${Math.round(data.avgDelayDays)} dni opóźnienia`
              : "termin >30 dni"
          }
          color="var(--warning)"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-[1fr_1.2fr] items-start">
        <RecipientBars items={data.recipientsTop} />

        <div>
          <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-3">
            Interpelacje chronologicznie
          </div>
          <ul className="border-t border-border">
            {data.rows.map((r) => {
              const delayed = r.answerDelayedDays != null && r.answerDelayedDays > 0;
              const kindLabel = KIND_LABELS[r.kind] ?? r.kind;
              return (
                <li
                  key={r.questionId}
                  className="grid border-b border-border py-3 gap-2"
                  style={{ gridTemplateColumns: "62px 1fr" }}
                >
                  <span className="font-mono text-[11px] text-muted-foreground tracking-wide pt-1">
                    {formatDate(r.sentDate)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2 mb-1">
                      <span
                        className="font-sans text-[10px] uppercase tracking-[0.12em] text-destructive"
                      >
                        {kindLabel} #{r.num}
                      </span>
                      {delayed ? (
                        <span
                          className="font-sans text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm"
                          style={{ color: "var(--warning)", border: "1px solid var(--warning)" }}
                        >
                          spóźnione {r.answerDelayedDays} dni
                        </span>
                      ) : (
                        <span
                          className="font-sans text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm"
                          style={{ color: "var(--success)", border: "1px solid var(--success)" }}
                        >
                          w terminie
                        </span>
                      )}
                    </div>
                    <div className="font-serif text-[15.5px] leading-snug text-foreground mb-1">
                      {r.title}
                    </div>
                    {r.recipients.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {r.recipients.slice(0, 3).map((rc) => (
                          <span
                            key={rc}
                            className="font-sans text-[10.5px] text-secondary-foreground px-1.5 py-0.5 border border-border rounded-sm"
                          >
                            {shortenRecipient(rc)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
