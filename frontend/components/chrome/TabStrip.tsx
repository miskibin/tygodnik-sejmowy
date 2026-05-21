"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";

export type TabStripItem = { id: string; label: string; count?: number | null };

// Shared edge-to-edge tab strip used by /sondaze and /posel/[mpId].
//
// The negative-margin trick is what makes the strip bleed past its
// container's padding — callers pass `edgeBleedClass` matching their
// outer horizontal padding (e.g. "-mx-4 md:-mx-8 lg:-mx-14") and the
// inner scroller re-applies the same padding via `edgePadClass`.
//
// Active tab is also synced with `location.hash` so deep links like
// /posel/426#wydatki open directly on that tab — useful for SEO snippets
// and for in-page anchors like the "Wydatki biura → Zobacz rozbicie" CTA
// in the MP profile hero.
export function TabStrip({
  tabs,
  panels,
  edgeBleedClass = "-mx-3 sm:-mx-8 md:-mx-14",
  edgePadClass = "px-3 sm:px-8 md:px-14",
  panelClassName = "pt-8 sm:pt-12 min-w-0",
  initialTabId,
}: {
  tabs: TabStripItem[];
  panels: Record<string, ReactNode>;
  edgeBleedClass?: string;
  edgePadClass?: string;
  panelClassName?: string;
  initialTabId?: string;
}) {
  const tabIds = tabs.map((t) => t.id);
  const [active, setActive] = useState(initialTabId ?? tabs[0]?.id ?? "");
  const rootRef = useRef<HTMLDivElement>(null);

  // Sync from hash on mount + on hashchange. We only switch when the hash
  // matches a known tab id — strangers (e.g. fragment from another section)
  // don't reset the panel. On hashchange (external navigation, e.g. an
  // in-page anchor like the "Wydatki biura → Zobacz rozbicie" CTA in the
  // hero), also scroll the tab strip into view so the user lands on the
  // newly-activated tab instead of staring at the page top. Internal
  // select() uses replaceState which doesn't fire hashchange, so tab clicks
  // never re-scroll.
  useEffect(() => {
    const apply = (scroll: boolean) => {
      const h = (typeof window !== "undefined" ? window.location.hash : "").replace(/^#/, "");
      if (h && tabIds.includes(h)) {
        setActive(h);
        if (scroll && rootRef.current) {
          // Defer one frame so the panel content can mount before we scroll.
          requestAnimationFrame(() => {
            rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      }
    };
    apply(false);
    const onHashChange = () => apply(true);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (id: string) => {
    setActive(id);
    if (typeof window !== "undefined") {
      // Replace (not push) so back-button still leaves the page rather than
      // walking through every tab switch.
      const url = `${window.location.pathname}${window.location.search}#${id}`;
      window.history.replaceState(null, "", url);
    }
  };

  return (
    <div className="min-w-0" ref={rootRef}>
      <div className={`relative ${edgeBleedClass} min-w-0`}>
        <div
          className={`border-b border-border flex gap-0 font-sans text-[12px] sm:text-[13px] overflow-x-auto overscroll-x-contain ${edgePadClass} no-scrollbar`}
          style={{ scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch" }}
        >
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => select(t.id)}
                className="cursor-pointer flex items-baseline gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap rounded-none px-3 py-2.5 sm:px-[18px] sm:py-[14px]"
                style={{
                  color: on ? "var(--destructive)" : "var(--secondary-foreground)",
                  borderBottom: on ? "2px solid var(--destructive)" : "2px solid transparent",
                  marginBottom: -1,
                  scrollSnapAlign: "start",
                }}
              >
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{t.count}</span>
                )}
              </button>
            );
          })}
        </div>
        <div
          aria-hidden
          className="md:hidden pointer-events-none absolute top-0 right-0 bottom-0 w-8"
          style={{ background: "linear-gradient(to right, transparent, var(--background) 70%)" }}
        />
      </div>
      <div className={panelClassName}>{panels[active]}</div>
    </div>
  );
}
