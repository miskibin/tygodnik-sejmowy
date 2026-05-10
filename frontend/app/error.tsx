"use client";

import Link from "next/link";
import { useEffect } from "react";

// Global error boundary (Next.js convention). Replaces the default red
// dev-style stack trace with a branded "Coś poszło nie tak" page in
// production. Client component (required by Next).

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side errors will already be logged by Next; this captures
    // client-side hydration / event-handler failures.
    console.error("[app/error.tsx]", error);
  }, [error]);

  return (
    <main
      aria-label="Błąd strony"
      className="bg-background text-foreground font-serif px-4 sm:px-8 md:px-14 pt-10 sm:pt-14 pb-24 sm:pb-28"
    >
      <div className="max-w-[760px] mx-auto">
        <div
          aria-hidden="true"
          className="font-serif italic font-medium leading-none tracking-[-0.04em] mb-6"
          style={{
            color: "var(--destructive)",
            fontSize: "clamp(4rem, 14vw, 8rem)",
          }}
        >
          ✶✶✶
        </div>

        <h1
          className="font-serif font-medium m-0"
          style={{
            fontSize: "clamp(1.75rem, 4.5vw, 2.75rem)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          Coś poszło nie tak
        </h1>

        {error.digest && (
          <div className="mt-3 font-mono text-[11px] tracking-[0.16em] uppercase text-muted-foreground">
            kod <span className="text-foreground">{error.digest}</span>
          </div>
        )}

        <p
          className="font-serif text-secondary-foreground max-w-[640px] mt-6 mb-10"
          style={{ fontSize: 18, lineHeight: 1.55 }}
        >
          Strony nie udało się zrenderować. To pewnie nasza wina —
          spróbuj odświeżyć, a jeśli to nie pomoże, wróć do Tygodnika.
        </p>

        <div className="flex items-center gap-5 flex-wrap">
          <button
            type="button"
            onClick={reset}
            className="font-mono text-[12px] tracking-[0.16em] uppercase px-4 py-2 border border-foreground text-foreground hover:bg-foreground hover:text-background cursor-pointer"
          >
            Spróbuj ponownie
          </button>
          <Link
            href="/tygodnik"
            className="font-mono text-[12px] tracking-[0.16em] uppercase text-destructive hover:underline decoration-dotted underline-offset-4"
          >
            Wróć do Tygodnika →
          </Link>
        </div>
      </div>
    </main>
  );
}
