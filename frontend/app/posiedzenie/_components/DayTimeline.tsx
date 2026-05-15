// Hourly horizontal timeline. Each agenda point = a block; block height =
// number of speakers; block fill colour = dominant tone.

import type { SittingView, Tone } from "./types";
import { TONE_INK, TONE_LABEL } from "./tokens";
import { Kicker, SectionHead } from "./SectionHead";

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function sumTones(t: Partial<Record<Tone, number>>): number {
  return Object.values(t).reduce<number>((s, v) => s + (v ?? 0), 0);
}

function dominantTone(t: Partial<Record<Tone, number>>): Tone | null {
  let best: Tone | null = null;
  let bestN = 0;
  for (const [k, v] of Object.entries(t)) {
    if ((v ?? 0) > bestN) {
      bestN = v ?? 0;
      best = k as Tone;
    }
  }
  return best;
}

const TONES_IN_LEGEND: Tone[] = [
  "argumentowy",
  "techniczny",
  "emocjonalny",
  "apel",
  "konfrontacyjny",
  "neutralny",
];

export function DayTimeline({
  data,
  activeDay,
}: {
  data: SittingView;
  activeDay: number;
}) {
  const day = data.days[activeDay];
  if (!day) return null;
  const points = data.agendaPoints.filter((p) => p.date === day.date);
  if (points.length === 0) {
    return null;
  }
  const startMin = 9 * 60;
  const endMin = 22 * 60;
  const span = endMin - startMin;

  const liveMin = day.status === "live" && data.liveAt
    ? timeToMin(data.liveAt) - startMin
    : null;
  const toPct = (t: string) => ((timeToMin(t) - startMin) / span) * 100;

  const hours: number[] = [];
  for (let h = 9; h <= 22; h++) hours.push(h);

  return (
    <section className="border-b border-border">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-14 md:py-16">
        <SectionHead
          num={3}
          title="Oś dnia"
          sub="Każdy punkt jako blok. Wysokość bloku — liczba mówców. Kolor — dominująca tonacja wypowiedzi."
          anchor="os"
        />

        {liveMin !== null && (
          <div className="relative mb-2" style={{ height: 18 }}>
            <span
              className="absolute font-mono uppercase whitespace-nowrap"
              style={{
                left: `${(liveMin / span) * 100}%`,
                transform: "translateX(-50%)",
                fontSize: 10,
                color: "var(--destructive-deep)",
                letterSpacing: "0.14em",
              }}
            >
              ▼ {data.liveAt} na żywo
            </span>
          </div>
        )}

        <div className="relative mb-1" style={{ height: 18 }}>
          {hours.map((h) => (
            <span
              key={h}
              className="absolute font-mono"
              style={{
                left: `${((h * 60 - startMin) / span) * 100}%`,
                transform: "translateX(-50%)",
                fontSize: 10,
                color: "var(--muted-foreground)",
                letterSpacing: "0.08em",
              }}
            >
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        <div
          className="relative"
          style={{
            height: 200,
            background: "var(--secondary)",
            border: "1px solid var(--border)",
          }}
        >
          {hours.map((h) => (
            <div
              key={h}
              className="absolute top-0 bottom-0"
              style={{
                left: `${((h * 60 - startMin) / span) * 100}%`,
                width: 1,
                background: "var(--border)",
                opacity: 0.7,
              }}
              aria-hidden
            />
          ))}

          {liveMin !== null && (
            <div
              className="absolute"
              style={{
                top: -6,
                bottom: -6,
                left: `${(liveMin / span) * 100}%`,
                width: 2,
                background: "var(--destructive)",
                zIndex: 5,
              }}
              aria-hidden
            />
          )}

          {points.map((p) => {
            const left = toPct(p.timeStart);
            const widthPct = (p.durMin / span) * 100;
            const tones = sumTones(p.tones);
            void tones;
            const dom = dominantTone(p.tones);
            const fill = p.planned
              ? "var(--muted)"
              : dom
                ? TONE_INK[dom]
                : "var(--muted-foreground)";
            const height = Math.max(38, Math.min(170, p.stats.speakers * 5 + 28));
            const narrow = widthPct < 4.2;
            const voteLeftPct = p.vote && p.durMin > 0
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    ((timeToMin(p.vote.time) - timeToMin(p.timeStart)) /
                      p.durMin) *
                      100,
                  ),
                )
              : 0;
            return (
              <div
                key={p.ord}
                className="absolute overflow-hidden"
                style={{
                  bottom: 8,
                  left: `${left}%`,
                  width: `${widthPct}%`,
                  height,
                  background: fill,
                  color: p.planned ? "var(--foreground)" : "var(--background)",
                  padding: "6px 8px 5px",
                  borderRight: "1px solid var(--background)",
                  opacity: p.planned ? 0.45 : 0.94,
                  cursor: "pointer",
                }}
                title={`Pkt ${p.ord} · ${p.shortTitle} · ${p.timeStart}–${p.timeEnd}${dom ? ` · ${TONE_LABEL[dom]}` : ""}`}
              >
                <div
                  className="font-mono uppercase"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.08em",
                    opacity: 0.85,
                  }}
                >
                  PKT {p.ord}
                </div>
                {!narrow && (
                  <div
                    className="font-sans"
                    style={{
                      fontWeight: 500,
                      fontSize: 10,
                      marginTop: 2,
                      lineHeight: 1.18,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {p.shortTitle}
                  </div>
                )}
                {p.vote && (
                  <div
                    className="absolute"
                    style={{
                      top: -10,
                      left: `${voteLeftPct}%`,
                      width: 2,
                      height: 12,
                      background: "var(--destructive-deep)",
                      transform: "translateX(-50%)",
                    }}
                    title={`głosowanie ${p.vote.time}`}
                    aria-hidden
                  />
                )}
              </div>
            );
          })}
        </div>

        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 font-sans"
          style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}
        >
          <div className="flex flex-wrap gap-4">
            {TONES_IN_LEGEND.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span
                  style={{
                    width: 14,
                    height: 10,
                    background: TONE_INK[t],
                    display: "inline-block",
                  }}
                  aria-hidden
                />
                {TONE_LABEL[t]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span
                style={{
                  width: 2,
                  height: 12,
                  background: "var(--destructive-deep)",
                  display: "inline-block",
                }}
                aria-hidden
              />
              głosowanie
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                style={{
                  width: 14,
                  height: 10,
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  display: "inline-block",
                }}
                aria-hidden
              />
              zaplanowane
            </span>
          </div>
          <Kicker>najazd kursora pokaże tytuł i tonację</Kicker>
        </div>
      </div>
    </section>
  );
}
