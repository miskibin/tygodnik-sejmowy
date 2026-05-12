"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  ACTIVITY_FILTERS,
  ACTIVITY_LABEL,
  isActivityFilter,
  partyShort,
  type ActivityFilter,
  type HubCounts,
} from "@/lib/db/promises-shared";

const ACTIVITY_COUNT_KEY: Record<ActivityFilter, keyof Pick<HubCounts, "total" | "withPrints" | "confirmed" | "stale">> = {
  all: "total",
  "with-prints": "withPrints",
  confirmed: "confirmed",
  stale: "stale",
};

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function pushQuery(
  router: ReturnType<typeof useRouter>,
  sp: URLSearchParams,
  patch: Record<string, string | null>,
) {
  const params = new URLSearchParams(Array.from(sp.entries()));
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  router.push(qs ? `/obietnice?${qs}` : "/obietnice", { scroll: false });
}

function SidebarRack({
  parties,
  activity,
  counts,
  onToggleParty,
  onSetActivity,
  onReset,
  hasFilters,
}: {
  parties: string[];
  activity: ActivityFilter;
  counts: HubCounts;
  onToggleParty: (code: string) => void;
  onSetActivity: (a: ActivityFilter) => void;
  onReset: () => void;
  hasFilters: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
          Aktywność
        </div>
        <div className="space-y-0.5">
          {ACTIVITY_FILTERS.map((a) => {
            const on = activity === a;
            const count = counts[ACTIVITY_COUNT_KEY[a]];
            return (
              <button
                key={a}
                type="button"
                onClick={() => onSetActivity(a)}
                aria-pressed={on}
                className="w-full flex items-baseline justify-between gap-2 text-left cursor-pointer py-1.5 px-2 -mx-2 rounded-sm transition-colors hover:bg-muted"
                style={{
                  background: on ? "var(--muted)" : "transparent",
                  borderLeft: `2px solid ${on ? "var(--foreground)" : "transparent"}`,
                  paddingLeft: 8,
                }}
              >
                <span
                  className="font-sans text-[13px]"
                  style={{
                    color: on ? "var(--foreground)" : "var(--secondary-foreground)",
                    fontWeight: on ? 500 : 400,
                  }}
                >
                  {ACTIVITY_LABEL[a]}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
          Partia
        </div>
        <div className="space-y-0.5">
          {counts.byParty.map(({ code, count }) => {
            const on = parties.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => onToggleParty(code)}
                aria-pressed={on}
                className="w-full flex items-baseline justify-between gap-2 text-left cursor-pointer py-1.5 px-2 -mx-2 rounded-sm transition-colors hover:bg-muted"
                style={{ background: on ? "var(--muted)" : "transparent" }}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="inline-block w-[10px] h-[10px] rounded-[2px]"
                    style={{
                      border: `1.5px solid ${on ? "var(--foreground)" : "var(--border)"}`,
                      background: on ? "var(--foreground)" : "transparent",
                    }}
                  />
                  <span
                    className="font-sans text-[13px]"
                    style={{
                      color: on ? "var(--foreground)" : "var(--secondary-foreground)",
                      fontWeight: on ? 500 : 400,
                    }}
                  >
                    {partyShort(code)}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="font-sans text-[11px] text-destructive underline decoration-dotted underline-offset-4 cursor-pointer"
        >
          wyczyść filtry
        </button>
      )}
    </div>
  );
}

export function PromiseSidebar({ counts }: { counts: HubCounts }) {
  const router = useRouter();
  const sp = useSearchParams();
  const titleId = useId();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const parties = useMemo(() => parseList(sp.get("parties")), [sp]);
  const rawActivity = sp.get("activity");
  const activity: ActivityFilter = isActivityFilter(rawActivity) ? rawActivity : "all";
  const hasFilters = parties.length > 0 || activity !== "all" || !!sp.get("q") || !!sp.get("sort");

  const toggleParty = (code: string) => {
    const next = parties.includes(code) ? parties.filter((c) => c !== code) : [...parties, code];
    startTransition(() => pushQuery(router, sp, { parties: next.join(",") || null }));
  };
  const setActivity = (a: ActivityFilter) => {
    startTransition(() => pushQuery(router, sp, { activity: a === "all" ? null : a }));
  };
  const reset = () => {
    startTransition(() => router.push("/obietnice", { scroll: false }));
  };

  const activeCount =
    parties.length + (activity !== "all" ? 1 : 0) + (sp.get("q") ? 1 : 0);

  return (
    <>
      <div className="md:hidden mb-3">
        <button
          type="button"
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

      <aside className="hidden md:block">
        <SidebarRack
          parties={parties}
          activity={activity}
          counts={counts}
          onToggleParty={toggleParty}
          onSetActivity={setActivity}
          onReset={reset}
          hasFilters={hasFilters}
        />
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          aria-labelledby={titleId}
          className="bg-background text-foreground max-h-[85vh] overflow-y-auto rounded-t-2xl border-t-2 border-rule"
        >
          <SheetHeader className="pt-5 pb-1">
            <SheetTitle id={titleId} className="font-serif text-foreground" style={{ fontSize: 20 }}>
              {activeCount > 0 ? `Filtry (${activeCount})` : "Filtruj obietnice"}
            </SheetTitle>
            <SheetDescription className="font-sans text-[12px] text-muted-foreground">
              Wybierz aktywność i partie. Wszystkie warunki muszą być spełnione.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <SidebarRack
              parties={parties}
              activity={activity}
              counts={counts}
              onToggleParty={toggleParty}
              onSetActivity={setActivity}
              onReset={reset}
              hasFilters={hasFilters}
            />
          </div>
          <div className="sticky bottom-0 flex gap-3 border-t border-rule bg-background p-4">
            <button
              type="button"
              onClick={reset}
              disabled={!hasFilters}
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
