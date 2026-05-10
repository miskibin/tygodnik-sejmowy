"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";

type Variant = "masthead" | "mobile";

export function ThemeToggle({ variant = "masthead" }: { variant?: Variant }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";
  const label = isDark ? "Włącz tryb jasny" : "Włącz tryb ciemny";

  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={label}
        title={label}
        className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-border text-foreground bg-background hover:bg-muted transition-colors"
      >
        {mounted ? (
          isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />
        ) : (
          <span className="size-4" aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className="relative w-9 h-9 sm:w-8 sm:h-8 inline-flex items-center justify-center border border-border rounded-full text-secondary-foreground bg-background hover:bg-muted transition-colors"
    >
      {mounted ? (
        isDark ? <SunIcon className="size-[14px]" strokeWidth={1.8} /> : <MoonIcon className="size-[14px]" strokeWidth={1.8} />
      ) : (
        <span className="size-[14px]" aria-hidden />
      )}
    </button>
  );
}
