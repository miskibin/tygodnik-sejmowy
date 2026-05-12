import Link from "next/link";
import { Ornament } from "@/components/chrome/Ornament";
import { PatroniteTrackedLink } from "@/components/chrome/PatroniteTrackedLink";
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

const AUTHORS = [
  {
    name: "miskibin",
    role: "autor i operator projektu",
    body: "Produkt, ETL, frontend, warstwa danych i redakcja odpowiedzialności są prowadzone w jednym miejscu.",
    ctaLabel: "repozytorium projektu →",
    href: "https://github.com/miskibin/tygodnik-sejmowy",
  },
  {
    name: "patroni i patronki",
    role: "finansowanie i trwałość",
    body: "Społeczność utrzymuje projekt przy życiu, ale nie podmienia źródeł, procesu ani odpowiedzialności za publikację.",
    ctaLabel: "wesprzyj na Patronite →",
    href: "https://patronite.pl/tygodniksejmowy",
  },
] as const;

function fmtPL(n: number): string {
  return n.toLocaleString("pl-PL");
}

function MockChip() {
  return (
    <span
      className="font-mono text-[10px] tracking-[0.1em] uppercase px-1.5 py-0.5 border ml-3 align-middle"
      style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
      title="Dane poglądowe — tabela jeszcze pusta, pokazujemy modelowe liczby"
    >
      przykładowo
    </span>
  );
}

function MockNotice() {
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
        ✶ &nbsp; Uwaga &nbsp; ✶
      </div>
      <p
        className="font-serif text-[15px] leading-[1.55] m-0 text-foreground"
        style={{ maxWidth: 720 }}
      >
        Wpływy z Patronite i koszty miesięczne są realne. Pierwsza pełna księga z fakturami w czerwcu 2026.
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

  const headlineIsMock = !patron.ok;
  const incomeIsMock = !patron.ok;
  const anyMock = headlineIsMock || incomeIsMock;

  return (
    <main className="bg-background text-foreground font-serif px-4 sm:px-8 md:px-14 pt-10 sm:pt-12 pb-24 sm:pb-28">
      <div className="max-w-[1100px] mx-auto">
        <header className="mb-12 pb-7 border-b-2 border-rule">
          <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-destructive mb-3">
            ✶ &nbsp; Warsztat, źródła i transparentność &nbsp; ✶
          </div>
          <h1
            className="font-serif font-medium m-0 leading-[0.96]"
            style={{ fontSize: "clamp(2.5rem, 7vw, 4.75rem)", letterSpacing: "-0.035em" }}
          >
            Dane najpierw.
            <br />
            <em className="text-destructive font-serif italic">Tekst dopiero potem.</em>
          </h1>
          <p
            className="font-serif text-secondary-foreground max-w-[760px] mt-6 mb-0"
            style={{ fontSize: 18, lineHeight: 1.6 }}
          >
            Supagraf nie zaczyna od narracji. Najpierw zbieramy publiczne źródła, łączymy je w
            proces legislacyjny i zachowujemy provenance. Dopiero potem opisujemy skutki prostym
            językiem i pokazujemy, skąd ten opis się bierze.
          </p>
        </header>

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

        <section className="mb-16">
          <SectionTitle
            kicker="Autorzy"
            title="Kto za tym stoi"
          />
          <p className="font-serif text-[16px] leading-[1.65] text-secondary-foreground m-0 mb-8 max-w-[760px]">
            Ta strona nie jest bezosobowym interfejsem. Jest podpisana: wiadomo, kto odpowiada za
            produkt, kod, pipeline i publikację, a także skąd bierze się finansowanie projektu.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            {AUTHORS.map((author) => (
              <article
                key={author.name}
                className="border border-rule bg-background rounded-lg p-5 md:p-6"
              >
                <div className="font-serif text-[27px] md:text-[31px] font-medium tracking-[-0.02em] leading-none">
                  {author.name}
                </div>
                <div className="mt-2 font-mono text-[10px] tracking-[0.16em] uppercase text-destructive">
                  {author.role}
                </div>
                <p className="m-0 mt-4 font-sans text-[13px] leading-[1.65] text-secondary-foreground">
                  {author.body}
                </p>
                <div className="mt-5 border-t border-dashed border-border pt-3">
                  {author.href.includes("patronite.pl") ? (
                    <PatroniteTrackedLink placement="about-project-authors" className="font-sans text-[11.5px] tracking-wide text-destructive hover:underline">
                      {author.ctaLabel}
                    </PatroniteTrackedLink>
                  ) : (
                    <Link
                      href={author.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-sans text-[11.5px] tracking-wide text-destructive hover:underline"
                    >
                      {author.ctaLabel}
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <Ornament />

        {anyMock ? <MockNotice /> : null}

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

          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            <BigStat
              kicker={patron.ok ? "Patroni · aktywni" : "Patroni · od początku"}
              value={fmtPL(patron.ok ? patronCount : 0)}
              unit={patron.ok && totalEverCount > patronCount
                ? `aktywni · ${fmtPL(totalEverCount)} kiedykolwiek`
                : "osób"}
              mock={headlineIsMock}
            />
            <BigStat
              kicker="Bieżące wpływy"
              value={fmtPL(monthlyIncome)}
              unit="zł / mc"
              accent
              mock={headlineIsMock}
            />
            <BigStat
              kicker="Pokrycie kosztów"
              value={`${coveragePct}%`}
              unit={`z ${fmtPL(costsTotal)} zł/mc`}
              mock={headlineIsMock}
            />
          </section>

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
              <h3 className="font-serif text-[18px] font-medium m-0 mb-3 pb-2 border-b border-rule flex items-baseline">
                <span>Skąd wpływy</span>
                {incomeIsMock ? <MockChip /> : null}
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
                  label="Patronite — brak tokena (PATRONITE_TOKEN)"
                  value="—"
                  mock
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
  mock = false,
}: {
  kicker: string;
  value: string;
  unit: string;
  accent?: boolean;
  mock?: boolean;
}) {
  const valueColor = mock
    ? "text-muted-foreground italic"
    : accent
      ? "text-destructive italic"
      : "text-foreground";
  return (
    <div
      className="bg-background border-2 border-foreground p-6"
      style={{ boxShadow: "5px 5px 0 var(--foreground)" }}
    >
      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
        {kicker}
        {mock ? (
          <span
            className="ml-2 normal-case tracking-normal"
            style={{ color: "var(--warning)" }}
          >
            (przykładowo)
          </span>
        ) : null}
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
  mock = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  mock?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2 border-b border-dotted border-border ${muted ? "text-muted-foreground" : ""}`}
    >
      <span className="font-serif text-[15px]">{label}</span>
      <span
        className={`font-mono text-[13px] tabular-nums ${mock ? "italic text-muted-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
