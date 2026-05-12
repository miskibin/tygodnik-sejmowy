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

export function EventMarkers({
  events,
  xFor,
  yTop,
  yBottom,
  variant,
}: {
  events: TimelineEvent[];
  xFor: (isoDate: string) => number | null;
  yTop: number;
  yBottom: number;
  variant: Variant;
}) {
  if (events.length === 0) return null;
  const isSpark = variant === "sparkline";
  const stroke = isSpark ? 0.9 : 1;
  const dotR = isSpark ? 1.6 : 2.4;

  return (
    <g aria-hidden="true">
      {events.map((e, i) => {
        const x = xFor(e.date);
        if (x == null) return null;
        const color = e.partyCode
          ? partyColor(e.partyCode)
          : "var(--muted-foreground)";
        const opacity = e.partyCode ? 0.7 : 0.55;
        const dash = DASH_BY_KIND[e.kind];
        const tooltip = e.description ? `${e.title} — ${e.description}` : e.title;
        return (
          <g key={`${e.date}-${i}`}>
            <line
              x1={x}
              x2={x}
              y1={yTop}
              y2={yBottom}
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              opacity={opacity}
            >
              <title>{tooltip}</title>
            </line>
            <circle cx={x} cy={yTop} r={dotR} fill={color} opacity={opacity}>
              <title>{tooltip}</title>
            </circle>
            {!isSpark && (
              <text
                x={x + 3}
                y={yTop - 2}
                fontFamily="ui-monospace"
                fontSize="9"
                fill={color}
                opacity={opacity}
                style={{ pointerEvents: "none" }}
              >
                {e.title}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
