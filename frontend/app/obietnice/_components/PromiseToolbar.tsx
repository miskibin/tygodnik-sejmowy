"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HUB_SORTS, isHubSort, type HubSort } from "@/lib/db/promises-shared";

const SORT_LABEL: Record<HubSort, string> = {
  evidence: "najwięcej druków",
  recent: "ostatnio ruszone",
  alpha: "alfabetycznie",
};

export function PromiseToolbar({
  resultCount,
  totalCount,
}: {
  resultCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const raw = sp.get("sort");
  const current: HubSort = isHubSort(raw) ? raw : "evidence";

  const setSort = (next: HubSort) => {
    const params = new URLSearchParams(Array.from(sp.entries()));
    if (next === "evidence") params.delete("sort");
    else params.set("sort", next);
    const qs = params.toString();
    startTransition(() =>
      router.push(qs ? `/obietnice?${qs}` : "/obietnice", { scroll: false }),
    );
  };

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 py-2 border-b border-rule mb-2">
      <span className="font-mono text-[11px] text-muted-foreground" aria-live="polite">
        {resultCount === totalCount
          ? `${totalCount} obietnic`
          : `${resultCount} z ${totalCount}`}
      </span>
      <div className="flex items-baseline gap-2 font-sans text-[11px]">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
          sortuj:
        </span>
        {HUB_SORTS.map((s, i) => (
          <span key={s} className="flex items-baseline gap-2">
            {i > 0 && <span className="text-border">·</span>}
            <button
              type="button"
              onClick={() => setSort(s)}
              aria-pressed={current === s}
              className="cursor-pointer transition-colors"
              style={{
                color: current === s ? "var(--destructive)" : "var(--secondary-foreground)",
                textDecoration: current === s ? "underline" : "none",
                textUnderlineOffset: 3,
                textDecorationStyle: "dotted",
              }}
            >
              {SORT_LABEL[s]}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
