// "Co Sejm dziś zrobił" — only the punkty with a decisive vote.
// 3-column grid of decision cards. No hard sticker shadow (it was
// clipping outside the container on the inspiration); subtle border +
// hover translate is enough.

import { MOCK, type AgendaPoint, type Club, type Vote } from "../data";
import { Kicker, SectionHead } from "./SectionHead";
import { verdictInk } from "../tokens";
import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";

function DecisionCard({ p }: { p: AgendaPoint }) {
  if (!p.vote) return null;
  const v = p.vote;
  const accent = verdictInk(v.result, v.motionPolarity);

  return (
    <a
      href={`#punkt-${p.ord}`}
      className="block no-underline text-inherit hover:-translate-y-0.5 transition-transform"
      style={{
        background: "var(--background)",
        border: "1px solid var(--border)",
        padding: "22px 24px 20px",
      }}
    >
      <div className="flex items-baseline justify-between mb-2.5 gap-2 flex-wrap">
        <span
          className="font-mono uppercase"
          style={{
            fontSize: 10,
            color: "var(--muted-foreground)",
            letterSpacing: "0.14em",
          }}
        >
          pkt {p.ord} · {p.timeStart}–{p.timeEnd}
        </span>
        <span
          className="font-mono uppercase"
          style={{
            fontSize: 10,
            color: accent,
            letterSpacing: "0.14em",
            fontWeight: 700,
          }}
        >
          ● {v.time}
        </span>
      </div>

      <div
        className="font-serif italic font-medium"
        style={{
          fontSize: 26,
          color: accent,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          marginBottom: 8,
        }}
      >
        {v.result}
      </div>
      {v.subtitle && (
        <div
          className="font-mono uppercase mb-3"
          style={{
            fontSize: 10,
            color: "var(--muted-foreground)",
            letterSpacing: "0.1em",
          }}
        >
          {v.subtitle}
        </div>
      )}

      <h3
        className="font-serif font-medium m-0 mt-2 mb-2"
        style={{
          fontSize: 19,
          lineHeight: 1.22,
          color: "var(--foreground)",
          textWrap: "balance",
        }}
      >
        {p.shortTitle}.
      </h3>
      <p
        className="font-serif m-0 mb-4"
        style={{
          fontSize: 13.5,
          lineHeight: 1.5,
          color: "var(--secondary-foreground)",
          textWrap: "pretty",
        }}
      >
        {v.plainNote ?? p.plainSummary}
      </p>

      <VoteBar v={v} />
    </a>
  );
}

function VoteBar({ v }: { v: Vote }) {
  return (
    <>
      <div
        className="flex"
        style={{ height: 16, border: "1px solid var(--border)" }}
        aria-hidden
      >
        <div style={{ width: `${(v.za / 460) * 100}%`, background: "var(--success)" }} />
        <div style={{ width: `${(v.przeciw / 460) * 100}%`, background: "var(--destructive)" }} />
        <div
          style={{
            width: `${(v.wstrzym / 460) * 100}%`,
            background: "var(--warning)",
            opacity: 0.85,
          }}
        />
        <div
          style={{
            width: `${(v.nieob / 460) * 100}%`,
            background: "var(--border)",
          }}
        />
      </div>
      <div
        className="mt-1.5 flex justify-between font-mono"
        style={{
          fontSize: 10,
          color: "var(--muted-foreground)",
          letterSpacing: "0.08em",
        }}
      >
        <span>
          <b style={{ color: "var(--success)" }}>ZA {v.za}</b>
        </span>
        <span>
          <b style={{ color: "var(--destructive)" }}>PRZ {v.przeciw}</b>
        </span>
        <span>
          <b style={{ color: "var(--warning)" }}>WS {v.wstrzym}</b>
        </span>
        <span>NB {v.nieob}</span>
      </div>
    </>
  );
}

export function WhatPassed({ activeDay }: { activeDay: number }) {
  const dayDate = MOCK.days[activeDay]?.date;
  // Bounds-check: out-of-range activeDay used to fall through to "all days"
  // because of the `!dayDate ||` short-circuit. Require the day to exist.
  const decisive = dayDate
    ? MOCK.punkty.filter((p) => !!p.vote && p.date === dayDate)
    : [];
  if (decisive.length === 0) {
    return (
      <section
        className="border-b border-border"
        style={{ background: "var(--highlight)", opacity: 0.95 }}
      >
        <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-12">
          <SectionHead
            num={2}
            title="Co Sejm dziś zrobił"
            sub="Tu wpadną tylko punkty z rozstrzygającym głosowaniem. Dla tego dnia jeszcze żadne się nie zamknęło."
            anchor="decyzje"
          />
          <p
            className="font-serif italic"
            style={{
              fontSize: 17,
              color: "var(--secondary-foreground)",
              textWrap: "pretty",
            }}
          >
            Sejm nie podjął jeszcze decyzji w żadnym z punktów tego dnia.
            Wszystkie sprawy są w fazie czytań lub informacji — odpowiednie
            karty pojawią się tutaj automatycznie po pierwszych głosowaniach.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="border-b border-border"
      style={{ background: "var(--highlight)" }}
    >
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-14 md:py-16">
        <SectionHead
          num={2}
          title="Co Sejm dziś zrobił"
          sub="Punkty, w których zapadł rozstrzygający głos. Reszta to dyskusja — to są decyzje."
          anchor="decyzje"
        />

        <div className="grid gap-4 md:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {decisive.map((p) => (
            <DecisionCard key={p.ord} p={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
