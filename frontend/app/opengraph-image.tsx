import { ImageResponse } from "next/og";

// Programmatic OG card. Renders once at build time (statically optimized
// per Next docs) and caches at the edge. No external font asset needed —
// Vercel's runtime ships system + a fallback sans, and we set explicit
// font-family stacks to keep typography predictable.
//
// Edit the visual here; output URL stays /opengraph-image.

// Next 16: edge runtime deprecated; nodejs is the default for OG generation.
export const alt = "Tygodnik Sejmowy — co Sejm zmienił w Twoim życiu";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Site palette (fixed-light brand for OG card, mirrors shadcn tokens in app/globals.css).
const PAPER = "#f4ede1";
const INK = "#161310";
const RED = "#a8262a";
const RULE = "#cdbfa9";
const MUTED = "#7a6f5e";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: PAPER,
          color: INK,
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          fontFamily: "Georgia, 'Source Serif 4', serif",
        }}
      >
        {/* Top edition line */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            fontSize: 18,
            color: MUTED,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          <span style={{ color: RED }}>●</span>
          <span>tygodnik · obywatelski</span>
          <span style={{ color: RULE }}>·</span>
          <span>tygodniksejmowy.pl</span>
        </div>

        {/* Wordmark */}
        <div
          style={{
            marginTop: 48,
            fontSize: 110,
            lineHeight: 0.95,
            letterSpacing: -3,
            fontWeight: 600,
            display: "flex",
            flexWrap: "wrap",
            gap: 22,
          }}
        >
          <span>Tygodnik</span>
          <span style={{ color: RED, fontStyle: "italic" }}>Sejmowy</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            marginTop: 36,
            fontSize: 42,
            lineHeight: 1.2,
            color: INK,
            maxWidth: 980,
            fontStyle: "italic",
            letterSpacing: -0.5,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span>W piątek dowiesz się, co Sejm zmienił</span>
          <span style={{ color: RED }}>w Twoim życiu.</span>
        </div>

        {/* Bottom rule + meta */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: 32,
            borderTop: `1px solid ${RULE}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            fontSize: 18,
            color: MUTED,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          <span>3 min czytania · 5–7 rzeczy · 1× w tygodniu</span>
          <span style={{ color: INK }}>bez reklam · bez partii</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
