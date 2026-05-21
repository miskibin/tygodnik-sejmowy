import type { MpOfficeExpenseReport } from "@/lib/db/posel-tabs";

const PLN = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 0,
});
const PLN_FRAC = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtPLN(v: number | null, opts: { precise?: boolean } = {}): string {
  if (v == null) return "—";
  return (opts.precise ? PLN_FRAC : PLN).format(v);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pl-PL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function KpiTile({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub: string;
  emphasis?: "good" | "warn" | "neutral";
}) {
  const color =
    emphasis === "good"
      ? "var(--success)"
      : emphasis === "warn"
        ? "var(--warning)"
        : "var(--foreground)";
  return (
    <div className="py-4 px-4 border border-border" style={{ background: "var(--muted)" }}>
      <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-1.5">
        {label}
      </div>
      <div
        className="font-serif font-medium leading-none mb-1.5 tabular-nums tracking-[-0.025em]"
        style={{ fontSize: "clamp(1.4rem, 2.6vw, 1.9rem)", color }}
      >
        {value}
      </div>
      <div className="font-mono text-[10.5px] text-muted-foreground tracking-wide leading-snug break-words">
        {sub}
      </div>
    </div>
  );
}

export function Tab5OfficeExpensesPanel({
  report,
}: {
  report: MpOfficeExpenseReport | null;
}) {
  if (!report) {
    return (
      <div className="py-12 max-w-[640px]">
        <p className="font-serif italic text-muted-foreground text-center">
          Sprawozdanie z wydatków biura poselskiego jeszcze nieprzetworzone.
        </p>
        <p className="font-sans text-[12px] text-muted-foreground text-center mt-3 leading-snug">
          Sprawozdania roczne 460 posłów publikuje Kancelaria Sejmu po zatwierdzeniu
          przez Prezydium Sejmu i Komisję Regulaminową. Dodajemy je iteracyjnie do bazy
          tygodnika.
        </p>
      </div>
    );
  }

  const spent = report.fundsSpent ?? null;
  const total = report.fundsTotal ?? report.fundsAllocated ?? null;
  const remaining = report.fundsRemaining ?? null;
  const utilizationPct =
    spent != null && total != null && total > 0 ? (spent / total) * 100 : null;
  const maxItem = report.items.reduce((acc, it) => Math.max(acc, it.amount), 0);

  const nonZero = report.items.filter((it) => it.amount > 0);
  const sortedItems = [...report.items].sort((a, b) => b.amount - a.amount);

  return (
    <div className="min-w-0">
      <p className="font-sans text-[12px] text-muted-foreground leading-snug m-0 mb-5 max-w-[720px] break-words">
        Sprawozdanie z wydatkowania ryczałtu na prowadzenie biura poselskiego za{" "}
        <strong className="text-foreground">{report.year}</strong> rok. Dane z formularza
        zatwierdzonego przez Prezydium Sejmu (Załącznik nr 1 do zarządzenia nr 2
        Marszałka Sejmu z 31 III 2017 r.).
      </p>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <KpiTile
          label="Ryczałt do rozliczenia"
          value={fmtPLN(total)}
          sub={
            report.fundsCarryover
              ? `w tym z poprzedniego okresu: ${fmtPLN(report.fundsCarryover)}`
              : "łącznie w okresie sprawozdawczym"
          }
        />
        <KpiTile
          label="Wydatkowano"
          value={fmtPLN(spent)}
          sub={
            utilizationPct != null
              ? `${utilizationPct.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}% ryczałtu`
              : "wg sprawozdania"
          }
          emphasis={
            utilizationPct == null
              ? "neutral"
              : utilizationPct >= 95
                ? "warn"
                : "neutral"
          }
        />
        <KpiTile
          label="Pozostało"
          value={fmtPLN(remaining)}
          sub="niewykorzystane środki ryczałtu"
          emphasis={remaining != null && remaining > 0 ? "good" : "neutral"}
        />
      </div>

      {/* Items table */}
      <div className="border border-border bg-background mb-4 overflow-x-auto">
        <table className="w-full font-sans text-[13px] min-w-[520px]">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th
                scope="col"
                className="text-left font-mono uppercase tracking-[0.12em] text-[10px] text-muted-foreground py-2 px-3 w-[2.5rem]"
              >
                Lp.
              </th>
              <th
                scope="col"
                className="text-left font-mono uppercase tracking-[0.12em] text-[10px] text-muted-foreground py-2 px-3"
              >
                Kategoria
              </th>
              <th
                scope="col"
                className="text-right font-mono uppercase tracking-[0.12em] text-[10px] text-muted-foreground py-2 px-3 whitespace-nowrap"
              >
                Kwota
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((it) => {
              const pct = maxItem > 0 ? (it.amount / maxItem) * 100 : 0;
              return (
                <tr
                  key={it.categoryCode}
                  className="border-b border-border last:border-b-0"
                  style={{
                    background:
                      it.amount > 0
                        ? `linear-gradient(to right, var(--muted) ${pct}%, transparent ${pct}%)`
                        : undefined,
                  }}
                >
                  <td className="font-mono text-[11px] text-muted-foreground py-2 px-3 align-top">
                    {it.categoryCode}
                  </td>
                  <td className="py-2 px-3 align-top">
                    <div className="font-serif text-[14px] leading-snug" title={it.namePl}>
                      {it.shortLabel}
                    </div>
                    {it.notes && (
                      <div className="font-sans text-[11px] text-muted-foreground mt-0.5 leading-snug break-words">
                        {it.notes}
                      </div>
                    )}
                  </td>
                  <td className="text-right font-mono tabular-nums py-2 px-3 align-top whitespace-nowrap">
                    {it.amount > 0 ? fmtPLN(it.amount, { precise: true }) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="font-sans text-[11px] text-muted-foreground leading-snug mb-4">
        Wykazano {nonZero.length} z 23 kategorii. Pozostałe były zerowe w okresie
        sprawozdawczym.
      </p>

      {/* Footer: provenance */}
      <div className="border-t border-border pt-3 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between font-sans text-[11px] text-muted-foreground">
        <div>
          {report.publishedAt && (
            <>Opublikowane: <span className="text-foreground">{fmtDate(report.publishedAt)}</span></>
          )}
          {report.approvedByPresidiumAt && (
            <>
              {report.publishedAt ? " · " : ""}
              zatwierdzone:{" "}
              <span className="text-foreground">{fmtDate(report.approvedByPresidiumAt)}</span>
            </>
          )}
        </div>
        <a
          href={report.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono uppercase tracking-[0.14em] text-[10px] underline underline-offset-2 hover:text-foreground"
        >
          Sprawozdanie (PDF, Sejm) →
        </a>
      </div>
    </div>
  );
}
