"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { trackExternalLinkClick, trackNavClick } from "@/lib/analytics-events";
import { TygodnikLogoMark } from "./TygodnikLogoMark";
import { useProfile } from "@/lib/profile";
import { ThemeToggle } from "./ThemeToggle";
import { PRIMARY_NAV, SECONDARY_NAV, isActive } from "./nav-items";

export function MobileNav({ alertsCount = 0 }: { alertsCount?: number }) {
  const pathname = usePathname();
  const { postcode, district } = useProfile();
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
            className="flex items-center gap-2.5 font-serif text-[22px] font-medium tracking-tight text-foreground leading-none"
          >
            <TygodnikLogoMark className="h-8 w-8 shrink-0" />
            <span>
              Tygodnik<span className="italic text-destructive"> Sejmowy</span>
            </span>
          </Link>
          {postcode && (
            <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 border border-border rounded-full text-secondary-foreground text-[11px]">
              <span className="w-1.5 h-1.5 bg-destructive rounded-full" />
              <span className="font-mono">{postcode}</span>
              <span className="text-muted-foreground">·</span>
              <span>Okręg&nbsp;{district?.num ?? "—"}</span>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="font-mono text-[10px] text-muted-foreground tracking-[0.16em] uppercase px-3 pb-2">
            Główne
          </div>
          {PRIMARY_NAV.map((item) => {
            const on = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  trackNavClick({
                    fromPath: pathname,
                    targetPath: item.href,
                    navArea: "mobile_nav",
                    label: item.label,
                  });
                  close();
                }}
                className="block px-3 py-3 rounded-md font-sans text-[15px] transition-colors"
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

          <div className="font-mono text-[10px] text-muted-foreground tracking-[0.16em] uppercase px-3 pt-5 pb-2">
            Działy
          </div>
          {SECONDARY_NAV.map((s) => {
            const on = isActive(pathname, s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                onClick={() => {
                  trackNavClick({
                    fromPath: pathname,
                    targetPath: s.href,
                    navArea: "mobile_nav",
                    label: s.label,
                  });
                  close();
                }}
                className="flex items-baseline justify-between gap-3 px-3 py-2.5 rounded-md transition-colors hover:bg-muted"
                style={{
                  color: on ? "var(--destructive)" : "var(--secondary-foreground)",
                  background: on ? "var(--muted)" : "transparent",
                  fontWeight: on ? 500 : 400,
                }}
              >
                <span className="font-sans text-[14px]">{s.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{s.hint}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-rule flex items-center gap-2">
          <ThemeToggle variant="mobile" />
          <Link
            href="/alerty"
            onClick={() => {
              trackNavClick({
                fromPath: pathname,
                targetPath: "/alerty",
                navArea: "mobile_nav",
                label: "Alerty",
              });
              close();
            }}
            className="relative flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 border border-border rounded-full text-secondary-foreground text-[13px]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            Alerty
            {alertsCount > 0 && (
              <span className="ml-1 min-w-[18px] h-[18px] px-1.5 bg-destructive text-background font-mono text-[10px] font-semibold rounded-full inline-flex items-center justify-center">
                {alertsCount}
              </span>
            )}
          </Link>
          <a
            href="https://patronite.pl/tygodniksejmowy"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              trackExternalLinkClick({ destinationDomain: "patronite.pl", placement: "mobile_nav_support" });
              close();
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-full bg-foreground text-background text-[13px] font-medium"
          >
            Wesprzyj
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z" />
            </svg>
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
