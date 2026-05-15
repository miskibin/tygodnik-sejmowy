// "Twoje sprawy" — topic rail (11 categories from lib/topics.ts) on the
// left; selected topic's punkty on the right. Personalisation entry point.
// Not sticky — that caused empty-tail layouts in the inspiration.

"use client";

import { useState } from "react";
import { TOPICS, type TopicId } from "@/lib/topics";
import { MOCK, type AgendaPoint } from "../data";
import { Kicker, SectionHead } from "./SectionHead";
import { verdictInk } from "../tokens";

function topicsAggregate(): Record<TopicId, AgendaPoint[]> {
  const out: Record<TopicId, AgendaPoint[]> = Object.fromEntries(
    (Object.keys(TOPICS) as TopicId[]).map((t) => [t, []]),
  ) as Record<TopicId, AgendaPoint[]>;
  for (const p of MOCK.punkty) {
    for (const t of p.topics) {
      out[t]?.push(p);
    }
  }
  return out;
}

export function YourTopics() {
  const agg = topicsAggregate();
  const firstWithContent = (Object.keys(TOPICS) as TopicId[]).find(
    (t) => agg[t].length > 0,
  )!;
  const [selected, setSelected] = useState<TopicId>(firstWithContent);
  const current = agg[selected];

  return (
    <section className="border-b border-border">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-14 md:py-16">
        <SectionHead
          num={6}
          title="Twoje sprawy"
          sub="11 kategorii tematycznych. Kliknij — zobacz, których punktów dotyczy i co się tam działo."
          anchor="sprawy"
        />

        <div className="grid gap-8 md:gap-12 md:grid-cols-[300px_1fr]">
          {/* Topic rail */}
          <div>
            <div className="flex flex-col">
              {(Object.keys(TOPICS) as TopicId[]).map((id) => {
                const meta = TOPICS[id];
                const punkty = agg[id];
                const on = id === selected;
                const has = punkty.length > 0;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!has}
                    onClick={() => setSelected(id)}
                    className="flex items-baseline justify-between transition-colors text-left"
                    style={{
                      cursor: has ? "pointer" : "default",
                      padding: "13px 14px",
                      borderTop: "1px solid var(--border)",
                      borderLeft: on
                        ? "3px solid var(--destructive-deep)"
                        : "3px solid transparent",
                      background: on ? "var(--background)" : "transparent",
                      color: !has
                        ? "var(--border)"
                        : on
                          ? "var(--foreground)"
                          : "var(--secondary-foreground)",
                    }}
                    aria-pressed={on}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className="font-serif"
                        style={{
                          fontSize: 18,
                          color: on
                            ? "var(--destructive-deep)"
                            : "var(--muted-foreground)",
                        }}
                        aria-hidden
                      >
                        {meta.icon}
                      </span>
                      <span className="font-sans" style={{ fontSize: 14 }}>
                        {meta.label}
                      </span>
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 11,
                        color: !has
                          ? "var(--border)"
                          : "var(--muted-foreground)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {has ? `${punkty.length}` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className="mt-3 pt-3 font-sans italic"
              style={{
                borderTop: "1px solid var(--border)",
                fontSize: 12,
                color: "var(--muted-foreground)",
                lineHeight: 1.45,
              }}
            >
              Tematy tagujemy automatycznie z wypowiedzi (taksonomia 11-elementowa). Punkt może dotyczyć kilku spraw naraz.
            </div>
          </div>

          {/* Content */}
          <div style={{ minHeight: 360 }}>
            <div className="flex items-baseline gap-4 mb-5 flex-wrap">
              <span
                className="font-serif"
                style={{
                  fontSize: 56,
                  lineHeight: 0.9,
                  color: "var(--destructive-deep)",
                }}
                aria-hidden
              >
                {TOPICS[selected].icon}
              </span>
              <h3
                className="font-serif font-medium m-0"
                style={{
                  fontSize: 32,
                  letterSpacing: "-0.018em",
                  color: "var(--foreground)",
                }}
              >
                {TOPICS[selected].label}.
              </h3>
              <span
                className="font-mono uppercase ml-auto"
                style={{
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                  letterSpacing: "0.12em",
                }}
              >
                {current.length} {current.length === 1 ? "punkt" : "punktów"} dziś
              </span>
            </div>

            <div className="flex flex-col gap-4">
              {current.map((p) => (
                <div
                  key={p.ord}
                  className="grid gap-4 md:gap-5"
                  style={{
                    gridTemplateColumns: "60px 1fr",
                    padding: "18px 20px",
                    background: "var(--secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div
                      className="font-serif italic font-medium"
                      style={{
                        fontSize: 34,
                        lineHeight: 0.9,
                        color: "var(--foreground)",
                      }}
                    >
                      {p.ord}
                    </div>
                    <div
                      className="font-mono mt-1.5"
                      style={{
                        fontSize: 9.5,
                        color: "var(--muted-foreground)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {p.timeStart}
                    </div>
                  </div>
                  <div>
                    <h4
                      className="font-serif font-medium m-0 mb-1.5"
                      style={{
                        fontSize: 18,
                        lineHeight: 1.22,
                        color: "var(--foreground)",
                        textWrap: "balance",
                      }}
                    >
                      {p.shortTitle}.
                    </h4>
                    <p
                      className="font-serif m-0 mb-2.5"
                      style={{
                        fontSize: 13.5,
                        lineHeight: 1.5,
                        color: "var(--secondary-foreground)",
                      }}
                    >
                      {p.plainSummary}
                    </p>
                    <div
                      className="flex items-center gap-x-4 gap-y-1 flex-wrap font-mono uppercase"
                      style={{
                        fontSize: 10,
                        color: "var(--muted-foreground)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {p.stages.map((e) => (
                        <span
                          key={e}
                          style={{ color: "var(--foreground)", fontWeight: 600 }}
                        >
                          {e}
                        </span>
                      ))}
                      {p.vote && (
                        <span
                          style={{
                            color: verdictInk(p.vote.result),
                            fontWeight: 700,
                          }}
                        >
                          ● {p.vote.result}
                        </span>
                      )}
                      <span
                        className="ml-auto"
                        style={{ color: "var(--secondary-foreground)" }}
                      >
                        {p.stats.wypowiedzi} wypow. · {p.stats.mowcy} mówców
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {current.length === 0 && (
                <p
                  className="font-serif italic"
                  style={{
                    fontSize: 14,
                    color: "var(--muted-foreground)",
                  }}
                >
                  Brak punktów dotyczących tej sprawy w tym posiedzeniu.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
