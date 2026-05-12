"use client";

import { useState } from "react";
import type { TimelineEvent, TimelineEventKind } from "@/lib/timeline-events";
import { partyColor } from "@/app/sondaze/_components/partyMeta";

// stroke-dasharray per kind. election = solid, others vary so different
// event types remain distinguishable even when stacked close in time.
const DASH_BY_KIND: Record<TimelineEventKind, string | undefined> = {
  election: undefined,
  leadership: "3 2",
  coalition: "4 2",
  scandal: "1 2",
  policy: "2 2",
  other: "2 3",
};

type Variant = "sparkline" | "full";

// Tooltip box dimensions (SVG units). Anchored above the marker dot; clamped
// horizontally to chart bounds so it doesn't escape. Height is generous
// enough for a 2-line title + 2-line description on the full variant.
const TOOLTIP_W: Record<Variant, number> = { sparkline: 200, full: 260 };
const TOOLTIP_H: Record<Variant, number> = { sparkline: 56, full: 70 };

export function EventMarkers({
  events,
  xFor,
  yTop,
  yBottom,
  variant,
  chartWidth,
}: {
  events: TimelineEvent[];
  xFor: (isoDate: string) => number | null;
  yTop: number;
  yBottom: number;
  variant: Variant;
  // viewBox width — used to clamp the tooltip horizontally
  chartWidth: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (events.length === 0) return null;
  const isSpark = variant === "sparkline";
  const baseStroke = isSpark ? 0.9 : 1;
  const hoverStroke = isSpark ? 1.8 : 2;
  const dotR = isSpark ? 1.8 : 2.6;
  const hoverDotR = isSpark ? 3.4 : 4.6;
  const haloWidth = isSpark ? 8 : 14;

  // Render markers first, then tooltip on top so it can overlap nearby ones.
  return (
    <g>
      {events.map((e, i) => {
        const x = xFor(e.date);
        if (x == null) return null;
        const color = e.partyCode
          ? partyColor(e.partyCode)
          : "var(--muted-foreground)";
        const opacity = e.partyCode ? 0.7 : 0.55;
        const dash = DASH_BY_KIND[e.kind];
        const isHovered = hoveredIdx === i;
        const a11yLabel = e.description ? `${e.title} (${e.date}). ${e.description}` : `${e.title} (${e.date})`;
        return (
          <g
            key={`${e.date}-${i}`}
            role="img"
            aria-label={a11yLabel}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx((curr) => (curr === i ? null : curr))}
            style={{ cursor: "help" }}
          >
            {/* invisible wide halo for hit-testing; pointer-events: stroke so
                it only catches pointers along the line itself, not the bbox.
                The <title> here is the native fallback for keyboard / AT
                users when the React-driven hover tooltip isn't reachable. */}
            <line
              x1={x}
              x2={x}
              y1={yTop}
              y2={yBottom}
              stroke="transparent"
              strokeWidth={haloWidth}
              style={{ pointerEvents: "stroke" }}
            >
              <title>{a11yLabel}</title>
            </line>
            {/* visible marker */}
            <line
              x1={x}
              x2={x}
              y1={yTop}
              y2={yBottom}
              stroke={color}
              strokeWidth={isHovered ? hoverStroke : baseStroke}
              strokeDasharray={isHovered ? undefined : dash}
              opacity={isHovered ? 1 : opacity}
              style={{ pointerEvents: "none" }}
            />
            <circle
              cx={x}
              cy={yTop}
              r={isHovered ? hoverDotR : dotR}
              fill={color}
              opacity={isHovered ? 1 : opacity}
              style={{ pointerEvents: "none" }}
            />
          </g>
        );
      })}
      {(() => {
        if (hoveredIdx === null) return null;
        const hovered = events[hoveredIdx];
        if (!hovered) return null;
        const hx = xFor(hovered.date);
        if (hx == null) return null;
        return (
          <Tooltip
            event={hovered}
            x={hx}
            yTop={yTop}
            variant={variant}
            chartWidth={chartWidth}
          />
        );
      })()}
    </g>
  );
}

function Tooltip({
  event,
  x,
  yTop,
  variant,
  chartWidth,
}: {
  event: TimelineEvent;
  x: number;
  yTop: number;
  variant: Variant;
  chartWidth: number;
}) {
  const w = TOOLTIP_W[variant];
  const h = TOOLTIP_H[variant];
  // Clamp tooltip x so it never escapes chart bounds; arrow centred on marker.
  const tx = Math.max(2, Math.min(chartWidth - w - 2, x - w / 2));
  // Place ABOVE the chart (above yTop) — parent SVG must have overflow visible.
  const ty = yTop - h - 8;
  const accent = event.partyCode
    ? partyColor(event.partyCode)
    : "var(--muted-foreground)";
  return (
    <foreignObject
      x={tx}
      y={ty}
      width={w}
      height={h}
      style={{ pointerEvents: "none", overflow: "visible" }}
    >
      <div
        style={{
          background: "var(--background)",
          border: "1px solid var(--foreground)",
          borderLeft: `3px solid ${accent}`,
          padding: variant === "sparkline" ? "4px 7px" : "6px 9px",
          fontSize: variant === "sparkline" ? 10.5 : 11.5,
          lineHeight: 1.35,
          fontFamily: "system-ui, sans-serif",
          color: "var(--foreground)",
          boxShadow: "2px 2px 0 var(--rule, var(--border))",
          height: "100%",
          boxSizing: "border-box",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: variant === "sparkline" ? 8.5 : 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {event.date}
        </div>
        <div style={{ fontWeight: 600, color: "var(--foreground)" }}>
          {event.title}
        </div>
        {event.description && (
          <div
            style={{
              color: "var(--muted-foreground)",
              fontSize: variant === "sparkline" ? 9.5 : 10.5,
            }}
          >
            {event.description}
          </div>
        )}
      </div>
    </foreignObject>
  );
}
