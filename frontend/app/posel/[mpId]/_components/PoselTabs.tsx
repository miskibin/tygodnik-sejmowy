"use client";

import { useState, type ReactNode } from "react";

type Tab = { id: string; label: string; count?: number | null };

export function PoselTabs({ tabs, panels }: { tabs: Tab[]; panels: Record<string, ReactNode> }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 border-t border-border pt-4 md:pt-6 min-w-0">
      <div className="relative -mx-4 md:-mx-8 lg:-mx-14 min-w-0">
        <div
          className="border-b border-border flex gap-0 font-sans text-[12px] sm:text-[13px] overflow-x-auto overscroll-x-contain px-4 md:px-8 lg:px-14 [scrollbar-width:thin]"
          style={{
            scrollSnapType: "x proximity",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
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
        {/* Right-edge scroll-fade hint (visible on mobile when content overflows) */}
        <div
          aria-hidden
          className="md:hidden pointer-events-none absolute top-0 right-0 bottom-0 w-8"
          style={{
            background: "linear-gradient(to right, transparent, var(--background) 70%)",
          }}
        />
      </div>
      <div className="py-6 md:py-8 min-w-0">{panels[active]}</div>
    </div>
  );
}
