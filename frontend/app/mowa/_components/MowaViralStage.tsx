"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";

export type StageQuote = {
  id: number;
  speakerName: string | null;
  function: string | null;
  clubRef: string | null;
  viralQuote: string;
  viralReason: string | null;
  tone: string | null;
  date: string | null;
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

type Props = {
  quotes: StageQuote[];
  /** ms between auto-advances (0 disables) */
  intervalMs?: number;
};

// Single-quote feature stage for /mowa landing. Auto-cycles with cross-fade +
// vertical slide; click → /mowa/[id]. Pauses on hover/focus; static under
// prefers-reduced-motion.
export function MowaViralStage({ quotes, intervalMs = 5500 }: Props) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduce, setReduce] = useState(false);
  // Bump on idx change to retrigger CSS keyframes (re-mounts inner content).
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const onChange = () => setReduce(m.matches);
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (intervalMs <= 0 || paused || reduce || quotes.length < 2) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % quotes.length);
      setTick((t) => t + 1);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, paused, reduce, quotes.length]);

  if (quotes.length === 0) return null;
  const q = quotes[idx];
  const klubColor = q.clubRef
    ? KLUB_COLORS[q.clubRef] ?? "var(--muted-foreground)"
    : "var(--muted-foreground)";
  const klubLabel = q.clubRef ? KLUB_LABELS[q.clubRef] ?? q.clubRef : null;
  const date = fmtDate(q.date);

  return (
    <section
      aria-label="Najgłośniej w Sejmie"
      className="relative overflow-hidden border-b border-rule"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(60% 80% at 50% 0%, ${klubColor}14, transparent 70%)`,
          transition: "background 600ms ease",
        }}
      />

      <div className="relative max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-10 md:pt-14 pb-12 md:pb-16">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-destructive">
            ✶ Najgłośniej w Sejmie
          </div>
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground">
            {idx + 1} / {quotes.length}
          </div>
        </div>

        <Link
          href={`/mowa/${q.id}`}
          key={tick}
          className="mvs-fade group block focus:outline-none"
        >
          <div className="flex items-center gap-2 mb-5">
            <span
              className="inline-block rounded-full"
              style={{ width: 9, height: 9, background: klubColor }}
              aria-hidden
            />
            <span
              className="font-mono text-[11px] tracking-[0.18em] uppercase"
              style={{ color: klubColor }}
            >
              {klubLabel ?? "—"}
            </span>
            {date && (
              <>
                <span className="text-border" aria-hidden>·</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {date}
                </span>
              </>
            )}
          </div>

          <blockquote
            className="font-serif italic text-foreground leading-[1.08] m-0"
            style={{
              fontSize: "clamp(1.75rem, 5.5vw, 3.75rem)",
              letterSpacing: "-0.02em",
              textWrap: "balance",
            }}
          >
            <span
              aria-hidden
              className="select-none mr-2 font-serif italic"
              style={{ color: klubColor, opacity: 0.35 }}
            >
              “
            </span>
            {q.viralQuote}
          </blockquote>

          <figcaption className="mt-6 flex items-baseline gap-3 flex-wrap">
            <span className="font-serif text-[18px] md:text-[20px] text-foreground/90">
              — {q.speakerName ?? "anonim"}
            </span>
            {q.function && (
              <span className="font-sans text-[12px] text-muted-foreground italic">
                {q.function}
              </span>
            )}
            <span className="ml-auto font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground group-hover:text-destructive transition-colors">
              przeczytaj wypowiedź →
            </span>
          </figcaption>

          {q.viralReason && (
            <p className="mt-4 max-w-[640px] font-sans text-[12.5px] italic text-muted-foreground leading-snug">
              {q.viralReason}
            </p>
          )}
        </Link>

        <div className="mt-8 flex items-center gap-1.5">
          {quotes.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setIdx(i);
                setTick((t) => t + 1);
              }}
              aria-label={`Przejdź do cytatu ${i + 1}`}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === idx ? 26 : 6,
                background:
                  i === idx ? "var(--destructive)" : "var(--border)",
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes mvs-in {
          0%   { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .mvs-fade { animation: mvs-in 540ms cubic-bezier(0.22, 0.6, 0.36, 1); }
        @media (prefers-reduced-motion: reduce) {
          .mvs-fade { animation: none; }
        }
      `}</style>
    </section>
  );
}
