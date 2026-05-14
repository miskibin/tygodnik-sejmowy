"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ContrastIcon, MoonIcon, SunIcon } from "lucide-react";

type Variant = "masthead" | "mobile";

type CycleStep = {
  next: string;
  Icon: typeof MoonIcon;
  label: string;
};

const CYCLE: Record<string, CycleStep> = {
  light: { next: "dark",  Icon: MoonIcon,     label: "Włącz tryb ciemny" },
  dark:  { next: "slate", Icon: ContrastIcon, label: "Włącz tryb stonowany" },
  slate: { next: "light", Icon: SunIcon,      label: "Włącz tryb jasny" },
};

export function ThemeToggle({ variant = "masthead" }: { variant?: Variant }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = mounted ? resolvedTheme ?? "light" : "light";
  const step = CYCLE[current] ?? CYCLE.light;
  const Icon = step.Icon;

  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={() => setTheme(step.next)}
        aria-label={step.label}
        title={step.label}
        className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-border text-foreground bg-background hover:bg-muted transition-colors"
      >
        {mounted ? (
          <Icon className="size-4" />
        ) : (
          <span className="size-4" aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(step.next)}
      aria-label={step.label}
      title={step.label}
      className="relative w-9 h-9 sm:w-8 sm:h-8 inline-flex items-center justify-center border border-border rounded-full text-secondary-foreground bg-background hover:bg-muted transition-colors"
    >
      {mounted ? (
        <Icon className="size-[14px]" strokeWidth={1.8} />
      ) : (
        <span className="size-[14px]" aria-hidden />
      )}
    </button>
  );
}
