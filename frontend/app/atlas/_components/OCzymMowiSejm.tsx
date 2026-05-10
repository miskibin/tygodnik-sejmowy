"use client";

import { useState } from "react";
import { SectionHead } from "./SectionHead";
import type { TopicTrend } from "@/lib/db/atlas";
import type { TopicId } from "@/lib/atlas/constants";

const TOPIC_COLOR: Record<TopicId, string> = {
  mieszkania: "#8a2a1f",
  zdrowie: "#3d6b3d",
  energetyka: "#8a6a1a",
  obrona: "#1f2937",
  rolnictwo: "#6b8e23",
  edukacja: "#6b21a8",
  sprawiedliwosc: "#9f1239",
  podatki: "#1e3a8a",
  inne: "#cdc4b1",
};

const TOPIC_LABEL: Record<TopicId, string> = {
  mieszkania: "mieszkania",
  zdrowie: "zdrowie",
  energetyka: "energetyka",
  obrona: "obrona",
  rolnictwo: "rolnictwo",
  edukacja: "edukacja",
  sprawiedliwosc: "sprawiedliwość",
  podatki: "podatki",
  inne: "inne",
};

const TERM_START_QUARTER = "2023-Q4";

type Hover = { bucket: string; topic: TopicId; share: number; total: number; count: number } | null;

export function OCzymMowiSejm({ data }: { data: TopicTrend }) {
  const [highlight, setHighlight] = useState<TopicId | null>(null);
  const [hover, setHover] = useState<Hover>(null);

  if (data.buckets.length === 0) {
    return (
      <section>
        <SectionHead num="06" kicker="Agenda" title="O czym mówi Sejm" sub="Brak druków z otagowanym tematem w bazie." />
      </section>
    );
  }

  const W = 920;
  const H = 360;
  const colW = W / data.buckets.length;
  const totalPrints = data.totalsPerBucket.reduce((s, v) => s + v, 0);
  const electionLineX = (() => {
    const idx = data.buckets.indexOf(TERM_START_QUARTER);
    return idx >= 0 ? idx * colW + colW * 0.5 : null;
  })();

  const firstShares = data.shares[0] ?? [];
  const lastShares = data.shares[data.shares.length - 1] ?? [];
  type Delta = { topic: TopicId; from: number; to: number; delta: number };
  const deltas: Delta[] = data.topics.map((t, i) => ({
    topic: t,
    from: firstShares[i] ?? 0,
    to: lastShares[i] ?? 0,
    delta: (lastShares[i] ?? 0) - (firstShares[i] ?? 0),
  }));
  const biggestRise = [...deltas].sort((a, b) => b.delta - a.delta)[0];
  const biggestFall = [...deltas].sort((a, b) => a.delta - b.delta)[0];

  return (
    <section>
      <SectionHead
        num="06"
        kicker="Agenda"
        title="O czym mówi Sejm"
        sub={`Top tematy projektów ustaw w czasie. Próba: ${totalPrints.toLocaleString("pl-PL")} druków z ${data.buckets.length} kwartałów (X kadencja).`}
      />
      <div
        className="border border-border p-6 relative"
        style={{ background: "var(--muted)" }}
      >
        <svg viewBox={`0 0 ${W} ${H + 50}`} className="w-full block">
          {data.buckets.map((b, i) => {
            let acc = 0;
            return (data.topics as readonly TopicId[]).map((t, ti) => {
              const v = data.shares[i][ti] ?? 0;
              if (v <= 0) return null;
              const h = v * H;
              const y = acc;
              acc += h;
              const dim = highlight !== null && highlight !== t;
              const focused = highlight === t;
              return (
                <rect
                  key={`${b}-${t}`}
                  x={i * colW + 4}
                  y={y}
                  width={colW - 8}
                  height={Math.max(0, h - 1)}
                  fill={TOPIC_COLOR[t]}
                  opacity={dim ? 0.18 : focused ? 1 : 0.92}
                  onMouseEnter={() => setHover({ bucket: b, topic: t, share: v, total: data.totalsPerBucket[i], count: Math.round(v * data.totalsPerBucket[i]) })}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer", transition: "opacity 0.18s" }}
                >
                  <title>{TOPIC_LABEL[t]} {b}: {Math.round(v * 100)}%</title>
                </rect>
              );
            });
          })}
          {data.buckets.map((b, i) => (
            <text
              key={b}
              x={i * colW + colW / 2}
              y={H + 18}
              textAnchor="middle"
              fontFamily="ui-monospace"
              fontSize="10"
              fill="var(--muted-foreground)"
              letterSpacing="0.06em"
            >
              {b.replace("-", " ")}
            </text>
          ))}
          {data.buckets.map((b, i) => (
            <text
              key={`n-${b}`}
              x={i * colW + colW / 2}
              y={H + 34}
              textAnchor="middle"
              fontFamily="ui-monospace"
              fontSize="9"
              fill="var(--border)"
            >
              n={data.totalsPerBucket[i].toFixed(0)}
            </text>
          ))}
          {electionLineX !== null && (
            <>
              <line
                x1={electionLineX}
                y1={0}
                x2={electionLineX}
                y2={H}
                stroke="var(--foreground)"
                strokeWidth="1"
                strokeDasharray="3,3"
                opacity="0.5"
              />
              <text
                x={electionLineX + 6}
                y={12}
                fontFamily="ui-monospace"
                fontSize="9"
                fill="var(--foreground)"
                letterSpacing="0.1em"
              >
                START X KADENCJI
              </text>
            </>
          )}
        </svg>

        {hover && (
          <div
            role="status"
            aria-live="polite"
            className="absolute top-3 right-6 bg-background border border-rule p-3 font-sans text-[12px] min-w-[200px] shadow-md"
          >
            <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase mb-1.5">
              {hover.bucket.replace("-", " ")}
            </div>
            <div className="font-serif text-[16px] text-foreground leading-tight mb-2 inline-flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TOPIC_COLOR[hover.topic] }} />
              {TOPIC_LABEL[hover.topic]}
            </div>
            <div className="grid grid-cols-2 gap-y-1 font-mono text-[11px]">
              <span className="text-muted-foreground">udział</span>
              <span className="text-right text-foreground font-semibold">{Math.round(hover.share * 100)}%</span>
              <span className="text-muted-foreground">druków</span>
              <span className="text-right text-foreground">~{hover.count} z {hover.total}</span>
            </div>
            <a
              href={`/szukaj?scope=print&q=${encodeURIComponent(TOPIC_LABEL[hover.topic])}`}
              className="block mt-2.5 pt-2 border-t border-dotted border-border font-sans text-[11px] text-destructive underline decoration-dotted underline-offset-4"
            >
              ↗ druki o tym temacie
            </a>
          </div>
        )}

        <div className="flex flex-wrap gap-3.5 mt-3 font-sans text-xs text-secondary-foreground">
          {data.topics.map((t) => {
            const isOn = highlight === t;
            const dim = highlight !== null && !isOn;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={isOn}
                onClick={() => setHighlight(isOn ? null : t)}
                onMouseEnter={() => setHighlight(t)}
                onMouseLeave={() => setHighlight(null)}
                className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-opacity cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
                style={{ opacity: dim ? 0.4 : 1 }}
              >
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: TOPIC_COLOR[t] }}
                />
                {TOPIC_LABEL[t]}
              </button>
            );
          })}
        </div>
      </div>
      {biggestRise && biggestFall && biggestRise.topic !== biggestFall.topic && (
        <p className="mt-4 font-serif text-[15px] leading-[1.6] text-secondary-foreground">
          Linia kropkowana — początek X kadencji.{" "}
          <strong className="text-foreground">{TOPIC_LABEL[biggestFall.topic]}</strong>
          {" "}spadły z&nbsp;{Math.round(biggestFall.from * 100)}% do&nbsp;{Math.round(biggestFall.to * 100)}%.{" "}
          <strong className="text-foreground">{TOPIC_LABEL[biggestRise.topic]}</strong>
          {" "}wzrosła z&nbsp;{Math.round(biggestRise.from * 100)}% do&nbsp;{Math.round(biggestRise.to * 100)}%.
        </p>
      )}
    </section>
  );
}
