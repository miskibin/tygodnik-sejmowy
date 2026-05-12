"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { FTS_KIND_LABEL, type FtsHit, type FtsKind } from "@/lib/db/fts-types";

const PER_TAB = 25;

function renderHeadline(html: string): ReactNode {
  if (!html) return null;
  const parts: ReactNode[] = [];
  let cursor = 0;
  const re = /<mark>(.*?)<\/mark>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > cursor) parts.push(html.slice(cursor, m.index));
    parts.push(
      <strong key={`m-${m.index}`} className="font-medium text-foreground bg-accent/40 rounded-sm px-0.5">
        {m[1]}
      </strong>,
    );
    cursor = re.lastIndex;
  }
  if (cursor < html.length) parts.push(html.slice(cursor));
  return parts;
}

function HitRow({ hit }: { hit: FtsHit }) {
  const inner = (
    <div className="py-3 border-b border-rule">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-destructive">
          {FTS_KIND_LABEL[hit.kind]}
        </span>
        {hit.meta && (
          <span className="font-mono text-[10px] text-muted-foreground shrink-0">{hit.meta}</span>
        )}
      </div>
      <div className="font-serif text-[16px] leading-snug text-foreground line-clamp-2">
        {hit.label}
      </div>
      {hit.headline && hit.headline !== hit.label && (
        <div className="mt-1 text-[13px] text-muted-foreground line-clamp-3">
          {renderHeadline(hit.headline)}
        </div>
      )}
    </div>
  );
  if (hit.href && hit.href.startsWith("http")) {
    return (
      <a href={hit.href} target="_blank" rel="noopener noreferrer" className="block hover:bg-muted/40 -mx-3 px-3 transition-colors">
        {inner}
      </a>
    );
  }
  if (hit.href) {
    return (
      <Link href={hit.href} className="block hover:bg-muted/40 -mx-3 px-3 transition-colors">
        {inner}
      </Link>
    );
  }
  return <div className="opacity-60 -mx-3 px-3">{inner}</div>;
}

type Tab = "all" | FtsKind;

export function SzukajResults({
  hits,
  counts,
  initialTab,
  groupOrder,
}: {
  hits: FtsHit[];
  counts: Record<FtsKind, number>;
  initialTab: string;
  groupOrder: FtsKind[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presentKinds = groupOrder.filter((k) => counts[k] > 0);
  const validInitial: Tab =
    initialTab === "all" || presentKinds.includes(initialTab as FtsKind)
      ? (initialTab as Tab)
      : "all";
  const [tab, setTab] = useState<Tab>(validInitial);
  const [shown, setShown] = useState(PER_TAB);

  function pickTab(t: Tab) {
    setTab(t);
    setShown(PER_TAB);
    // Keep URL in sync so back/forward + share-link works.
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    if (t === "all") next.delete("tab");
    else next.set("tab", t);
    router.replace(`/szukaj?${next.toString()}`, { scroll: false });
  }

  const filtered = tab === "all" ? hits : hits.filter((h) => h.kind === tab);
  const visible = filtered.slice(0, shown);
  const remaining = filtered.length - shown;

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "all", label: "Wszystko", count: hits.length },
    ...presentKinds.map((k) => ({ value: k as Tab, label: FTS_KIND_LABEL[k], count: counts[k] })),
  ];

  return (
    <div className="w-full">
      <div role="tablist" className="flex flex-wrap gap-1 mb-6 border-b border-rule">
        {tabs.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => pickTab(t.value)}
              className={`relative px-3 py-2 text-[13px] font-sans transition-colors ${
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className="ml-1.5 font-mono text-[10px] opacity-60">{t.count}</span>
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-destructive" />
              )}
            </button>
          );
        })}
      </div>

      <div>
        {visible.map((h) => (
          <HitRow key={`${h.kind}:${h.id}`} hit={h} />
        ))}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setShown((s) => s + PER_TAB)}
            className="mt-4 text-[12px] text-muted-foreground hover:text-foreground font-mono uppercase tracking-[0.1em]"
          >
            Pokaż kolejne {Math.min(remaining, PER_TAB)} ({remaining} pozostało)
          </button>
        )}
      </div>
    </div>
  );
}
