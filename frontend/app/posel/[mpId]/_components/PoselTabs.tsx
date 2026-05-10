"use client";

import { useState, type ReactNode } from "react";

type Tab = { id: string; label: string; count?: number | null };

export function PoselTabs({ tabs, panels }: { tabs: Tab[]; panels: Record<string, ReactNode> }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14">
      <div className="relative -mx-4 md:-mx-8 lg:-mx-14">
        <div
          className="border-b border-border flex gap-0 font-sans text-[13px] overflow-x-auto px-4 md:px-8 lg:px-14"
          style={{
            scrollSnapType: "x proximity",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
          }}
        >
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className="cursor-pointer flex items-baseline gap-2 whitespace-nowrap"
                style={{
                  padding: "14px 18px",
                  color: on ? "var(--destructive)" : "var(--secondary-foreground)",
                  borderBottom: on ? "2px solid var(--destructive)" : "2px solid transparent",
                  marginBottom: -1,
                  scrollSnapAlign: "start",
                }}
              >
                {t.label}
                {t.count != null && <span className="font-mono text-[10px] text-muted-foreground">{t.count}</span>}
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
      <div className="py-6 md:py-8">{panels[active]}</div>
    </div>
  );
}
