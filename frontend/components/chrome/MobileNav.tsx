"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { TygodnikLogoMark } from "./TygodnikLogoMark";
import { PatroniteTrackedLink } from "./PatroniteTrackedLink";
import { ThemeToggle } from "./ThemeToggle";
import { SIDEBAR_MAIN_NAV, SECONDARY_GROUPS, isActive } from "./nav-items";
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Otwórz menu"
          className="lg:hidden inline-flex items-center justify-center w-10 h-10 -ml-2 rounded-md text-foreground hover:bg-muted transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[86%] max-w-[340px] bg-background p-0 flex flex-col gap-0"
      >
        <SheetTitle className="sr-only">Menu główne</SheetTitle>

        <div className="px-5 pt-5 pb-4 border-b border-rule">
          <Link
            href="/"
            onClick={close}
            className="flex items-center gap-2.5 text-[22px] font-medium tracking-tight text-foreground leading-none"
          >
            <TygodnikLogoMark className="h-8 w-8 shrink-0" />
            <span>
              Tygodnik<span className="italic text-destructive"> Sejmowy</span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="text-[11px] text-muted-foreground px-3 pb-2 font-medium">
            Główne
          </div>
          {SIDEBAR_MAIN_NAV.map((item) => {
            const on = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}                className="block px-3 py-3 rounded-md font-sans text-[15px] transition-colors"
                style={{
                  color: on ? "var(--background)" : "var(--foreground)",
                  background: on ? "var(--foreground)" : "transparent",
                  fontWeight: on ? 500 : 400,
                }}
              >
                {item.label}
              </Link>
            );
          })}

          {SECONDARY_GROUPS.map(group => <div key={group.label} className="pt-4">
            <p className="px-3 py-2 text-xs text-muted-foreground">{group.label}</p>
            {group.items.map(item => <Link key={item.href} href={item.href} onClick={close}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className="block rounded-md px-3 py-3 text-sm hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-semibold">{item.label}</Link>)}
          </div>)}
        </nav>

        <div className="px-3 py-4 border-t border-rule flex items-center gap-2">
          <ThemeToggle variant="mobile" />
          <PatroniteTrackedLink
            placement="mobile_nav"
            onClick={close}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full bg-foreground text-background text-[13px] font-medium"
          >
            Wesprzyj
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z" />
            </svg>
          </PatroniteTrackedLink>
        </div>
      </SheetContent>
    </Sheet>
  );
}
