"use client";

import { useEffect, useReducer, useRef, useState } from "react";
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
  /** ms per char while deleting */
  deleteMs?: number;
  /** ms to hold a fully-typed quote before deleting */
  holdMs?: number;
  /** ms between deleting one quote and starting the next */
  gapMs?: number;
};

// Stage machine: type → hold → delete → gap → next. Single setTimeout, owned
// by a ref so React 19 StrictMode double-invocation doesn't double-fire.
type Stage = "type" | "hold" | "delete" | "gap";

export function TypewriterCitation({
  quotes,
  typeMs = 28,
  deleteMs = 14,
  holdMs = 3200,
  gapMs = 320,
}: Props) {
  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState<Stage>("type");
  const [chars, setChars] = useState(0);
  const [reduce, setReduce] = useState(false);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const onChange = () => setReduce(m.matches);
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);

  // Rotate quotes once every ~6s when reduced motion is on — no per-char anim.
  useEffect(() => {
    if (!reduce || quotes.length < 2) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % quotes.length);
      force();
    }, 6500);
    return () => clearInterval(id);
  }, [reduce, quotes.length]);

  useEffect(() => {
    if (reduce || quotes.length === 0) return;
    const current = quotes[idx]?.quote ?? "";
    const len = current.length;

    const schedule = (ms: number, fn: () => void) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(fn, ms);
    };

    if (stage === "type") {
      if (chars < len) {
        schedule(typeMs, () => setChars((c) => c + 1));
      } else {
        schedule(holdMs, () => setStage("hold"));
      }
    } else if (stage === "hold") {
      setStage("delete");
    } else if (stage === "delete") {
      if (chars > 0) {
        schedule(deleteMs, () => setChars((c) => c - 1));
      } else {
        schedule(gapMs, () => setStage("gap"));
      }
    } else if (stage === "gap") {
      setIdx((i) => (i + 1) % quotes.length);
      setStage("type");
    }

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [stage, chars, idx, quotes, typeMs, deleteMs, holdMs, gapMs, reduce]);

  if (quotes.length === 0) return null;

  const current = quotes[idx];
  const visible = reduce ? current.quote : current.quote.slice(0, chars);
  const klub = current.clubRef;
  const klubColor = klub ? KLUB_COLORS[klub] ?? "var(--muted-foreground)" : "var(--muted-foreground)";
  const klubLabel = klub ? KLUB_LABELS[klub] ?? klub : null;

  return (
    <div
      className="mt-6 max-w-[560px]"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
        Z mównicy
      </div>
      <Link
        href={`/mowa/${current.id}`}
        className="group block"
      >
        <blockquote
          className="font-serif italic text-foreground leading-[1.3] min-h-[5.5em]"
          style={{
            fontSize: "clamp(1.05rem, 1.6vw, 1.35rem)",
            textWrap: "balance",
            letterSpacing: "-0.005em",
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
        </blockquote>
        <figcaption className="mt-3 font-sans text-[12px] text-muted-foreground flex items-center gap-2 flex-wrap">
          <span className="text-foreground/80">
            — {current.speaker ?? "anonim"}
          </span>
          {klubLabel && (
            <>
              <span className="text-border" aria-hidden>·</span>
              <span
                className="inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-wide"
                style={{ color: klubColor }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{ width: 6, height: 6, background: klubColor }}
                  aria-hidden
                />
                {klubLabel}
              </span>
            </>
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
