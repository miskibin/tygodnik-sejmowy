"use client";

import type { ChangeEvent } from "react";

export function SearchHero({
  value,
  onChange,
  placeholder,
  filteredCount,
  totalCount,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  filteredCount: number;
  totalCount: number;
}) {
  return (
    <div className="relative mb-5">
      <span
        aria-hidden
        className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 font-serif text-destructive pointer-events-none"
        style={{ fontSize: "clamp(20px, 5vw, 26px)" }}
      >
        ⌕
      </span>
      <input
        type="search"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent outline-none font-serif text-foreground placeholder:italic placeholder:text-muted-foreground"
        style={{
          fontSize: "clamp(16px, 3.2vw, 22px)",
          padding: "14px 96px 14px 40px",
          borderBottom: "2px solid var(--foreground)",
          fontStyle: value ? "normal" : "italic",
        }}
      />
      <span
        aria-hidden
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 font-mono text-[11px] tracking-wide text-muted-foreground"
      >
        {filteredCount} / {totalCount}
      </span>
    </div>
  );
}
