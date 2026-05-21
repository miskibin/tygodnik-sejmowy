import {
  Users,
  GraduationCap,
  ScrollText,
  Scale,
  Phone,
  PhoneCall,
  Mail,
  CalendarDays,
  Car,
  CarTaxiFront,
  Building2,
  Wrench,
  Hammer,
  Newspaper,
  Package,
  Plane,
  PiggyBank,
  Sun,
  Calculator,
  ShieldCheck,
  Tv,
  Globe,
  MoreHorizontal,
  Flag,
  type LucideIcon,
} from "lucide-react";

import type { MpOfficeExpenseReport } from "@/lib/db/posel-tabs";
import { BopInfoDialog } from "./BopInfoDialog";
import { ExpensesShareButton } from "./ExpensesShareButton";

// Public GitHub repo where readers can flag data issues. New-issue endpoint
// supports query params for title, body and labels.
const GH_NEW_ISSUE = "https://github.com/miskibin/tygodnik-sejmowy/issues/new";

function buildReportIssueUrl({
  mpId,
  mpName,
  year,
  sourceUrl,
  confidence,
}: {
  mpId: number;
  mpName: string;
  year: number;
  sourceUrl: string;
  confidence: "verified" | "unverified";
}): string {
  const title = `Niespójność: wydatki biura — ${mpName} (${year})`;
  const body = [
    `**Profil posła:** ${mpName} (mp_id: ${mpId})`,
    `**Okres sprawozdawczy:** ${year}`,
    `**Status danych w bazie:** ${confidence}`,
    `**Oryginalne sprawozdanie (PDF):** ${sourceUrl}`,
    "",
    "---",
    "",
    "**Opisz niespójność** (czego dotyczy i jak ją zauważyłeś_aś):",
    "",
    'np. "kategoria 9 — przejazdy samochodem — strona pokazuje 38 000 zł, w PDF widnieje 25 000 zł"',
    "",
    "",
  ].join("\n");
  const params = new URLSearchParams({
    title,
    body,
    labels: "wydatki-biura,data-quality",
  });
  return `${GH_NEW_ISSUE}?${params.toString()}`;
}

function ReportIssueButton({
  mpId,
  mpName,
  year,
  sourceUrl,
  confidence,
}: {
  mpId: number;
  mpName: string;
  year: number;
  sourceUrl: string;
  confidence: "verified" | "unverified";
}) {
  const href = buildReportIssueUrl({ mpId, mpName, year, sourceUrl, confidence });
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.14em] text-[10px] text-muted-foreground hover:text-foreground transition-colors"
    >
      <Flag size={12} strokeWidth={1.6} aria-hidden />
      Zgłoś niespójność
    </a>
  );
}

// Lp. → lucide icon for the 23 standardized BOP categories (Załącznik nr 1
// do zarządzenia nr 2 Marszałka Sejmu z 31 III 2017 r.).
const CATEGORY_ICONS: Record<number, LucideIcon> = {
  1: Users,            // Wynagrodzenia pracowników (UoP)
  2: GraduationCap,    // Badania i szkolenia
  3: ScrollText,       // Umowy zlecenia / o dzieło
  4: Scale,            // Ekspertyzy, opinie, tłumaczenia
  5: Phone,            // Telekomunikacja (mandat)
  6: PhoneCall,        // Telekomunikacja (Dom Poselski)
  7: Mail,             // Korespondencja i ogłoszenia
  8: CalendarDays,     // Wynajem sal na spotkania
  9: Car,              // Przejazdy posła (samochód)
  10: CarTaxiFront,    // Przejazdy posła (taxi)
  11: Building2,       // Najem lokalu biura
  12: Wrench,          // Konserwacja sprzętu
  13: Hammer,          // Naprawy i remonty lokalu
  14: Newspaper,       // Materiały biurowe i prasa
  15: Package,         // Środki trwałe (wyposażenie)
  16: Plane,           // Podróże pracowników
  17: PiggyBank,       // ZFŚS
  18: Sun,             // Świadczenia urlopowe
  19: Calculator,      // Księgowość i bank
  20: ShieldCheck,     // Polisa OC biura
  21: Tv,              // Abonament RTV
  22: Globe,           // Strona internetowa biura
  23: MoreHorizontal,  // Inne wydatki
};

const PLN_INT = new Intl.NumberFormat("pl-PL", {
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
  return (opts.precise ? PLN_FRAC : PLN_INT).format(v);
}

function fmtPct(v: number | null, opts: { decimals?: number } = {}): string {
  if (v == null) return "—";
  return `${v.toLocaleString("pl-PL", {
    minimumFractionDigits: opts.decimals ?? 1,
    maximumFractionDigits: opts.decimals ?? 1,
  })}%`;
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

function CategoryRow({
  code,
  shortLabel,
  namePl,
  amount,
  notes,
  shareBase,
  maxAmount,
  precise,
  categoryMedian,
  categoryNonzeroCount,
}: {
  code: number;
  shortLabel: string;
  namePl: string;
  amount: number;
  notes: string | null;
  shareBase: number;
  maxAmount: number;
  precise: boolean;
  categoryMedian: number | null;
  categoryNonzeroCount: number;
}) {
  const Icon = CATEGORY_ICONS[code] ?? MoreHorizontal;
  const barPct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
  const sharePct = shareBase > 0 ? (amount / shareBase) * 100 : null;
  // Deviation badge: shown only when:
  // - this MP spent > 5 000 zł on the category (under that, % deviation is
  //   noise — a "+220 % niż mediana" on 2 000 zł vs 600 zł median reads as
  //   scandalous despite being trivial in absolute terms);
  // - the category has a meaningful sample (≥30 MPs spent on it);
  // - deviation from the median is at least ±25 %;
  // - the row is NOT a residual fallback. When the JSON scraper couldn't get
  //   kat 23 sub-items it dumped (funds_spent − sum(other 22)) into cat 23 to
  //   keep arithmetic consistent. That residual could be missing rent or
  //   salaries that OCR failed elsewhere — surfacing it as "huge Inne wydatki"
  //   would defame the MP. Marked by the inference note in `notes`.
  const isInferredResidual =
    code === 23 && (notes ?? "").includes("wyliczona jako roznica");
  let deviationPct: number | null = null;
  if (
    amount >= 5_000 &&
    !isInferredResidual &&
    categoryMedian != null &&
    categoryMedian > 0 &&
    categoryNonzeroCount >= 30
  ) {
    const d = ((amount - categoryMedian) / categoryMedian) * 100;
    if (Math.abs(d) >= 25) deviationPct = d;
  }
  return (
    <div
      className={
        // Mobile: stacked rows. The previous 4-col grid crammed every column
        // to ~80 px on a 360 px phone, truncated category labels to "Wy…"
        // and let long kat 23 notes push the layout into bizarre L-shapes.
        // sm+: original 4-col grid (icon+name | bar | amount | share).
        "py-3 px-3 sm:px-4 border-b border-border last:border-b-0 " +
        "flex flex-col gap-2 sm:grid sm:items-center sm:gap-4"
      }
      style={{
        // Only used at sm+ — `flex flex-col` ignores gridTemplateColumns
        // when grid display isn't active.
        gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1.4fr) auto auto",
      }}
    >
      {/* Top row (mobile) / col 1 (desktop): icon + name. Mobile also tucks
          the amount + share on the right so the headline row reads at a
          glance without scrolling past the bar. */}
      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
        <span className="shrink-0 mt-[2px] sm:mt-0 text-muted-foreground" aria-hidden>
          <Icon size={18} strokeWidth={1.5} />
        </span>
        <span
          className="font-serif text-[14px] sm:text-[15px] leading-snug flex-1 min-w-0 sm:truncate"
          title={namePl}
        >
          {shortLabel}
        </span>
        {/* Mobile-only stacked amount + share on the right of the name row */}
        <div className="sm:hidden flex flex-col items-end shrink-0 leading-tight">
          <span className="font-mono tabular-nums text-[13px] whitespace-nowrap">
            {fmtPLN(amount, { precise })}
          </span>
          {sharePct != null && (
            <span className="font-mono tabular-nums text-[10.5px] text-muted-foreground whitespace-nowrap mt-0.5">
              {fmtPct(sharePct)}
            </span>
          )}
        </div>
      </div>

      {/* Bar (mobile: full row) / col 2 (desktop) — with deviation + notes
          underneath. */}
      <div className="min-w-0">
        <div className="h-2 sm:h-2.5 rounded-full bg-muted/60 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${barPct}%`,
              background:
                "linear-gradient(90deg, var(--destructive) 0%, color-mix(in oklab, var(--destructive) 70%, black) 100%)",
            }}
            aria-hidden
          />
        </div>
        {(deviationPct != null || notes) && (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {deviationPct != null && (
              <span
                className="font-mono text-[10px] uppercase tracking-[0.06em] whitespace-nowrap"
                style={{
                  color:
                    deviationPct > 0 ? "var(--destructive)" : "var(--success)",
                }}
                title={`mediana w kategorii: ${categoryMedian!.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł (z ${categoryNonzeroCount} posłów z wydatkiem)`}
              >
                {deviationPct > 0 ? "+" : ""}
                {deviationPct.toLocaleString("pl-PL", {
                  maximumFractionDigits: 0,
                })}
                % niż mediana
              </span>
            )}
            {notes && (
              <span className="font-sans text-[10.5px] text-muted-foreground leading-snug break-words">
                {notes}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Desktop-only amount + share columns. Hidden on mobile because the
          values are already tucked into the icon-name row above. */}
      <div className="hidden sm:block font-mono tabular-nums text-[13px] sm:text-[14px] text-right whitespace-nowrap">
        {fmtPLN(amount, { precise })}
      </div>
      <div className="hidden sm:block font-mono tabular-nums text-[11px] sm:text-[12px] text-muted-foreground text-right whitespace-nowrap w-[3rem] sm:w-[3.5rem]">
        {sharePct != null ? fmtPct(sharePct) : "—"}
      </div>
    </div>
  );
}

export function Tab5OfficeExpensesPanel({
  report,
  mpId,
  mpName,
  klubRef,
}: {
  report: MpOfficeExpenseReport | null;
  mpId: number;
  mpName: string;
  klubRef: string | null;
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

  // For reports where we couldn't verify internal consistency (sum of items
  // != PDF's "Razem" within rounding), refuse to show the item breakdown.
  // Putting numbers we can't vouch for in front of readers is the worst
  // failure mode for this kind of public data.
  if (report.dataConfidence === "unverified") {
    return (
      <div className="min-w-0">
        <div className="border border-border bg-background">
          <div className="border-b border-border bg-muted/40 px-3 sm:px-4 py-3 flex items-center gap-2">
            <h3 className="font-serif text-[16px] sm:text-[18px] font-medium text-foreground m-0">
              Wydatki biura w {report.year} roku
            </h3>
            <BopInfoDialog />
          </div>
          <div className="px-3 sm:px-5 py-6 sm:py-8 max-w-[640px]">
            <p className="font-serif text-[14px] sm:text-[15px] leading-relaxed text-foreground m-0 mb-3">
              Sprawozdanie wymaga weryfikacji.
            </p>
            <p className="font-sans text-[12px] text-muted-foreground leading-snug m-0 mb-4">
              Maszynowy odczyt PDF zwrócił dane, które nie zgadzają się z kwotą &bdquo;Razem&rdquo;
              z formularza — najczęściej dotyczy to ręcznie wypełnianych pozycji
              w&nbsp;sekcji &bdquo;Inne wydatki&rdquo;, których parser pominął. Zamiast
              prezentować niespójne liczby pokazujemy link do oryginalnego dokumentu.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <a
                href={report.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.14em] text-[10.5px] text-foreground border border-border px-3 py-2 hover:bg-muted/40 transition-colors"
              >
                Otwórz sprawozdanie (PDF, Sejm) →
              </a>
              <ReportIssueButton
                mpId={mpId}
                mpName={mpName}
                year={report.year}
                sourceUrl={report.sourceUrl}
                confidence="unverified"
              />
            </div>
          </div>
        </div>
        <p className="font-sans text-[11px] text-muted-foreground leading-snug mt-3">
          Sprawozdania publikujemy stopniowo — w miarę jak Prezydium Sejmu zatwierdza
          kolejne i poprawiamy odczyt skanów ręcznie wypełnianych pól.
        </p>
      </div>
    );
  }

  const nonZero = report.items.filter((it) => it.amount > 0);
  const sortedNonZero = [...nonZero].sort((a, b) => b.amount - a.amount);
  const zeroItems = report.items.filter((it) => it.amount === 0);

  // Bars are sized relative to the largest non-zero amount so the biggest
  // row fills the bar column and smaller rows show their relative weight.
  const maxAmount = sortedNonZero[0]?.amount ?? 0;
  // Ground truth: the sum of what we'll actually display. Percentages are
  // shares of this sum so they always add to 100%. The PDF-reported
  // funds_spent / funds_total / funds_remaining are SHOWN ONLY when they
  // pass the consistency checks below — otherwise hidden to avoid putting
  // contradictory numbers in front of readers.
  const itemsSum = sortedNonZero.reduce((a, it) => a + it.amount, 0);

  // Trust funds_spent only if it matches sum(items) within 5 zł rounding
  // (some MPs use integer złotówki on the form, others decimal — either way
  // a 5 zł tolerance covers the worst rounding from 23 categories).
  const reportedSpent = report.fundsSpent;
  const spentMatchesSum =
    reportedSpent != null && Math.abs(reportedSpent - itemsSum) < 5;

  // Trust funds_total only if it equals allocated + carryover + interest
  // (the PDF's own arithmetic from points 1-4 of the form) AND >= 100 k zł
  // (anything smaller is parser noise — annual ryczałt is ~280 k).
  const arithmeticTotal =
    (report.fundsAllocated ?? 0) +
    (report.fundsCarryover ?? 0) +
    (report.fundsInterest ?? 0);
  const reportedTotal = report.fundsTotal;
  const totalIsConsistent =
    reportedTotal != null &&
    reportedTotal >= 100_000 &&
    Math.abs(reportedTotal - arithmeticTotal) < 5 &&
    (report.fundsAllocated ?? 0) >= 100_000;

  // Pozostało only when total AND spent are both trustworthy. We compute
  // remaining ourselves (reportedTotal − itemsSum) — the report's own
  // funds_remaining field is redundant when the upstream arithmetic adds up.
  const showRemaining =
    totalIsConsistent && spentMatchesSum && reportedTotal != null;
  const computedRemaining = showRemaining
    ? reportedTotal! - itemsSum
    : null;

  // Detect precision mode: jakglosuja-derived rows are all integers (no .NN),
  // OCR+LLM-derived rows carry decimals. Render decimals only when present.
  const hasFraction = sortedNonZero.some((it) => Math.round(it.amount) !== it.amount);

  // Headline figure shown to the user is ALWAYS sum(items) — that's what
  // the 23 rows below add up to. We compute % of ryczałt only when we
  // have a trustworthy reported total.
  const headlineSpent = itemsSum;
  const utilizationPct = totalIsConsistent && reportedTotal!
    ? (headlineSpent / reportedTotal!) * 100
    : null;

  return (
    <div className="min-w-0">
      {/* KPI strip — hide tiles we don't have honest data for */}
      <div
        className={`grid grid-cols-1 gap-3 mb-6 ${totalIsConsistent ? "sm:grid-cols-3" : "sm:grid-cols-1 max-w-md"}`}
      >
        {totalIsConsistent && (
          <KpiTile
            label="Ryczałt do rozliczenia"
            value={fmtPLN(reportedTotal)}
            sub={
              report.fundsCarryover && report.fundsCarryover > 0
                ? `w tym z poprzedniego okresu: ${fmtPLN(report.fundsCarryover)}`
                : "łącznie w okresie sprawozdawczym"
            }
          />
        )}
        <KpiTile
          label="Wydatki łącznie"
          value={fmtPLN(headlineSpent, { precise: hasFraction })}
          sub={
            utilizationPct != null
              ? `${utilizationPct.toLocaleString("pl-PL", {
                  maximumFractionDigits: 1,
                })}% ryczałtu`
              : `suma ${sortedNonZero.length} kategorii`
          }
          emphasis={
            utilizationPct == null
              ? "neutral"
              : utilizationPct >= 95
                ? "warn"
                : "neutral"
          }
        />
        {showRemaining && computedRemaining != null && (
          <KpiTile
            label="Pozostało"
            value={fmtPLN(computedRemaining)}
            sub="niewykorzystane środki ryczałtu"
            emphasis={computedRemaining > 0 ? "good" : "neutral"}
          />
        )}
      </div>

      {/* Data quality disclosure when PDF-reported numbers disagree with our sum */}
      {reportedSpent != null && !spentMatchesSum && (
        <div className="mb-4 p-3 border-l-2 border-warning bg-warning/5 font-sans text-[11.5px] text-muted-foreground leading-snug">
          <strong className="text-foreground">Uwaga.</strong> Suma 23 kategorii poniżej
          ({fmtPLN(itemsSum, { precise: hasFraction })}) różni się od kwoty
          &bdquo;wydatkowano&rdquo; zadeklarowanej w PDF ({fmtPLN(reportedSpent, { precise: hasFraction })}).
          Może to wynikać z ograniczeń maszynowego odczytu PDF — zalecamy weryfikację w{" "}
          <a
            href={report.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            oryginalnym sprawozdaniu
          </a>
          .
        </div>
      )}

      {/* Expense table */}
      <div className="border border-border bg-background">
        {/* Table header */}
        <div className="border-b border-border bg-muted/40 px-3 sm:px-4 py-3 flex items-center gap-2">
          <h3 className="font-serif text-[16px] sm:text-[18px] font-medium text-foreground m-0">
            Wydatki biura w {report.year} roku
          </h3>
          <BopInfoDialog />
        </div>
        {/* Header row. On mobile (where CategoryRow stacks) we collapse to
            a single "Kategoria · Kwota / Udział" line to match the new
            row layout. Desktop keeps the 4-col headers aligned with rows. */}
        <div
          className="flex sm:grid items-center justify-between gap-3 sm:gap-4 px-3 sm:px-4 py-2 border-b border-border bg-muted/20"
          style={{
            gridTemplateColumns:
              "minmax(0, 1.6fr) minmax(0, 1.4fr) auto auto",
          }}
        >
          <div className="font-mono uppercase tracking-[0.12em] text-[9.5px] sm:text-[10px] text-muted-foreground">
            Kategoria wydatku
          </div>
          <div className="hidden sm:block" aria-hidden />
          <div className="font-mono uppercase tracking-[0.12em] text-[9.5px] sm:text-[10px] text-muted-foreground text-right whitespace-nowrap">
            <span className="sm:hidden">Kwota / udział</span>
            <span className="hidden sm:inline">Kwota</span>
          </div>
          <div className="hidden sm:block font-mono uppercase tracking-[0.12em] text-[9.5px] sm:text-[10px] text-muted-foreground text-right whitespace-nowrap w-[3rem] sm:w-[3.5rem]">
            Udział
          </div>
        </div>

        {sortedNonZero.length === 0 ? (
          <div className="py-8 text-center font-serif italic text-muted-foreground">
            Brak wykazanych wydatków.
          </div>
        ) : (
          sortedNonZero.map((it) => (
            <CategoryRow
              key={it.categoryCode}
              code={it.categoryCode}
              shortLabel={it.shortLabel}
              namePl={it.namePl}
              amount={it.amount}
              notes={it.notes}
              shareBase={itemsSum}
              maxAmount={maxAmount}
              precise={hasFraction}
              categoryMedian={it.categoryMedian}
              categoryNonzeroCount={it.categoryNonzeroCount}
            />
          ))
        )}

        {/* Zero-amount categories — collapsed, no JS */}
        {zeroItems.length > 0 && (
          <details className="border-t border-border">
            <summary className="cursor-pointer list-none px-3 sm:px-4 py-3 font-sans text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
              <span className="font-mono uppercase tracking-[0.12em] text-[10px]">
                Pokaż {zeroItems.length} kategorii bez wydatków
              </span>
              <span className="text-[10px] opacity-50" aria-hidden>▾</span>
            </summary>
            {zeroItems
              .sort((a, b) => a.categoryCode - b.categoryCode)
              .map((it) => (
                <CategoryRow
                  key={it.categoryCode}
                  code={it.categoryCode}
                  shortLabel={it.shortLabel}
                  namePl={it.namePl}
                  amount={it.amount}
                  notes={it.notes}
                  shareBase={itemsSum}
                  maxAmount={maxAmount}
                  precise={hasFraction}
                  categoryMedian={it.categoryMedian}
                  categoryNonzeroCount={it.categoryNonzeroCount}
                />
              ))}
          </details>
        )}
      </div>

      <p className="font-sans text-[11px] text-muted-foreground leading-snug mt-3 mb-4">
        Dane ze sprawozdania zatwierdzonego przez Prezydium Sejmu (Załącznik nr 1
        do zarz. nr 2 Marsz. Sejmu z 31 III 2017 r.).{" "}
        {hasFraction
          ? "Odczytane maszynowo ze skanu PDF — możliwe drobne nieścisłości."
          : "Kwoty zaokrąglone do pełnych złotych."}{" "}
        <strong>Wiążący jest oryginalny PDF</strong> (link poniżej).
      </p>

      {/* Footer: provenance */}
      <div className="border-t border-border pt-3 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between font-sans text-[11px] text-muted-foreground">
        <div>
          {report.publishedAt && (
            <>
              Opublikowane:{" "}
              <span className="text-foreground">{fmtDate(report.publishedAt)}</span>
            </>
          )}
          {report.approvedByPresidiumAt && (
            <>
              {report.publishedAt ? " · " : ""}
              zatwierdzone:{" "}
              <span className="text-foreground">{fmtDate(report.approvedByPresidiumAt)}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a
            href={report.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono uppercase tracking-[0.14em] text-[10px] underline underline-offset-2 hover:text-foreground"
          >
            Sprawozdanie (PDF, Sejm) →
          </a>
          <ExpensesShareButton
            mpId={mpId}
            mpName={mpName}
            klubRef={klubRef}
            year={report.year}
            totalSpent={itemsSum}
            topItems={sortedNonZero.slice(0, 4).map((it) => ({
              categoryCode: it.categoryCode,
              shortLabel: it.shortLabel,
              amount: it.amount,
            }))}
            precise={hasFraction}
          />
          <ReportIssueButton
            mpId={mpId}
            mpName={mpName}
            year={report.year}
            sourceUrl={report.sourceUrl}
            confidence="verified"
          />
        </div>
      </div>
    </div>
  );
}
