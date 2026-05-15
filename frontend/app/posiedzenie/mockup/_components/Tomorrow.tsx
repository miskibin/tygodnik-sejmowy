// "Jutro w Sejmie" — next-day preview. Drops the inspiration's full-bleed
// black panel for a muted warm-paper surface with destructive accents.

import { TOPICS, type TopicId } from "@/lib/topics";
import { MOCK, type PlannedCard } from "../data";
import { Kicker, SectionHead } from "./SectionHead";

function PlanCardTile({ p }: { p: PlannedCard }) {
  return (
    <div
      style={{
        background: "var(--background)",
        padding: "22px 24px",
        borderTop: p.flag
          ? "3px solid var(--destructive-deep)"
          : "1px solid var(--border)",
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: p.flag
          ? "3px solid var(--destructive-deep)"
          : "1px solid var(--border)",
      }}
    >
      <div className="flex items-baseline gap-3 mb-2.5">
        <span
          className="font-serif italic font-medium"
          style={{
            fontSize: 30,
            color: "var(--destructive-deep)",
            lineHeight: 0.9,
          }}
        >
          {p.ord}.
        </span>
        <Kicker>punkt</Kicker>
      </div>
      <h3
        className="font-serif font-medium m-0 mb-2"
        style={{
          fontSize: 19,
          lineHeight: 1.25,
          color: "var(--foreground)",
          textWrap: "balance",
        }}
      >
        {p.title}.
      </h3>
      <p
        className="font-serif italic m-0"
        style={{
          fontSize: 13,
          color: "var(--muted-foreground)",
          lineHeight: 1.45,
        }}
      >
        {p.subtitle}
      </p>
      {p.topic && (
        <div className="mt-3.5">
          <span
            className="font-sans inline-flex items-center gap-1.5 rounded-full"
            style={{
              fontSize: 11,
              color: "var(--secondary-foreground)",
              padding: "3px 10px",
              background: "var(--secondary)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ color: TOPICS[p.topic as TopicId].color }} aria-hidden>
              {TOPICS[p.topic as TopicId].icon}
            </span>
            {TOPICS[p.topic as TopicId].label.toLowerCase()}
          </span>
        </div>
      )}
    </div>
  );
}

export function Tomorrow() {
  const planned = MOCK.jutro;
  return (
    <section className="border-b border-border" style={{ background: "var(--muted)" }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-14 md:py-16">
        <SectionHead
          num={9}
          title="Jutro w Sejmie"
          sub={`${planned.weekday} · 15.05.2026 · od 09:00`}
          anchor="jutro"
        />

        <p
          className="font-serif m-0 mb-9"
          style={{
            fontSize: 22,
            lineHeight: 1.35,
            color: "var(--foreground)",
            maxWidth: 880,
            textWrap: "balance",
          }}
        >
          {planned.headline}
        </p>

        <div className="grid gap-4 md:gap-5 grid-cols-1 md:grid-cols-3">
          {planned.plannedPoints.map((p) => (
            <PlanCardTile key={p.ord} p={p} />
          ))}
        </div>

        <div
          className="mt-10 pt-6 flex justify-between items-baseline flex-wrap gap-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span
            className="font-serif italic"
            style={{
              fontSize: 14,
              color: "var(--muted-foreground)",
              maxWidth: 720,
            }}
          >
            Po piątku 19. posiedzenie zostanie zamknięte. Najbliższe — 20. posiedzenie — planowane w dn. 27–29 maja.
          </span>
          <button
            type="button"
            className="cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              padding: "9px 18px",
              background: "var(--destructive-deep)",
              color: "var(--background)",
              fontSize: 13,
              fontWeight: 500,
              border: "none",
            }}
          >
            ✦ obserwuj posiedzenie 20
          </button>
        </div>
      </div>
    </section>
  );
}
