import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeading } from "./PageHeading";

// ComingSoonPage — single placeholder for routes whose backing data/auth
// isn't wired yet. Intentionally quiet: no card-fest, no "explore other
// features" CTA grid, no empty filter chips. Just a heading with a
// "WKRÓTCE" pill, a one-line description, optional planned-features list,
// and a back link to something that works. SiteFooter is mounted globally
// in app/layout.tsx, so we don't render it here.

export type ComingSoonPageProps = {
  /** Short route name, e.g. "Mowa sejmowa", "Szukaj", "Alerty". */
  routeName: ReactNode;
  /** 1-2 sentences plain Polish — what this WILL do. */
  description: ReactNode;
  /** Optional bullets — things we plan to ship under this route. */
  plannedFeatures?: string[];
  /** CTA back to working content. Defaults to /tygodnik. */
  backLink?: { href: string; label: string };
};

export function ComingSoonPage({
  routeName,
  description,
  plannedFeatures,
  backLink = { href: "/tygodnik", label: "Wróć do Tygodnika →" },
}: ComingSoonPageProps) {
  return (
    <main
      role="status"
      className="bg-background text-foreground font-serif px-4 sm:px-8 md:px-14 pt-10 sm:pt-12 pb-24 sm:pb-28"
    >
      <div className="max-w-[760px] mx-auto">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <PageHeading>{routeName}</PageHeading>
          <span
            aria-label="Funkcja w przygotowaniu"
            className="font-mono text-[10px] tracking-[0.18em] uppercase px-2 py-[3px] rounded-sm"
            style={{
              background: "var(--destructive)",
              color: "var(--background)",
            }}
          >
            Wkrótce
          </span>
        </div>

        <p
          className="font-serif text-secondary-foreground max-w-[680px] mt-4 mb-8"
          style={{ fontSize: 19, lineHeight: 1.55 }}
        >
          {description}
        </p>

        {plannedFeatures && plannedFeatures.length > 0 && (
          <>
            <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
              Co planujemy
            </div>
            <ul className="font-serif text-[16px] leading-[1.55] text-foreground m-0 p-0 list-none mb-10">
              {plannedFeatures.map((f) => (
                <li
                  key={f}
                  className="pl-5 mb-2 relative"
                  style={{ textIndent: 0 }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-[0.55em] font-mono"
                    style={{ color: "var(--destructive)", fontSize: 12, lineHeight: 1 }}
                  >
                    ▸
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </>
        )}

        <Link
          href={backLink.href}
          className="font-mono text-[12px] tracking-[0.16em] uppercase text-destructive hover:underline decoration-dotted underline-offset-4"
        >
          {backLink.label}
        </Link>
      </div>
    </main>
  );
}
