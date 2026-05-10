import Link from "next/link";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import {
  PARTY_TO_KLUB,
  partyLabel,
  partyShort,
  statusColor,
  statusLabel,
  type PromiseDashboardRow,
  type PromiseRow,
} from "@/lib/db/promises";

// 2-party split-view comparison. Single-line ledger rows so the eye can scan
// A vs B at one screen height per ~10 promises. No nested PromiseCards.

function PartyHeader({
  partyCode,
  total,
  fulfilled,
}: {
  partyCode: string;
  total: number;
  fulfilled: number;
}) {
  const klub = PARTY_TO_KLUB[partyCode] ?? null;
  return (
    <header className="border-b-2 border-rule pb-3 mb-3 flex items-baseline gap-3 flex-wrap">
      {klub && <ClubBadge klub={klub} variant="logo" size="lg" />}
      <h2
        className="font-serif font-medium m-0 leading-tight"
        style={{ fontSize: "clamp(1.25rem, 2.5vw, 1.6rem)" }}
      >
        {partyLabel(partyCode)}
      </h2>
      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
        <span className="text-foreground font-medium">{fulfilled}</span>/{total} spełnionych
      </span>
    </header>
  );
}

function detailHref(row: Pick<PromiseRow, "partyCode" | "slug" | "id">): string {
  if (row.partyCode && row.slug) {
    return `/obietnice/${encodeURIComponent(row.partyCode)}/${encodeURIComponent(row.slug)}`;
  }
  return `/obietnice/${row.id}`;
}

function LedgerRow({ row, idx }: { row: PromiseRow; idx: number }) {
  const color = statusColor(row.status);
  const display = row.title || row.sourceQuote || "—";
  return (
    <li>
      <Link
        href={detailHref(row)}
        className="grid grid-cols-[28px_12px_1fr] items-baseline gap-2 border-b border-border py-2 no-underline text-foreground hover:bg-muted"
      >
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
          {String(idx + 1).padStart(3, "0")}
        </span>
        <span
          aria-hidden
          className="inline-block w-[8px] h-[8px] rounded-sm self-center"
          style={{ background: color }}
          title={statusLabel(row.status)}
        />
        <span
          className="font-serif text-[14.5px] leading-snug truncate"
          title={display}
        >
          {display}
        </span>
      </Link>
    </li>
  );
}

function PartyColumn({
  partyCode,
  rows,
  dashboard,
}: {
  partyCode: string;
  rows: PromiseRow[];
  dashboard: PromiseDashboardRow | null;
}) {
  const total = dashboard?.total ?? rows.length;
  const fulfilled = dashboard?.fulfilled ?? 0;
  return (
    <section
      aria-label={`Obietnice — ${partyLabel(partyCode)}`}
      className="flex-1 min-w-0"
    >
      <PartyHeader partyCode={partyCode} total={total} fulfilled={fulfilled} />
      {rows.length === 0 ? (
        <p className="font-serif italic text-muted-foreground py-6" style={{ fontSize: 14 }}>
          Brak danych.
        </p>
      ) : (
        <ul className="list-none p-0 m-0">
          {rows.map((r, i) => (
            <LedgerRow key={r.id} row={r} idx={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ComparisonView({
  partyA,
  partyB,
  rowsA,
  rowsB,
  dashboardA,
  dashboardB,
}: {
  partyA: string;
  partyB: string;
  rowsA: PromiseRow[];
  rowsB: PromiseRow[];
  dashboardA: PromiseDashboardRow | null;
  dashboardB: PromiseDashboardRow | null;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
          {partyShort(partyA)} {dashboardA?.fulfilled ?? 0}/{dashboardA?.total ?? rowsA.length}
          {" · "}
          {partyShort(partyB)} {dashboardB?.fulfilled ?? 0}/{dashboardB?.total ?? rowsB.length}
        </span>
        <Link
          href="/obietnice"
          className="font-sans text-[12px] text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-destructive"
        >
          ← wróć do listy
        </Link>
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <PartyColumn partyCode={partyA} rows={rowsA} dashboard={dashboardA} />
        <div className="hidden lg:block w-px bg-rule self-stretch" aria-hidden />
        <PartyColumn partyCode={partyB} rows={rowsB} dashboard={dashboardB} />
      </div>
    </div>
  );
}
