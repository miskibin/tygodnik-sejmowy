"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { SearchIcon } from "lucide-react";
import { PatroniteTrackedLink } from "./PatroniteTrackedLink";
import { MobileNav } from "./MobileNav";
import { ThemeToggle } from "./ThemeToggle";
import { TygodnikLogoMark } from "./TygodnikLogoMark";
import { GlobalSearchDialog } from "./GlobalSearchDialog";
import { PRIMARY_NAV, SECONDARY_NAV, SECONDARY_GROUPS, isActive } from "./nav-items";

// Tablet (768–1023) inherits the mobile burger nav. At iPad widths the primary
// pills + Więcej + support action need more room than the middle column offers,
// so the mobile threshold stays at lg:.

export function Masthead() {
  const pathname = usePathname();
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

  const secondaryActive = SECONDARY_NAV.find((s) => isActive(pathname, s.href));

  return (
    <header className="sticky top-0 z-10 bg-background border-b border-rule">
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10 py-2.5 lg:py-0 grid items-center gap-2 sm:gap-3 lg:gap-4 xl:gap-7 grid-cols-[auto_1fr_auto]">
        {/* Hamburger + wordmark (burger shown <lg) */}
        <div className="flex items-center gap-1.5 sm:gap-3.5">
          <MobileNav />
          <Link
            href="/"
            aria-label="Tygodnik Sejmowy"
            className="flex items-center gap-2 sm:gap-2.5 md:gap-3 cursor-pointer"
          >
            <TygodnikLogoMark className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" />
            <span className="hidden sm:inline font-display text-[20px] sm:text-[24px] md:text-[26px] font-medium tracking-tight text-foreground leading-none whitespace-nowrap">
              Tygodnik<span className="italic text-destructive"> Sejmowy</span>
            </span>
          </Link>
        </div>

        {/* Primary nav (lg+ only — tablet falls back to burger) */}
        <nav className="hidden lg:flex justify-start gap-7 xl:gap-8 font-sans text-[13px] xl:text-[13.5px] flex-nowrap">
          {PRIMARY_NAV.map((item) => {
            const on = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex items-center min-h-16 whitespace-nowrap hover:text-foreground"
                aria-current={on ? "page" : undefined}
                style={{
                  color: on ? "var(--foreground)" : "var(--muted-foreground)",
                  borderBottom: on ? "2px solid var(--destructive)" : "2px solid transparent",
                  marginBottom: -1,
                  fontWeight: on ? 600 : 400,
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
              aria-controls="more-navigation"
              className="min-h-16 flex items-center gap-1.5 whitespace-nowrap hover:text-foreground cursor-pointer"
              style={{
                color: secondaryActive ? "var(--foreground)" : "var(--muted-foreground)",
                borderBottom: secondaryActive ? "2px solid var(--destructive)" : "2px solid transparent",
                marginBottom: -1,
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
                id="more-navigation"
                className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto bg-background border border-rule rounded-md p-1.5 z-20"
                style={{
                  top: "calc(100% + 8px)",
                  minWidth: 230,
                  maxHeight: "calc(100dvh - 100px)",
                  overflowY: "auto",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                {SECONDARY_GROUPS.map(group => <div key={group.label} className="py-2 first:pt-0 border-b border-border last:border-0">
                  <p className="px-3 py-2 text-xs text-muted-foreground">{group.label}</p>
                  {group.items.map(item => <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    className="block rounded px-3 py-2 text-sm hover:bg-muted aria-[current=page]:font-semibold">{item.label}</Link>)}
                </div>)}
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
            className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
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
          <ThemeToggle />

          <PatroniteTrackedLink
            placement="masthead_desktop"
            aria-label="Wesprzyj"
            className="hidden sm:inline-flex px-4 py-2 rounded-md bg-foreground text-background text-[12.5px] font-medium tracking-wide items-center gap-1.5 transition-opacity hover:opacity-90"
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
