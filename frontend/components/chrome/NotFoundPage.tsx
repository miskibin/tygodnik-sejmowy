import Link from "next/link";
import type { ReactNode } from "react";

// NotFoundPage — branded 404 used either by Next.js convention files
// (app/not-found.tsx, app/<route>/not-found.tsx) or rendered explicitly
// by a route's catch-block. Server component. SiteFooter is mounted
// globally in app/layout.tsx, so we don't render it here.
//
// Magazine-style: massive italic "404" oxblood, then "[Entity] nie
// znalezion[a/y]" h1, optional id badge, short body, back link.

export type NotFoundPageProps = {
  /** Entity label, e.g. "Wypowiedź", "Druk", "Głosowanie", "Poseł". */
  entity: string;
  /** Polish grammatical gender of `entity`. Drives "nie znaleziona/y/e". */
  gender?: "f" | "m" | "n";
  /** Optional id rendered as a small mono badge below the h1. */
  id?: string | number;
  /** Override the default body copy. */
  message?: ReactNode;
  /** CTA back to working content. Defaults to /tygodnik. */
  backLink?: { href: string; label: string };
};

const NEGATION_BY_GENDER: Record<"f" | "m" | "n", string> = {
  f: "nie znaleziona",
  m: "nie znaleziony",
  n: "nie znalezione",
};

export function NotFoundPage({
  entity,
  gender = "f",
  id,
  message,
  backLink = { href: "/tygodnik", label: "Wróć do Tygodnika →" },
}: NotFoundPageProps) {
  const negation = NEGATION_BY_GENDER[gender];
  return (
    <main
      aria-label="Strona nie znaleziona"
      className="bg-background text-foreground font-serif px-4 sm:px-8 md:px-14 pt-10 sm:pt-14 pb-24 sm:pb-28"
    >
      <div className="max-w-[760px] mx-auto">
        <div
          aria-hidden="true"
          className="font-serif italic font-medium leading-none tracking-[-0.04em] mb-6"
          style={{
            color: "var(--destructive)",
            fontSize: "clamp(5.5rem, 18vw, 11rem)",
          }}
        >
          404
        </div>

        <h1
          className="font-serif font-medium m-0"
          style={{
            fontSize: "clamp(1.75rem, 4.5vw, 2.75rem)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          {entity} {negation}
        </h1>

        {id != null && id !== "" && (
          <div className="mt-3 font-mono text-[11px] tracking-[0.16em] uppercase text-muted-foreground">
            id <span className="text-foreground">{String(id)}</span>
          </div>
        )}

        <p
          className="font-serif text-secondary-foreground max-w-[640px] mt-6 mb-10"
          style={{ fontSize: 18, lineHeight: 1.55 }}
        >
          {message ?? (
            <>
              Pod tym adresem nic nie ma — być może id jest błędne, dane jeszcze nie
              zostały załadowane, albo strona została usunięta. Sprawdź adres lub
              wróć do listy.
            </>
          )}
        </p>

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
