import Link from "next/link";
import {
  PRIMARY_PARTIES,
  getPartyCodesWithCounts,
  getPromiseDashboard,
  getPromisesFiltered,
  partyShort,
} from "@/lib/db/promises";
import { PromiseFilterBar } from "./_components/PromiseFilterBar";
import { PromiseFeed } from "./_components/PromiseFeed";
import { ComparisonView } from "./_components/ComparisonView";

export const dynamic = "force-dynamic";

function parseList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
  }
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = raw ? parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function buildBaseHref(sp: Record<string, string | string[] | undefined>): string {
  const entries: string[] = [];
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || v == null) continue;
    const value = Array.isArray(v) ? v.join(",") : v;
    if (!value) continue;
    entries.push(`${encodeURIComponent(k)}=${encodeURIComponent(value)}`);
  }
  return entries.length > 0 ? `/obietnice?${entries.join("&")}` : "/obietnice";
}

export default async function ObietnicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const parties = parseList(sp.parties);
  const statuses = parseList(sp.statuses);
  const topics = parseList(sp.topics);
  const search = typeof sp.q === "string" ? sp.q : "";
  const compare = parseList(sp.compare);
  const page = parsePage(sp.page);

  // Comparison mode — strict 2-party split-view, ledger rows only.
  if (compare.length === 2) {
    const [a, b] = compare;
    const [rowsA, rowsB, dashboard] = await Promise.all([
      getPromisesFiltered({ parties: [a] }),
      getPromisesFiltered({ parties: [b] }),
      getPromiseDashboard(),
    ]);
    const dashA = dashboard.find((r) => r.partyCode === a) ?? null;
    const dashB = dashboard.find((r) => r.partyCode === b) ?? null;
    return (
      <div className="bg-background text-foreground font-serif pb-20">
        <div className="max-w-[1240px] mx-auto px-4 md:px-8 lg:px-14 pt-7 md:pt-9">
          <div className="border-b-2 border-rule pb-5 mb-6">
            <div className="font-sans text-[11px] tracking-[0.2em] uppercase text-destructive mb-2">
              ✶ Porównanie ✶
            </div>
            <h1
              className="font-medium tracking-[-0.03em] m-0 leading-[0.95]"
              style={{ fontSize: "clamp(1.75rem, 4.5vw, 3rem)", textWrap: "balance" }}
            >
              {partyShort(a)} <span className="text-secondary-foreground">vs</span> {partyShort(b)}
            </h1>
          </div>
          <ComparisonView
            partyA={a}
            partyB={b}
            rowsA={rowsA}
            rowsB={rowsB}
            dashboardA={dashA}
            dashboardB={dashB}
          />
        </div>
      </div>
    );
  }

  // Standard view.
  const [filtered, dashboard, allCounts] = await Promise.all([
    getPromisesFiltered({ parties, statuses, topics, search }),
    getPromiseDashboard(),
    getPartyCodesWithCounts(),
  ]);
  const total = dashboard.reduce((acc, r) => acc + r.total, 0);
  const totalFulfilled = dashboard.reduce((acc, r) => acc + r.fulfilled, 0);

  // Filter party options: stable order (primary first, then others by count).
  const primarySet = new Set<string>(PRIMARY_PARTIES);
  const partyOptions = [
    ...PRIMARY_PARTIES.filter((p) => allCounts.some((c) => c.code === p)).map((p) => ({
      code: p,
      label: partyShort(p),
      total: allCounts.find((c) => c.code === p)?.count ?? 0,
    })),
    ...allCounts
      .filter((c) => !primarySet.has(c.code))
      .map((c) => ({ code: c.code, label: partyShort(c.code), total: c.count })),
  ];

  const anyFilter = parties.length + statuses.length + topics.length + (search ? 1 : 0) > 0;
  const baseHref = buildBaseHref(sp);

  // Single-line per-party strip — replaces dashboard cards + meter + heatmap.
  // Each party becomes a chip-link that filters the feed.
  const stripParties = PRIMARY_PARTIES
    .map((code) => dashboard.find((r) => r.partyCode === code))
    .filter((r): r is NonNullable<typeof r> => r != null && r.total > 0);

  return (
    <div className="bg-background text-foreground font-serif pb-20">
      <div className="max-w-[1240px] mx-auto px-4 md:px-8 lg:px-14 pt-6 md:pt-8">
        {/* Hero — one line. */}
        <div className="border-b-2 border-rule pb-5 mb-5">
          <div className="font-sans text-[11px] tracking-[0.2em] uppercase text-destructive mb-2">
            ✶ Rejestr {total} obietnic ✶
          </div>
          <h1
            className="font-medium tracking-[-0.035em] m-0 leading-[0.95]"
            style={{ fontSize: "clamp(2rem, 5.5vw, 4rem)", textWrap: "balance" }}
          >
            Co partie obiecały. <em className="text-destructive">Co spełniły.</em>
          </h1>
        </div>

        {/* Stat strip — one line, no per-party 0% repetition. Each party is a
            chip that filters the feed below. */}
        <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 font-sans text-[12.5px]">
          <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">
            Spełnione: <span className="text-foreground font-medium">{totalFulfilled}</span> z {total}
          </span>
          <span className="text-border">·</span>
          {stripParties.map((r) => (
            <Link
              key={r.partyCode}
              href={`/obietnice?parties=${encodeURIComponent(r.partyCode)}`}
              className="text-secondary-foreground hover:text-destructive no-underline"
            >
              <span className="font-medium text-foreground">{partyShort(r.partyCode)}</span>{" "}
              <span className="font-mono text-[11px] text-muted-foreground">
                {r.fulfilled}/{r.total}
              </span>
            </Link>
          ))}
        </div>

        {/* Filter bar */}
        <PromiseFilterBar
          partyOptions={partyOptions}
          resultCount={anyFilter ? filtered.length : null}
          totalCount={total}
        />

        {/* Feed — paginated 30/page */}
        <PromiseFeed rows={filtered} page={page} baseHref={baseHref} />
      </div>
    </div>
  );
}
