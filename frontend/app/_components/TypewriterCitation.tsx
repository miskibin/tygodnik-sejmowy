"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";

export type TypewriterQuote = {
  id: number;
  quote: string;
  speaker: string | null;
  clubRef: string | null;
};

type Props = {
  quotes: TypewriterQuote[];
  /** ms per char while typing */
  typeMs?: number;
  /** ms a fully-typed quote stays on screen before fading */
  holdMs?: number;
  /** ms cross-fade between quotes */
  fadeMs?: number;
  /** max chars per quote — caps long body snippets so layout stays calm */
  maxChars?: number;
};

// Forward-only typewriter: type → hold → fade out → swap quote → fade in →
// type. No backspace (it looked unnatural). Container reserves height via an
// invisible ghost layer so the visible text typing on top never reflows
// line-by-line as chars appear.
export function TypewriterCitation({
  quotes,
  typeMs = 26,
  holdMs = 5200,
  fadeMs = 360,
  maxChars = 180,
}: Props) {
  const [idx, setIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const [fading, setFading] = useState(false);
  const [reduce, setReduce] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const onChange = () => setReduce(m.matches);
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);

  // Reduce-motion: rotate every ~7s, no per-char animation.
  useEffect(() => {
    if (!reduce || quotes.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % quotes.length), 7000);
    return () => clearInterval(id);
  }, [reduce, quotes.length]);

  // Typing + hold-then-fade-out.
  useEffect(() => {
    if (reduce || quotes.length === 0 || fading) return;
    const full = (quotes[idx]?.quote ?? "").slice(0, maxChars);
    const len = full.length;
    if (chars < len) {
      timer.current = setTimeout(() => setChars((c) => c + 1), typeMs);
    } else {
      timer.current = setTimeout(() => setFading(true), holdMs);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [idx, chars, fading, quotes, typeMs, holdMs, maxChars, reduce]);

  // Fade-out → swap quote → fade back in (typing resumes from 0).
  useEffect(() => {
    if (!fading) return;
    timer.current = setTimeout(() => {
      setIdx((i) => (i + 1) % quotes.length);
      setChars(0);
      setFading(false);
    }, fadeMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fading, quotes.length, fadeMs]);

  if (quotes.length === 0) return null;

  const current = quotes[idx];
  const full = current.quote.slice(0, maxChars);
  const visible = reduce ? full : full.slice(0, chars);
  const klub = current.clubRef;
  const klubColor = klub ? KLUB_COLORS[klub] ?? "var(--muted-foreground)" : "var(--muted-foreground)";
  const klubLabel = klub ? KLUB_LABELS[klub] ?? klub : null;

  return (
    <div className="mt-6 max-w-[560px]" aria-live="polite" aria-atomic="true">
      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
        Z mównicy
      </div>
      <Link href={`/mowa/${current.id}`} className="group block">
        {/* Fixed min-height = 4 lines × line-height = stable container across
            every quote regardless of length. Two design rules together kill
            the line-jumping bug:
              1. Both ghost (full) and visible (partial) layers share the SAME
                 wrapping context — no `text-wrap: balance` (it recomputes per
                 element, so partial vs full balance differently and words
                 jump as chars stream in). Default greedy wrap means partial
                 text wraps identically to the first N chars of the full one.
              2. min-height locks page layout — quote-to-quote swaps no longer
                 shrink/grow the hero block. */}
        <blockquote
          className="relative font-serif italic text-foreground leading-[1.3] m-0"
          style={{
            fontSize: "clamp(1.05rem, 1.6vw, 1.35rem)",
            letterSpacing: "-0.005em",
            textWrap: "wrap",
            minHeight: "5.4em",
          }}
        >
          {/* Ghost: full quote, invisible — reserves wrapped-line size. */}
          <span
            aria-hidden
            style={{ visibility: "hidden", display: "block", whiteSpace: "normal" }}
          >
            <span style={{ marginRight: 4 }}>“</span>
            {full}
          </span>
          {/* Visible layer cross-fades on quote swap, overlays ghost so the
              wrapping context is identical (same width, same font metrics). */}
          <span
            className="absolute inset-0 block"
            style={{
              opacity: fading ? 0 : 1,
              transition: `opacity ${fadeMs}ms ease`,
              textWrap: "wrap",
            }}
          >
            <span
              aria-hidden
              className="select-none mr-1 font-serif italic"
              style={{ color: klubColor, opacity: 0.45 }}
            >
              “
            </span>
            {visible}
            {!reduce && !fading && chars < full.length && (
              <span
                aria-hidden
                className="tw-caret inline-block align-baseline ml-[1px]"
                style={{
                  width: 2,
                  height: "1em",
                  background: "var(--destructive)",
                  transform: "translateY(0.15em)",
                }}
              />
            )}
          </span>
        </blockquote>
        <figcaption className="mt-4 flex items-center gap-3 flex-wrap min-h-[1.8em]">
          <span
            className="font-serif text-[16px] md:text-[17px] text-foreground/90 transition-opacity"
            style={{ opacity: fading ? 0 : 1, transitionDuration: `${fadeMs}ms` }}
          >
            — {current.speaker ?? "anonim"}
          </span>
          {klubLabel && (
            <span
              className="inline-flex items-center gap-1.5 font-mono text-[12px] tracking-[0.08em] uppercase px-2 py-0.5 rounded-full transition-opacity"
              style={{
                color: klubColor,
                background: `color-mix(in oklab, ${klubColor} 12%, transparent)`,
                border: `1px solid color-mix(in oklab, ${klubColor} 30%, transparent)`,
                opacity: fading ? 0 : 1,
                transitionDuration: `${fadeMs}ms`,
              }}
            >
              <span
                className="inline-block rounded-full"
                style={{ width: 7, height: 7, background: klubColor }}
                aria-hidden
              />
              {klubLabel}
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity">
            otwórz →
          </span>
        </figcaption>
      </Link>

      <style>{`
        @keyframes tw-blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
        .tw-caret { animation: tw-blink 1s steps(2) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .tw-caret { animation: none; opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
