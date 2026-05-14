"use client";

import type { ReactNode } from "react";

export type ViewToggleOption<Id extends string> = {
  id: Id;
  glyph: ReactNode;
  ariaLabel: string;
};

export function ViewToggle<Id extends string>({
  options,
  value,
  onChange,
}: {
  options: ViewToggleOption<Id>[];
  value: Id;
  onChange: (id: Id) => void;
}) {
  return (
    <div className="flex border border-border ml-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className="cursor-pointer px-3 py-1.5"
          style={{
            background: value === o.id ? "var(--foreground)" : "transparent",
            color: value === o.id ? "var(--background)" : "var(--secondary-foreground)",
          }}
          aria-label={o.ariaLabel}
        >
          {o.glyph}
        </button>
      ))}
    </div>
  );
}
