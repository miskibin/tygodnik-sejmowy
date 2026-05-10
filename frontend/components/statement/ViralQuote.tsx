// Hero pull-quote. Magazine feature treatment: large italic serif, oxblood
// drop-shadow on opening glyph, animated yellow underline drawing on first
// scroll-into-view (CSS-only, respects prefers-reduced-motion).

import { toneInk } from "./ToneBadge";

export function ViralQuote({
  quote,
  reason,
  tone,
}: {
  quote: string;
  reason?: string | null;
  tone?: string | null;
}) {
  const accent = toneInk(tone ?? null);
  return (
    <figure className="my-5 md:my-8 max-w-[760px] mx-auto" aria-label="Cytat wiralowy">
      <blockquote
        className="vqu-block relative font-serif italic text-foreground leading-[1.2]"
        style={{
          fontSize: "clamp(1.25rem, 2.6vw, 1.75rem)",
          letterSpacing: "-0.01em",
          textWrap: "balance",
        }}
      >
        <span
          aria-hidden
          className="absolute -left-2 md:-left-4 -top-1 select-none font-serif italic"
          style={{
            fontSize: "clamp(2.25rem, 5vw, 3.25rem)",
            color: accent,
            opacity: 0.18,
            lineHeight: 1,
          }}
        >
          “
        </span>
        <span className="relative z-10">{quote}</span>
        <span
          className="vqu-underline absolute left-0 right-0 -bottom-0.5 h-[4px] rounded-sm"
          aria-hidden
          style={{ background: accent, opacity: 0.18 }}
        />
      </blockquote>
      {reason && (
        <figcaption className="mt-3 font-sans text-[12px] text-muted-foreground italic max-w-[520px]">
          {reason}
        </figcaption>
      )}
      <style>{`
        @keyframes vqu-draw {
          from { transform: scaleX(0); transform-origin: left; }
          to   { transform: scaleX(1); transform-origin: left; }
        }
        .vqu-underline {
          animation: vqu-draw 1.1s cubic-bezier(0.22, 0.6, 0.36, 1) 0.25s both;
        }
        @media (prefers-reduced-motion: reduce) {
          .vqu-underline { animation: none; }
        }
      `}</style>
    </figure>
  );
}
