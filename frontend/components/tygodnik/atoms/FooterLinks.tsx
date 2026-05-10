import Link from "next/link";
import type { ReactNode } from "react";

// Shared "pełny tekst druku ↗" / "jak głosował twój poseł ↗" / "stenogram
// debaty ↗" footer-link row. Replaces 3 divergent inline implementations
// across BriefList card variants. Internal links use Next Link, external
// keeps native <a target="_blank">.

export type FooterLink = {
  href: string;
  label: ReactNode;
  // External (target=_blank, rel=noreferrer) vs in-app navigation.
  external?: boolean;
  // Render as a button instead of a link (e.g. expand/collapse). When set,
  // `href` is ignored and `onClick` is used.
  onClick?: () => void;
  // The accent (oxblood underline) — first link uses this, rest are muted.
  primary?: boolean;
};

function arrowFor(link: FooterLink): string {
  if (link.onClick) return "";
  return link.external ? " ↗" : " ↗";
}

export function FooterLinks({ links }: { links: FooterLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 font-sans text-xs">
      {links.map((link, i) => {
        const colorCls = link.primary
          ? "text-destructive border-destructive"
          : "text-muted-foreground border-dotted border-muted-foreground";
        const cls = `cursor-pointer border-b pb-px ${colorCls}`;
        if (link.onClick) {
          return (
            <button key={i} type="button" onClick={link.onClick} className={cls}>
              {link.label}
            </button>
          );
        }
        if (link.external) {
          return (
            <a
              key={i}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className={cls}
            >
              {link.label}
              {arrowFor(link)}
            </a>
          );
        }
        return (
          <Link key={i} href={link.href} className={cls}>
            {link.label}
            {arrowFor(link)}
          </Link>
        );
      })}
    </div>
  );
}
