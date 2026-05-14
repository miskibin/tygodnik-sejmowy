"use client";

export type SortOption<Id extends string> = {
  id: Id;
  label: string;
  tip?: string;
};

export function SortButtons<Id extends string>({
  options,
  value,
  onChange,
  label = "Sortuj",
}: {
  options: SortOption<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-0 flex-wrap">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground mr-2">
        {label}
      </span>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            title={o.tip}
            className="cursor-pointer px-2.5 py-1.5"
            style={{
              color: on ? "var(--destructive)" : "var(--secondary-foreground)",
              borderBottom: on ? "2px solid var(--destructive)" : "2px solid transparent",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
