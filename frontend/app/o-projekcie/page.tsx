import { Ornament } from "@/components/chrome/Ornament";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { getInfraCosts } from "@/lib/db/budzet";
import { getPatroniteStats } from "@/lib/patronite";

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

const COSTS_MONTHLY: Array<[string, number]> = [
  ["ETL — pobieranie z Sejmu + LLM", 100],
  ["Infrastruktura — serwer, baza, hosting", 100],
  ["Narzędzia + AI dla programistów", 400],
] as const;

const FLOW_STEPS = [
  {
    num: "01",
    kicker: "Źródła",
    title: "Publiczne dokumenty i dane",
    body: "Druki, głosowania, komisje, stenogramy i akty prawne pobierane z oficjalnych publikacji.",
  },
  {
    num: "02",
    kicker: "Przetwarzanie",
    title: "Parsery, normalizacja, łączenie",
    body: "Spinamy rozproszone rekordy w jeden proces legislacyjny i pilnujemy śladu pochodzenia.",
  },
  {
    num: "03",
    kicker: "Publikacja",
    title: "Tygodnik i narzędzia",
    body: "Dopiero na końcu powstają podsumowania, atlasy i widoki, które odsyłają do podstawy.",
  },
] as const;

const PRINCIPLES = [
  "Źródłem prawdy są dane publiczne i dokumenty.",
  "Każdy skrót powinien dać się rozwinąć do etapu, głosowania albo druku.",
  "AI pomaga pomocniczo: w klasyfikacji i redakcji, nie w ustalaniu faktów.",
] as const;

function fmtPL(n: number): string {
  return n.toLocaleString("pl-PL");
}

function PatroniteUnavailableNotice() {
  return (
    <aside
      className="mb-12 px-5 py-4 border-l-4"
      style={{
        borderColor: "var(--warning)",
        background: "var(--muted)",
      }}
    >
      <div
        className="font-mono text-[10px] tracking-[0.18em] uppercase mb-1.5"
        style={{ color: "var(--warning)" }}
      >
        ✶ &nbsp; Wpływy chwilowo niedostępne &nbsp; ✶
      </div>
      <p
        className="font-serif text-[15px] leading-[1.55] m-0 text-foreground"
        style={{ maxWidth: 720 }}
      >
        Nie udało się pobrać danych z Patronite. Aktualny stan wpływów sprawdzisz wprost na{" "}
        <a
          href="https://patronite.pl/tygodniksejmowy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-destructive hover:underline"
        >
          patronite.pl/tygodniksejmowy
        </a>
        . Pierwsza pełna księga z fakturami: czerwiec 2026.
      </p>
    </aside>
  );
}

export default async function AboutProjectPage() {
  const [costs, patron] = await Promise.all([
    safe(getInfraCosts(), { rows: [], isEmpty: true }),
    safe(getPatroniteStats(), {
      activeCount: 0,
      monthlyAmount: 0,
      inactiveCount: 0,
      totalEverCount: 0,
      fetchedAt: "",
      ok: false,
    }),
  ]);

  const costRows: Array<[string, number]> = costs.isEmpty
    ? [...COSTS_MONTHLY]
    : Array.from(
        costs.rows.reduce<Map<string, number>>((m, r) => {
          if (!m.has(r.category)) m.set(r.category, r.zl);
          return m;
        }, new Map()),
      );

  const costsTotal = costRows.reduce((s, [, v]) => s + v, 0);
  const totalSixMonths = costsTotal * 6;
  const monthlyIncome = patron.ok ? patron.monthlyAmount : 0;
  const patronCount = patron.ok ? patron.activeCount : 0;
  const totalEverCount = patron.ok ? patron.totalEverCount : 0;
  const coveragePct = costsTotal > 0
    ? Math.min(100, Math.round((monthlyIncome / costsTotal) * 100))
    : 0;

  const patroniteUnavailable = !patron.ok;

  return (
    <main className="bg-background text-foreground font-serif px-4 sm:px-8 md:px-14 pt-10 sm:pt-12 pb-24 sm:pb-28">
      <div className="max-w-[1100px] mx-auto">
        <PageBreadcrumb
          items={[{ label: "O projekcie" }]}
          subtitle="Warsztat, źródła i transparentność — najpierw dane, dopiero potem tekst."
        />

        <section className="mb-16 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <SectionTitle
              kicker="Jak to powstaje"
              title="Prosty pipeline, mała warstwa AI"
            />
            <div className="grid gap-4">
              {FLOW_STEPS.map((step, index) => (
                <div key={step.num} className="relative">
                  {index < FLOW_STEPS.length - 1 ? (
                    <span
                      aria-hidden
                      className="absolute left-5 top-[58px] h-[calc(100%-32px)] w-px bg-border"
                    />
                  ) : null}
                  <div className="flex gap-4">
                    <div className="w-10 shrink-0 flex flex-col items-center">
                      <span className="w-10 h-10 rounded-full border border-rule bg-muted flex items-center justify-center font-mono text-[11px] text-destructive">
                        {step.num}
                      </span>
                    </div>
                    <div className="flex-1 border border-border bg-muted/50 px-4 py-4 rounded-md">
                      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
                        {step.kicker}
                      </div>
                      <div className="font-serif text-[22px] font-medium tracking-[-0.02em] leading-tight">
                        {step.title}
                      </div>
                      <p className="m-0 mt-2 font-sans text-[13px] leading-[1.65] text-secondary-foreground">
                        {step.body}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="border border-rule rounded-lg bg-muted/40 p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">
                  Rola AI
                </div>
                <span className="px-2.5 py-1 rounded-full border border-border bg-background font-sans text-[11px] text-muted-foreground">
                  prawie nie dotyka źródeł
                </span>
              </div>
              <p className="m-0 font-serif text-[17px] leading-[1.55] text-foreground">
                AI pomaga przy klasyfikacji i redakcji. Nie ustala faktów, nie zastępuje dokumentów
                i nie jest miejscem, z którego bierzemy prawdę o procesie.
              </p>
            </div>

            <div className="border border-border rounded-lg bg-background p-5">
              <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-3">
                Zasady
              </div>
              <div className="grid gap-3">
                {PRINCIPLES.map((principle) => (
                  <div
                    key={principle}
                    className="border border-dashed border-border rounded-md px-4 py-3 font-sans text-[13px] leading-[1.6] text-secondary-foreground"
                  >
                    {principle}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <Ornament />

        {patroniteUnavailable ? <PatroniteUnavailableNotice /> : null}

        <section className="mb-16">
          <SectionTitle
            kicker="Transparentność"
            title="Finanse projektu"
          />
          <p
            className="font-serif text-[16px] leading-[1.65] text-secondary-foreground m-0 mb-8 max-w-[760px]"
          >
            Odpowiedzialność to też pokazywanie kosztów. Dlatego obok metody publikujemy bieżące
            wpływy, miesięczny burn i to, z czego składa się utrzymanie projektu.
          </p>

          {patron.ok ? (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
              <BigStat
                kicker="Patroni · aktywni"
                value={fmtPL(patronCount)}
                unit={totalEverCount > patronCount
                  ? `aktywni · ${fmtPL(totalEverCount)} kiedykolwiek`
                  : "osób"}
              />
              <BigStat
                kicker="Bieżące wpływy"
                value={fmtPL(monthlyIncome)}
                unit="zł / mc"
                accent
              />
              <BigStat
                kicker="Pokrycie kosztów"
                value={`${coveragePct}%`}
                unit={`z ${fmtPL(costsTotal)} zł/mc`}
              />
            </section>
          ) : null}

          <div className="grid md:grid-cols-2 gap-10">
            <div>
              <h3 className="font-serif text-[18px] font-medium m-0 mb-3 pb-2 border-b border-rule">
                Koszty miesięczne
              </h3>
              {costRows.map(([label, zl]) => {
                const pct = (zl / costsTotal) * 100;
                return (
                  <div key={label} className="py-2 border-b border-dotted border-border">
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <span className="font-serif text-[15px] text-secondary-foreground">{label}</span>
                      <span className="font-mono text-[13px] font-medium tabular-nums">
                        {fmtPL(zl)} zł / mc
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted border border-border">
                      <div
                        className="h-full bg-foreground"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-baseline justify-between pt-3 mt-2 border-t-2 border-foreground">
                <span className="font-serif text-[16px] font-medium">Razem · 6 miesięcy</span>
                <span className="font-mono text-[16px] font-semibold text-destructive tabular-nums">
                  {fmtPL(totalSixMonths)} zł
                </span>
              </div>
            </div>

            <div>
              <h3 className="font-serif text-[18px] font-medium m-0 mb-3 pb-2 border-b border-rule">
                Skąd wpływy
              </h3>
              {patron.ok ? (
                <>
                  <IncomeRow
                    label={`Patronite · ${fmtPL(patronCount)} ${patronCount === 1 ? "patron" : "patronów"} aktywnych`}
                    value={`${fmtPL(monthlyIncome)} zł / mc`}
                  />
                  {totalEverCount > patronCount ? (
                    <IncomeRow
                      label={`Patronite · ${fmtPL(totalEverCount - patronCount)} dawnych patronów`}
                      value="—"
                      muted
                    />
                  ) : null}
                </>
              ) : (
                <IncomeRow
                  label="Patronite — dane chwilowo niedostępne"
                  value="—"
                  muted
                />
              )}
              <p
                className="font-serif text-[14px] text-secondary-foreground mt-6 leading-[1.55]"
                style={{ maxWidth: 520 }}
              >
                Patronite to nasz fundament — stała kwota, która pozwala planować rozwój i nie
                uzależniać projektu od reklam ani sponsorów. {patron.ok ? (
                  <>Dane pobieramy bezpośrednio z Patronite i odświeżamy co godzinę.</>
                ) : null}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function BigStat({
  kicker,
  value,
  unit,
  accent = false,
}: {
  kicker: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  const valueColor = accent ? "text-destructive italic" : "text-foreground";
  return (
    <div
      className="bg-background border-2 border-foreground p-6"
      style={{ boxShadow: "5px 5px 0 var(--foreground)" }}
    >
      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
        {kicker}
      </div>
      <div
        className={`font-serif font-normal leading-none ${valueColor}`}
        style={{ fontSize: "clamp(2.25rem, 9vw, 3.25rem)", letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      <div className="font-mono text-[11px] text-muted-foreground mt-2 tracking-wider">{unit}</div>
    </div>
  );
}

function SectionTitle({
  kicker,
  title,
}: {
  kicker: string;
  title: string;
}) {
  return (
    <header className="mb-6 pb-3 border-b border-rule">
      <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-muted-foreground mb-1.5">
        {kicker}
      </div>
      <h2 className="font-serif font-medium m-0 text-[28px] leading-[1.05]" style={{ letterSpacing: "-0.01em" }}>
        {title}
      </h2>
    </header>
  );
}

function IncomeRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2 border-b border-dotted border-border ${muted ? "text-muted-foreground" : ""}`}
    >
      <span className="font-serif text-[15px]">{label}</span>
      <span className="font-mono text-[13px] tabular-nums">{value}</span>
    </div>
  );
}
