"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { SearchIcon } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { PatroniteTrackedLink } from "./PatroniteTrackedLink";
import { MobileNav } from "./MobileNav";
import { ThemeToggle } from "./ThemeToggle";
import { TygodnikLogoMark } from "./TygodnikLogoMark";
import { GlobalSearchDialog } from "./GlobalSearchDialog";
import { PRIMARY_NAV, SECONDARY_NAV, isActive } from "./nav-items";

// Tablet (768–1023) inherits the mobile burger nav. At iPad widths the 6 primary
// pills + Więcej + okręg pill + Wesprzyj wrapped to 6 stacked rows because the
// 1fr middle column got squeezed by the auto side columns. Promoting the
// mobile→desktop threshold to lg: gives us a clean burger on tablets, and we
// only re-introduce supplementary chrome (issue label, postcode pill) at xl:.

export function Masthead() {
  const pathname = usePathname();
  const { postcode, district } = useProfile();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global Cmd/Ctrl+K → toggle global search dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [moreOpen]);

  // Compute date client-side after mount so the prerender pass doesn't pin
  // current-time data into the static shell (Cache Components rejects raw
  // `new Date()` in the prerender; this also avoids hydration mismatch).
  const [dateLabel, setDateLabel] = useState<{ day: string; full: string } | null>(null);
  useEffect(() => {
    const t = new Date();
    setDateLabel({
      day: t.toLocaleDateString("pl-PL", { weekday: "short" }).replace(".", ""),
      full: t.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }),
    });
  }, []);
  const secondaryActive = SECONDARY_NAV.find((s) => isActive(pathname, s.href));

  return (
    <header className="sticky top-0 z-10 bg-background border-b border-rule">
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-2.5 lg:py-3 xl:py-3.5 grid items-center gap-2 sm:gap-3 lg:gap-4 xl:gap-7 grid-cols-[auto_1fr_auto]">
        {/* Hamburger + wordmark (burger shown <lg) */}
        <div className="flex items-center gap-1.5 sm:gap-3.5">
          <MobileNav />
          <Link
            href="/"
            aria-label="Tygodnik Sejmowy"
            className="flex items-center gap-2 sm:gap-2.5 md:gap-3 cursor-pointer"
          >
            <TygodnikLogoMark className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" />
            <span className="hidden sm:inline font-serif text-[20px] sm:text-[24px] md:text-[26px] font-medium tracking-tight text-foreground leading-none whitespace-nowrap">
              Tygodnik<span className="italic text-destructive"> Sejmowy</span>
            </span>
          </Link>
          {dateLabel && (
            <>
              <span className="hidden xl:inline w-px h-[18px] bg-border" />
              <span className="hidden xl:inline font-mono text-[10px] text-muted-foreground tracking-[0.1em] uppercase">
                <span className="text-destructive">●</span>&nbsp;{dateLabel.day}&nbsp;{dateLabel.full}
              </span>
            </>
          )}
        </div>

        {/* Primary nav (lg+ only — tablet falls back to burger) */}
        <nav className="hidden lg:flex justify-center gap-0.5 font-sans text-[13px] xl:text-[13.5px] flex-nowrap">
          {PRIMARY_NAV.map((item) => {
            const on = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 xl:px-4 py-2 rounded-full whitespace-nowrap transition-all duration-150 hover:bg-muted"
                style={{
                  color: on ? "var(--background)" : "var(--secondary-foreground)",
                  background: on ? "var(--foreground)" : "transparent",
                  fontWeight: on ? 500 : 400,
                }}
              >
                {item.label}
              </Link>
            );
          })}

          {/* Więcej dropdown */}
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              className="px-2.5 xl:px-3.5 py-2 rounded-full flex items-center gap-1 xl:gap-1.5 whitespace-nowrap transition-all duration-150 hover:bg-muted cursor-pointer"
              style={{
                color: secondaryActive ? "var(--background)" : "var(--secondary-foreground)",
                background: secondaryActive ? "var(--foreground)" : "transparent",
                fontWeight: secondaryActive ? 500 : 400,
              }}
            >
              {secondaryActive ? secondaryActive.label : "Więcej"}
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: moreOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                <polyline points="2,4 6,8 10,4" />
              </svg>
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto bg-background border border-rule rounded-md p-1.5 z-20"
                style={{
                  top: "calc(100% + 8px)",
                  minWidth: 200,
                  boxShadow: "0 12px 32px rgba(22,19,16,0.14), 0 2px 6px rgba(22,19,16,0.06)",
                }}
              >
                <div className="font-mono text-[9.5px] text-muted-foreground tracking-[0.16em] uppercase px-3 pt-2 pb-1.5">
                  Działy
                </div>
                {SECONDARY_NAV.map((s) => {
                  const on = isActive(pathname, s.href);
                  return (
                    <Link
                      key={s.href}
                      href={s.href}
                      onClick={() => setMoreOpen(false)}
                      className="block w-full px-3 py-2 rounded transition-colors hover:bg-muted"
                      style={{
                        color: on ? "var(--destructive)" : "var(--secondary-foreground)",
                        background: on ? "var(--muted)" : "transparent",
                        fontWeight: on ? 500 : 400,
                      }}
                    >
                      <div className="flex justify-between items-baseline gap-3 font-sans text-[13px]">
                        <span>{s.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{s.hint}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Right cluster */}
        <div className="flex items-center justify-end gap-1.5 md:gap-2 font-sans text-xs">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Szukaj"
            title="Szukaj (Ctrl+K)"
            className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 border border-border rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <SearchIcon className="size-3.5" aria-hidden="true" />
            <span className="text-[12px]">Szukaj</span>
            <kbd className="hidden xl:inline font-mono text-[10px] px-1.5 py-0.5 border border-border rounded text-muted-foreground">
              Ctrl K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Szukaj"
            title="Szukaj"
            className="md:hidden w-9 h-9 inline-flex items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors"
          >
            <SearchIcon className="size-4" aria-hidden="true" />
          </button>
          <Link
            href="/posel"
            title="Twój okręg"
            className="hidden xl:flex items-center gap-2 px-3 py-1.5 border border-border rounded-full text-secondary-foreground bg-background"
          >
            <span className="w-1.5 h-1.5 bg-destructive rounded-full" />
            <span className="font-mono text-[11px]" suppressHydrationWarning>
              {dateLabel ? (postcode || "--–---") : "--–---"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span suppressHydrationWarning>
              Okręg&nbsp;{dateLabel ? (district?.num ?? "—") : "—"}
            </span>
          </Link>

          <ThemeToggle />

          <PatroniteTrackedLink
            placement="masthead_desktop"
            aria-label="Wesprzyj"
            className="hidden sm:inline-flex px-4 py-2 rounded-full bg-foreground text-background text-[12.5px] font-medium tracking-wide items-center gap-1.5 transition-colors hover:bg-destructive"
          >
            Wesprzyj
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z" /></svg>
          </PatroniteTrackedLink>
          {/* Mobile-only Wesprzyj icon */}
          <PatroniteTrackedLink
            placement="masthead_mobile_icon"
            aria-label="Wesprzyj"
            title="Wesprzyj"
            className="sm:hidden w-9 h-9 inline-flex items-center justify-center rounded-full bg-foreground text-background"
          >
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z" />
            </svg>
          </PatroniteTrackedLink>
        </div>
      </div>
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
