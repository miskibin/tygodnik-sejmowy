"use client";

import type { ReactNode } from "react";

export type FilterChipOption = {
  id: string;
  label: string;
  count?: number;
  color?: string;
  leading?: ReactNode;
};

export function FilterChipRow({
  options,
  selected,
  onChange,
  allLabel = "Wszystkie",
}: {
  options: FilterChipOption[];
  selected: string;
  onChange: (id: string) => void;
  allLabel?: string;
}) {
  return (
    <div
      className="flex gap-1.5 mb-3 font-sans text-[12px] overflow-x-auto sm:overflow-visible sm:flex-wrap -mx-3 sm:mx-0 px-3 sm:px-0 [scrollbar-width:thin]"
      style={{ scrollSnapType: "x proximity" }}
    >
      <button
        type="button"
        onClick={() => onChange("all")}
        className="cursor-pointer rounded-full px-3 py-1.5 shrink-0"
        style={{
          border: `1px solid ${selected === "all" ? "var(--foreground)" : "var(--border)"}`,
          background: selected === "all" ? "var(--foreground)" : "transparent",
          color: selected === "all" ? "var(--background)" : "var(--secondary-foreground)",
          scrollSnapAlign: "start",
        }}
      >
        {allLabel}
      </button>
      {options.map((o) => {
        const on = selected === o.id;
        const color = o.color ?? "var(--muted-foreground)";
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(on ? "all" : o.id)}
            className="cursor-pointer rounded-full px-2.5 py-1.5 flex items-center gap-1.5 shrink-0"
            style={{
              border: `1px solid ${on ? color : "var(--border)"}`,
              background: on ? `${color}1a` : "transparent",
              color: on ? color : "var(--secondary-foreground)",
              scrollSnapAlign: "start",
            }}
          >
            {o.leading}
            <span>{o.label}</span>
            {o.count != null && (
              <span className="font-mono text-[10px] opacity-70">{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
