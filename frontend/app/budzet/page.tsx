import type { Metadata } from "next";
import Image from "next/image";
import { Ornament } from "@/components/chrome/Ornament";

export const metadata: Metadata = {
  alternates: { canonical: "/budzet" },
};
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { getInfraCosts } from "@/lib/db/budzet";
import { getPatroniteStats } from "@/lib/patronite";


async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

// Real monthly burn (declared by operator, not yet sourced from invoices DB):
//   ETL ........................ 100 zł/mc  (Sejm fetch + LLM enrichment)
//   Infrastruktura ............. 100 zł/mc  (server, DB, hosting)
//   Narzędzia + AI dla devów ... 400 zł/mc  (Claude/Codex/Cursor seats etc.)
const COSTS_MONTHLY: Array<[string, number]> = [
  ["ETL — pobieranie z Sejmu + LLM", 100],
  ["Infrastruktura — serwer, baza, hosting", 100],
  ["Narzędzia + AI dla programistów", 400],
];
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
        Wpływy z Patronite i koszty miesięczne — realne. Pierwsza pełna księga z fakturami w czerwcu 2026.
      </p>
    </aside>
  );
}

export default async function BudzetPage() {
  const [costs, patron] = await Promise.all([
    safe(getInfraCosts(), { rows: [], isEmpty: true }),
    getPatroniteStats(),
  ]);

  // Cost rows: prefer DB-grouped invoices when present, otherwise the
  // operator-declared monthly burn above.
  const costRows: Array<[string, number]> = costs.isEmpty
    ? COSTS_MONTHLY
    : Array.from(
        costs.rows.reduce<Map<string, number>>((m, r) => {
          if (!m.has(r.category)) m.set(r.category, r.zl);
          return m;
        }, new Map())
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
  // Costs are operator-declared real numbers (not yet from invoices DB) — they
  // are NOT mock.
  const anyMock = headlineIsMock || incomeIsMock;

  return (
    <main className="bg-background text-foreground font-serif px-4 sm:px-8 md:px-14 pt-10 sm:pt-12 pb-24 sm:pb-28">
      <div className="max-w-[1100px] mx-auto">
        <PageBreadcrumb
          items={[{ label: "Budżet" }]}
          subtitle="Pełen budżet projektu, aktualizowany co miesiąc. Wpływy z Patronite, koszty serwera, hosting, domeny."
        />

        {anyMock ? <MockNotice /> : null}

        {/* Big numbers row */}
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

        <Ornament />

        {/* Costs breakdown */}
        <section className="mb-16">
          <SectionTitle
            kicker="Koszty miesięczne"
            title="Na co idzie kasa"
          />
          <div className="grid md:grid-cols-2 gap-10">
            <div>
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
                  {totalEverCount > patronCount && (
                    <IncomeRow
                      label={`Patronite · ${fmtPL(totalEverCount - patronCount)} dawnych patronów`}
                      value="—"
                      muted
                    />
                  )}
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
                Patronite to nasz fundament — stała kwota, która pozwala nam planować rok do przodu zamiast reagować z miesiąca na miesiąc.{patron.ok && (
                  <>{" "}Dane pobrane bezpośrednio z Patronite, odświeżane co godzinę.</>
                )}
              </p>
            </div>
          </div>
        </section>

        <Ornament />

        {/* Team */}
        <section className="mb-4">
          <SectionTitle
            kicker="Zespół"
            title="Kto za tym stoi"
          />
          <div className="grid md:grid-cols-2 gap-8">
            <TeamCard
              photo="/michal-skibinski.jpg"
              name="Michał Skibiński"
              role="Developer · Twórca"
              bio="Buduje Tygodnik Sejmowy od pierwszej linijki — ETL z Sejmu, baza, backend, frontend, design. Cały kod open source na GitHubie."
            />
            <TeamCard
              photo="/michal-sulawiak.jpg"
              name="Michał Sulawiak"
              role="DevOps · Współfundator"
              bio="Utrzymuje serwery i infrastrukturę, planuje rozwój projektu i pokrywa większość kosztów. Bez niego Tygodnika Sejmowego by nie było."
            />
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
  note,
}: {
  kicker: string;
  title: string;
  note?: React.ReactNode;
}) {
  return (
    <header className="mb-6 pb-3 border-b border-rule">
      <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-muted-foreground mb-1.5">
        {kicker}
        {note}
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

function TeamCard({
  photo,
  name,
  role,
  bio,
}: {
  photo: string;
  name: string;
  role: string;
  bio: string;
}) {
  return (
    <div
      className="bg-background border-2 border-foreground p-5 sm:p-6 flex gap-5 items-start"
      style={{ boxShadow: "5px 5px 0 var(--foreground)" }}
    >
      <div className="shrink-0 border-2 border-foreground overflow-hidden bg-muted">
        <Image
          src={photo}
          alt={name}
          width={140}
          height={140}
          className="block w-[110px] h-[110px] sm:w-[140px] sm:h-[140px] object-cover"
        />
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-destructive mb-1.5">
          {role}
        </div>
        <h3
          className="font-serif font-medium m-0 mb-2 leading-tight"
          style={{ fontSize: "clamp(1.15rem, 2.2vw, 1.4rem)", letterSpacing: "-0.01em" }}
        >
          {name}
        </h3>
        <p className="font-serif text-[14.5px] leading-[1.55] text-secondary-foreground m-0">
          {bio}
        </p>
      </div>
    </div>
  );
}
