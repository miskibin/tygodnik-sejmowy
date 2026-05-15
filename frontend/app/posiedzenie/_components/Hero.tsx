// Hero: full sitting headline + 4 KPI tiles + day-tabs row.

import type { Day, SittingView } from "./types";
import { Kicker } from "./SectionHead";

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-right">
      <div
        className="font-serif font-medium text-foreground"
        style={{ fontSize: 36, lineHeight: 0.95, letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      <div className="font-sans text-[11px] text-muted-foreground mt-1">
        {label}
      </div>
    </div>
  );
}

function DayTab({
  day,
  active,
  onSelect,
}: {
  day: Day;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="cursor-pointer text-left transition-colors flex-1 min-w-0"
      style={{
        padding: "16px 24px 18px 0",
        borderBottom: active
          ? "3px solid var(--destructive-deep)"
          : "3px solid transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
      }}
      aria-pressed={active}
    >
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className="font-serif font-medium"
          style={{ fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1 }}
        >
          Dzień {day.idx + 1}
        </span>
        {day.status === "live" && (
          <span
            className="font-mono uppercase inline-flex items-center gap-1.5"
            style={{
              fontSize: 10,
              color: "var(--destructive-deep)",
              letterSpacing: "0.14em",
            }}
          >
            <span
              className="inline-block rounded-full"
              style={{ width: 6, height: 6, background: "var(--destructive)" }}
              aria-hidden
            />
            trwa
          </span>
        )}
        {day.status === "planned" && (
          <span
            className="font-mono uppercase"
            style={{
              fontSize: 10,
              color: "var(--muted-foreground)",
              letterSpacing: "0.14em",
            }}
          >
            ○ zaplanowany
          </span>
        )}
      </div>
      <div
        className="font-mono uppercase mt-1.5"
        style={{ fontSize: 11, letterSpacing: "0.08em" }}
      >
        {day.weekday} · {day.short} · {day.open ?? "—"}—{day.close ?? "…"}
      </div>
      <div className="font-sans flex gap-4 mt-2" style={{ fontSize: 11.5 }}>
        <span>
          <b className={active ? "text-foreground" : "text-secondary-foreground"}>
            {day.stats.points}
          </b>{" "}
          pkt
        </span>
        <span>
          <b className={active ? "text-foreground" : "text-secondary-foreground"}>
            {day.stats.votes}
          </b>{" "}
          głos.
        </span>
        <span>
          <b className={active ? "text-foreground" : "text-secondary-foreground"}>
            {day.stats.statements}
          </b>{" "}
          wypow.
        </span>
      </div>
    </button>
  );
}

export function Hero({
  data,
  activeDay,
  setActiveDay,
}: {
  data: SittingView;
  activeDay: number;
  setActiveDay: (i: number) => void;
}) {
  return (
    <section className="border-b border-border">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-12 md:py-16">
        <Kicker className="mb-4">
          X kadencja Sejmu &nbsp;·&nbsp; {data.dates.length}-dniowe posiedzenie
        </Kicker>

        <div className="grid gap-x-14 gap-y-10 md:grid-cols-[1.5fr_1fr] items-end">
          <h1
            className="font-serif font-medium m-0"
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4rem)",
              lineHeight: 1,
              letterSpacing: "-0.026em",
              color: "var(--foreground)",
              textWrap: "balance",
            }}
          >
            <span
              className="italic"
              style={{ color: "var(--destructive-deep)" }}
            >
              {data.number}.
            </span>{" "}
            posiedzenie
            <br />
            Sejmu
            <span style={{ color: "var(--muted-foreground)" }}>.</span>
          </h1>

          <div className="md:justify-self-end">
            <Kicker className="mb-2">
              łącznie za {data.days.length}{" "}
              {data.days.length === 1 ? "dzień" : "dni"}
            </Kicker>
            <div className="flex gap-6 md:gap-8 justify-end items-baseline flex-wrap">
              <StatTile value={data.totals.points} label="punktów" />
              <StatTile value={data.totals.statements} label="wypowiedzi" />
              <StatTile value={data.totals.votes} label="głosowań" />
              <StatTile value={data.totals.speakers} label="mówców" />
            </div>
          </div>
        </div>

        <div
          className="mt-10 flex gap-6 md:gap-10 overflow-x-auto"
          style={{ borderBottom: "2px solid var(--rule)" }}
        >
          {data.days.map((d, i) => (
            <DayTab
              key={d.idx}
              day={d}
              active={i === activeDay}
              onSelect={() => setActiveDay(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
