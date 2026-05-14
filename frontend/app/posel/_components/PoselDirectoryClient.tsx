"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useProfile } from "@/lib/profile";
import type { MpListItem } from "@/lib/db/mps";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";
import { SearchHero } from "@/components/lists/SearchHero";
import { FilterChipRow, type FilterChipOption } from "@/components/lists/FilterChipRow";
import { SortButtons } from "@/components/lists/SortButtons";
import { ViewToggle } from "@/components/lists/ViewToggle";

type MpRow = MpListItem & {
  attendancePct: number | null;
  loyaltyPct: number | null;
  questionCount: number;
  statementCount: number;
};

type SortKey = "alphabet" | "attendance" | "loyalty" | "interp" | "mowy";

const SORT_OPTIONS: { id: SortKey; label: string; tip?: string }[] = [
  { id: "alphabet", label: "A–Z" },
  { id: "attendance", label: "frekwencja" },
  { id: "loyalty", label: "rzadziej z klubem", tip: "Sortuj od najczęściej głosujących inaczej niż większość ich klubu" },
  { id: "interp", label: "interpelacje" },
  { id: "mowy", label: "mowy" },
];

function attendanceColor(pct: number | null): string {
  if (pct == null) return "var(--muted-foreground)";
  if (pct >= 85) return "var(--success)";
  if (pct >= 70) return "var(--warning)";
  return "var(--destructive)";
}

function loyaltyColor(pct: number | null): string {
  if (pct == null) return "var(--muted-foreground)";
  if (pct >= 90) return "var(--muted-foreground)";
  if (pct >= 75) return "var(--warning)";
  return "var(--destructive)";
}

function fmtPct(p: number | null): string {
  if (p == null) return "—";
  return `${Math.round(p)}%`;
}

export function PoselDirectoryClient({ mps }: { mps: MpRow[] }) {
  const { district } = useProfile();
  const [query, setQuery] = useState("");
  const [klubFilter, setKlubFilter] = useState<string>("all");
  const [districtOnly, setDistrictOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("alphabet");
  const [view, setView] = useState<"grid" | "tabela">("grid");

  // Group counts by club for the chip row.
  const clubCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of mps) {
      const k = m.clubRef ?? "niez.";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [mps]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const arr = mps.filter((m) => {
      if (klubFilter !== "all" && (m.clubRef ?? "niez.") !== klubFilter) return false;
      if (districtOnly && district && m.districtNum !== district.num) return false;
      if (needle) {
        const blob = `${m.firstLastName} ${m.clubRef ?? ""} ${m.districtNum ?? ""}`.toLowerCase();
        if (!blob.includes(needle)) return false;
      }
      return true;
    });
    const cmp: Record<SortKey, (a: MpRow, b: MpRow) => number> = {
      alphabet: (a, b) => a.firstLastName.localeCompare(b.firstLastName, "pl"),
      attendance: (a, b) => (b.attendancePct ?? -1) - (a.attendancePct ?? -1),
      loyalty: (a, b) => (a.loyaltyPct ?? 101) - (b.loyaltyPct ?? 101), // lower = more independent
      interp: (a, b) => b.questionCount - a.questionCount,
      mowy: (a, b) => b.statementCount - a.statementCount,
    };
    return arr.slice().sort(cmp[sortBy]);
  }, [mps, query, klubFilter, districtOnly, district, sortBy]);

  const klubChipOptions: FilterChipOption[] = clubCounts.map(([k, n]) => ({
    id: k,
    label: KLUB_LABELS[k] ?? k,
    count: n,
    color: KLUB_COLORS[k] ?? "var(--muted-foreground)",
    leading: <ClubBadge klub={k} size="xs" variant="logo" />,
  }));

  return (
    <div className="min-w-0">
      <SearchHero
        value={query}
        onChange={setQuery}
        placeholder="Szukaj posła — nazwisko, klub, okręg…"
        filteredCount={filtered.length}
        totalCount={mps.length}
      />

      <FilterChipRow
        options={klubChipOptions}
        selected={klubFilter}
        onChange={setKlubFilter}
      />

      <div className="flex flex-wrap items-center gap-3 mb-6 font-sans text-[12px]">
        {district ? (
          <button
            type="button"
            onClick={() => setDistrictOnly((v) => !v)}
            className="cursor-pointer rounded-full px-3 py-1.5 flex items-center gap-1.5"
            style={{
              border: `1px solid ${districtOnly ? "var(--destructive)" : "var(--border)"}`,
              background: districtOnly ? "color-mix(in oklab, var(--highlight) 40%, transparent)" : "transparent",
              color: districtOnly ? "var(--destructive)" : "var(--secondary-foreground)",
            }}
          >
            <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-destructive" />
            Tylko Twój okręg {district.num}
          </button>
        ) : (
          <span className="font-serif italic text-[12px] text-muted-foreground">
            Ustaw kod pocztowy na stronie głównej, żeby filtrować po Twoim okręgu.
          </span>
        )}

        <span className="flex-1" aria-hidden />

        <SortButtons options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} />

        <ViewToggle<"grid" | "tabela">
          options={[
            { id: "grid", glyph: "▦", ariaLabel: "Widok kafli" },
            { id: "tabela", glyph: "☰", ariaLabel: "Widok tabeli" },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="font-serif italic text-muted-foreground py-12 text-center">
          Brak posłów spełniających kryteria filtra.
        </p>
      ) : view === "grid" ? (
        <GridView mps={filtered} myDistrict={district?.num} />
      ) : (
        <TableView mps={filtered} myDistrict={district?.num} />
      )}
    </div>
  );
}

function GridView({ mps, myDistrict }: { mps: MpRow[]; myDistrict?: number }) {
  // Column count is dynamic (auto-fill); right-borders per cell would mis-align
  // at viewports where the row count flips between 1/2/3/4 cols. The outer
  // -mr-px lets every cell carry its own border-r while the last column's
  // overflow hides behind the parent edge — clean visual rule regardless of
  // how many cells fit in a row.
  return (
    <div
      className="grid gap-0 border-t border-rule -mr-px"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}
    >
      {mps.map((m) => {
        const isMine = myDistrict != null && m.districtNum === myDistrict;
        return (
          <Link
            key={m.mpId}
            href={`/posel/${m.mpId}`}
            className="block p-5 border-b border-r border-border hover:bg-muted transition-colors relative min-w-0"
            style={{ background: isMine ? "color-mix(in oklab, var(--highlight) 35%, transparent)" : undefined }}
          >
            {isMine && (
              <span className="absolute top-3 right-3 font-mono text-[9px] tracking-[0.16em] uppercase text-destructive font-semibold">
                ★ Twój
              </span>
            )}
            <div className="grid items-start gap-3 min-w-0" style={{ gridTemplateColumns: "56px 1fr" }}>
              <Portrait name={m.firstLastName} photoUrl={m.photoUrl} clubRef={m.clubRef} />
              <div className="min-w-0">
                <div className="font-serif text-[18px] font-medium leading-tight tracking-[-0.01em] break-words text-balance">
                  {m.firstLastName}
                </div>
                <div className="font-sans text-[11.5px] text-secondary-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                  <ClubBadge klub={m.clubRef} size="xs" />
                  {m.districtNum != null && <span className="text-muted-foreground">okr. {m.districtNum}</span>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-border">
              <Stat label="frekw." value={fmtPct(m.attendancePct)} color={attendanceColor(m.attendancePct)} bar={m.attendancePct} />
              <Stat label="z klub." value={fmtPct(m.loyaltyPct)} color={loyaltyColor(m.loyaltyPct)} bar={m.loyaltyPct} />
              <Stat label="interp." value={String(m.questionCount)} color="var(--foreground)" />
              <Stat label="mowy" value={String(m.statementCount)} color="var(--foreground)" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function TableView({ mps, myDistrict }: { mps: MpRow[]; myDistrict?: number }) {
  return (
    <div className="border-t-2 border-rule font-sans">
      <div
        className="hidden md:grid items-baseline py-3 px-2 border-b border-border font-mono text-[9.5px] tracking-[0.12em] uppercase text-muted-foreground"
        style={{ gridTemplateColumns: "2fr 1.2fr 1.4fr 60px 60px 60px 60px", columnGap: 12 }}
      >
        <span>Imię i nazwisko</span>
        <span>Klub</span>
        <span>Okręg</span>
        <span className="text-right">frekw.</span>
        <span className="text-right">z klub.</span>
        <span className="text-right">interp.</span>
        <span className="text-right">mowy</span>
      </div>
      {mps.map((m) => {
        const isMine = myDistrict != null && m.districtNum === myDistrict;
        return (
          <Link
            key={m.mpId}
            href={`/posel/${m.mpId}`}
            className="block border-b border-border hover:bg-muted px-2 py-3"
            style={{ background: isMine ? "color-mix(in oklab, var(--highlight) 30%, transparent)" : undefined }}
          >
            {/* Mobile: stacked */}
            <div className="md:hidden flex items-center gap-3 min-w-0">
              <Portrait name={m.firstLastName} photoUrl={m.photoUrl} clubRef={m.clubRef} small />
              <div className="min-w-0 flex-1">
                <div className="font-serif text-[15px] font-medium leading-tight truncate">
                  {isMine && <span className="text-destructive mr-1">★</span>}
                  {m.firstLastName}
                </div>
                <div className="font-sans text-[11px] text-secondary-foreground mt-1 flex items-center gap-1.5">
                  <ClubBadge klub={m.clubRef} size="xs" />
                  {m.districtNum != null && <span className="text-muted-foreground">okr. {m.districtNum}</span>}
                </div>
              </div>
              <div className="text-right font-mono text-[11px] shrink-0">
                <div style={{ color: attendanceColor(m.attendancePct) }}>{fmtPct(m.attendancePct)}</div>
                <div className="text-muted-foreground">{m.statementCount}m · {m.questionCount}i</div>
              </div>
            </div>

            {/* Desktop: table row */}
            <div
              className="hidden md:grid items-center font-sans text-[13px]"
              style={{ gridTemplateColumns: "2fr 1.2fr 1.4fr 60px 60px 60px 60px", columnGap: 12 }}
            >
              <span className="font-serif text-[16px] font-medium leading-tight tracking-[-0.005em] flex items-center gap-1.5 min-w-0">
                {isMine && <span className="text-destructive">★</span>}
                <span className="truncate">{m.firstLastName}</span>
              </span>
              <span className="flex items-center gap-1.5 min-w-0">
                <ClubBadge klub={m.clubRef} size="xs" />
                <span className="text-secondary-foreground truncate">{KLUB_LABELS[m.clubRef ?? ""] ?? m.clubRef ?? "—"}</span>
              </span>
              <span className="text-secondary-foreground text-[12.5px] truncate">
                {m.districtNum != null ? `${m.districtNum}` : "—"}
              </span>
              <span className="font-mono text-[12.5px] text-right tabular-nums" style={{ color: attendanceColor(m.attendancePct) }}>
                {fmtPct(m.attendancePct)}
              </span>
              <span className="font-mono text-[12.5px] text-right tabular-nums" style={{ color: loyaltyColor(m.loyaltyPct) }}>
                {fmtPct(m.loyaltyPct)}
              </span>
              <span className="font-mono text-[12.5px] text-right text-foreground tabular-nums">{m.questionCount}</span>
              <span className="font-mono text-[12.5px] text-right text-foreground tabular-nums">{m.statementCount}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Stat({ label, value, color, bar }: { label: string; value: string; color: string; bar?: number | null }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted-foreground mb-1">{label}</div>
      <div
        className="font-serif font-medium leading-none tabular-nums"
        style={{ fontSize: 17, color, letterSpacing: "-0.01em" }}
      >
        {value}
      </div>
      {bar != null && (
        <div className="mt-1.5 h-[3px] bg-border relative">
          <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(0, Math.min(100, bar))}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

function Portrait({ name, photoUrl, clubRef, small = false }: { name: string; photoUrl: string | null; clubRef: string | null; small?: boolean }) {
  const w = small ? 44 : 56;
  const h = small ? 56 : 70;
  const klubColor = clubRef ? KLUB_COLORS[clubRef] ?? "var(--muted-foreground)" : "var(--muted-foreground)";
  return (
    <div className="relative shrink-0" style={{ width: w, height: h }}>
      {photoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={photoUrl}
          alt=""
          className="w-full h-full object-cover border border-border bg-muted"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full border border-border bg-muted flex items-center justify-center">
          <span className="font-serif italic text-muted-foreground opacity-60" style={{ fontSize: w * 0.32 }}>
            {name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2)}
          </span>
        </div>
      )}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: klubColor }} />
    </div>
  );
}
