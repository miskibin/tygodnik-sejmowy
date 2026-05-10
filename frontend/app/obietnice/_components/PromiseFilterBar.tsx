"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// Client island — URL-state synced filters: ?parties=KO,PiS&statuses=fulfilled
// &topics=zdrowie&q=leki. Mobile collapses to bottom sheet.

const STATUS_OPTIONS: Array<{ key: string; label: string; color: string }> = [
  { key: "fulfilled", label: "zrealizowane", color: "var(--success)" },
  { key: "in_progress", label: "w realizacji", color: "var(--warning)" },
  { key: "broken", label: "złamane", color: "var(--destructive)" },
  { key: "contradicted_by_vote", label: "sprzeczne", color: "var(--destructive)" },
  { key: "no_action", label: "brak działań", color: "var(--muted-foreground)" },
];

const TOPIC_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "mieszkania", label: "Mieszkania" },
  { key: "zdrowie", label: "Zdrowie" },
  { key: "energetyka", label: "Energetyka" },
  { key: "obrona", label: "Obrona" },
  { key: "rolnictwo", label: "Rolnictwo" },
  { key: "edukacja", label: "Edukacja" },
  { key: "sprawiedliwosc", label: "Sprawiedliwość" },
  { key: "podatki", label: "Podatki" },
  { key: "inne", label: "Inne" },
];

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pushQuery(
  router: ReturnType<typeof useRouter>,
  params: URLSearchParams,
  key: string,
  values: string[],
) {
  if (values.length > 0) params.set(key, values.join(","));
  else params.delete(key);
  const qs = params.toString();
  router.push(qs ? `/obietnice?${qs}` : "/obietnice", { scroll: false });
}

type FilterRackProps = {
  parties: string[];
  partyOptions: Array<{ code: string; label: string; total: number }>;
  statuses: string[];
  topics: string[];
  search: string;
  onTogglePartyAction: (code: string) => void;
  onToggleStatusAction: (key: string) => void;
  onToggleTopicAction: (key: string) => void;
  onSearchChangeAction: (v: string) => void;
  onResetAction: () => void;
  layout: "inline" | "stacked";
  resultCount: number | null;
  totalCount: number;
};

function Chip({
  on,
  onClick,
  ariaLabel,
  children,
  dotColor,
}: {
  on: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={ariaLabel}
      className="cursor-pointer rounded-full transition-all duration-150 inline-flex items-center gap-1.5 font-sans text-[12px]"
      style={{
        padding: "4px 11px",
        background: on ? "var(--foreground)" : "transparent",
        color: on ? "var(--background)" : "var(--secondary-foreground)",
        border: `1px solid ${on ? "var(--foreground)" : "var(--border)"}`,
      }}
    >
      {dotColor && (
        <span
          aria-hidden
          className="inline-block w-[8px] h-[8px] rounded-sm"
          style={{ background: dotColor }}
        />
      )}
      {children}
    </button>
  );
}

function FilterRack({
  parties,
  partyOptions,
  statuses,
  topics,
  search,
  onTogglePartyAction,
  onToggleStatusAction,
  onToggleTopicAction,
  onSearchChangeAction,
  onResetAction,
  layout,
  resultCount,
  totalCount,
}: FilterRackProps) {
  const stacked = layout === "stacked";
  return (
    <div className={stacked ? "space-y-5" : "space-y-3"}>
      <div>
        <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
          Klub
        </div>
        <div className="flex flex-wrap gap-1.5">
          {partyOptions.map((p) => {
            const on = parties.includes(p.code);
            return (
              <Chip
                key={p.code}
                on={on}
                onClick={() => onTogglePartyAction(p.code)}
                ariaLabel={`${on ? "Usuń filtr" : "Dodaj filtr"} ${p.label}`}
              >
                {p.label}
                <span className="font-mono text-[10px] opacity-70">{p.total}</span>
              </Chip>
            );
          })}
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
          Status
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <Chip
              key={s.key}
              on={statuses.includes(s.key)}
              onClick={() => onToggleStatusAction(s.key)}
              ariaLabel={`Filtr statusu: ${s.label}`}
              dotColor={s.color}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
          Temat (z dopasowanych druków)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TOPIC_OPTIONS.map((t) => (
            <Chip
              key={t.key}
              on={topics.includes(t.key)}
              onClick={() => onToggleTopicAction(t.key)}
              ariaLabel={`Filtr tematu: ${t.label}`}
            >
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <label
          htmlFor="promise-search"
          className="block font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2"
        >
          Szukaj w treści i cytacie
        </label>
        <input
          id="promise-search"
          type="search"
          value={search}
          onChange={(e) => onSearchChangeAction(e.target.value)}
          placeholder="np. „seniorzy”, „mieszkanie”…"
          className="w-full font-sans text-[14px] px-3 py-2 rounded-sm border border-border bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-destructive"
        />
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="font-mono text-[11px] text-muted-foreground" aria-live="polite">
          {resultCount != null ? `${resultCount} z ${totalCount}` : `${totalCount} obietnic`}
        </span>
        <button
          type="button"
          onClick={onResetAction}
          className="cursor-pointer font-sans text-[11px] text-destructive underline decoration-dotted underline-offset-4"
        >
          wyczyść filtry
        </button>
      </div>
    </div>
  );
}

export function PromiseFilterBar({
  partyOptions,
  resultCount,
  totalCount,
}: {
  partyOptions: Array<{ code: string; label: string; total: number }>;
  resultCount: number | null;
  totalCount: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const titleId = useId();
  const [, startTransition] = useTransition();

  const parties = useMemo(() => parseList(sp.get("parties")), [sp]);
  const statuses = useMemo(() => parseList(sp.get("statuses")), [sp]);
  const topics = useMemo(() => parseList(sp.get("topics")), [sp]);
  const urlSearch = sp.get("q") ?? "";

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(urlSearch);

  // Keep local search input in sync if URL changes externally (e.g. back btn).
  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  // Debounce free-text search → URL (client search; URL stays canonical).
  useEffect(() => {
    if (search === urlSearch) return;
    const handle = setTimeout(() => {
      startTransition(() => {
        const params = new URLSearchParams(Array.from(sp.entries()));
        if (search.trim()) params.set("q", search);
        else params.delete("q");
        const qs = params.toString();
        router.push(qs ? `/obietnice?${qs}` : "/obietnice", { scroll: false });
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [search, urlSearch, sp, router]);

  const toggle = (key: string, value: string, currentValues: string[]) => {
    const next = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value];
    const params = new URLSearchParams(Array.from(sp.entries()));
    startTransition(() => pushQuery(router, params, key, next));
  };

  const reset = () => {
    setSearch("");
    startTransition(() => router.push("/obietnice", { scroll: false }));
  };

  const activeCount = parties.length + statuses.length + topics.length + (urlSearch ? 1 : 0);

  const rack = (layout: "inline" | "stacked") => (
    <FilterRack
      parties={parties}
      partyOptions={partyOptions}
      statuses={statuses}
      topics={topics}
      search={search}
      onTogglePartyAction={(c) => toggle("parties", c, parties)}
      onToggleStatusAction={(s) => toggle("statuses", s, statuses)}
      onToggleTopicAction={(t) => toggle("topics", t, topics)}
      onSearchChangeAction={setSearch}
      onResetAction={reset}
      layout={layout}
      resultCount={resultCount}
      totalCount={totalCount}
    />
  );

  return (
    <>
      {/* Mobile sheet trigger */}
      <div className="md:hidden mb-3">
        <button
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="cursor-pointer w-full inline-flex items-center justify-between gap-2 rounded-full border border-border bg-muted px-4 py-2 font-sans text-[13px] text-foreground transition-colors hover:border-destructive"
        >
          <span className="inline-flex items-center gap-2">
            <span className="text-destructive">⌕</span>
            {activeCount > 0 ? `Filtry (${activeCount})` : "Filtruj obietnice"}
          </span>
          <span className="text-muted-foreground">▾</span>
        </button>
      </div>

      {/* Desktop inline rack */}
      <div className="hidden md:block border border-rule bg-muted p-4 mb-5">
        {rack("inline")}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          aria-labelledby={titleId}
          className="bg-background text-foreground max-h-[85vh] overflow-y-auto rounded-t-2xl border-t-2 border-rule"
        >
          <SheetHeader className="pt-5 pb-1">
            <SheetTitle
              id={titleId}
              className="font-serif text-foreground"
              style={{ fontSize: 20 }}
            >
              {activeCount > 0 ? `Filtry (${activeCount})` : "Filtruj obietnice"}
            </SheetTitle>
            <SheetDescription className="font-sans text-[12px] text-muted-foreground">
              Filtry mieszają się — wszystkie warunki muszą być spełnione.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{rack("stacked")}</div>
          <div className="sticky bottom-0 flex gap-3 border-t border-rule bg-background p-4">
            <button
              type="button"
              onClick={reset}
              disabled={activeCount === 0}
              className="flex-1 rounded-full border border-border bg-transparent px-4 py-2.5 font-sans text-[13px] text-secondary-foreground transition-colors disabled:opacity-40 enabled:cursor-pointer enabled:hover:border-destructive"
            >
              Resetuj
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 cursor-pointer rounded-full bg-destructive px-4 py-2.5 font-sans text-[13px] text-background transition-opacity hover:opacity-90"
            >
              Zastosuj
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
