"use client";

import { useEffect, useState } from "react";
import type { NextSittingInfo } from "@/lib/events-types";

// Estimated dates — Polish constitutional cycles, exact dates set ~90 days
// before by Marszałek. Update when announced.
//  · 10th-term Sejm convened 2023-11-13 → 4-year term ends Nov 2027
//  · Presidential inauguration 2025-08-06 → 5-year term, next 2030
const PARLIAMENTARY_TARGET = new Date("2027-11-07T08:00:00+01:00");
const PRESIDENTIAL_TARGET = new Date("2030-05-19T08:00:00+02:00");

const MS_DAY = 86_400_000;

// Whole-day diff anchored at Europe/Warsaw midnight — avoids "off-by-one"
// across DST/timezone boundaries when the user sits in a non-Warsaw locale.
function daysUntil(target: Date, now: number): number {
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" });
  const todayISO = fmt.format(new Date(now));
  const targetISO = fmt.format(target);
  const a = Date.parse(`${todayISO}T00:00:00Z`);
  const b = Date.parse(`${targetISO}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / MS_DAY));
}

function daysUntilISO(iso: string, now: number): number {
  const todayISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date(now));
  const a = Date.parse(`${todayISO}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  return Math.round((b - a) / MS_DAY);
}

function fmtCount(n: number): string {
  // pl-PL emits NBSP (U+00A0) or narrow NBSP (U+202F) as the thousand
  // separator depending on ICU build. Normalize all space-likes to
  // NBSP so the value never wraps mid-number.
  return n.toLocaleString("pl-PL").replace(/[\s  ]/g, " ");
}

// Polish noun agreement: 1 dzień / 2–4 dni / 5+ dni / 22 dni / 23 dni…
// Pattern: ends in 2/3/4 but not 12/13/14 → "dni" plural form is still "dni"
// in modern Polish for the countdown context. We just need "dzień" vs "dni".
function daysWord(n: number): string {
  return n === 1 ? "dzień" : "dni";
}

const MONTHS_PL = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

function parseISODate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  return { y, m, d };
}

// "28–30 kwietnia" or "30 kwietnia – 2 maja" or "5 maja" (single day)
function fmtSittingRange(firstISO: string, lastISO: string): string {
  if (!firstISO) return "";
  const a = parseISODate(firstISO);
  if (!lastISO || firstISO === lastISO) {
    return `${a.d} ${MONTHS_PL[a.m - 1]}`;
  }
  const b = parseISODate(lastISO);
  if (a.m === b.m) return `${a.d}–${b.d} ${MONTHS_PL[a.m - 1]}`;
  return `${a.d} ${MONTHS_PL[a.m - 1]} – ${b.d} ${MONTHS_PL[b.m - 1]}`;
}

type ItemProps = {
  label: string;
  value: string;
  suffix?: string;
  delay: number;
  accent?: boolean;
};

function Item({ label, value, suffix, delay, accent }: ItemProps) {
  return (
    <div
      className="ec-item flex items-baseline gap-2"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="font-sans text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
        {label}
      </span>
      <span
        className={
          "font-serif text-[16px] md:text-[17px] tabular-nums leading-none " +
          (accent ? "text-destructive" : "text-foreground")
        }
      >
        {value}
      </span>
      {suffix && (
        <span className="font-sans text-[10.5px] italic text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function ElectionCountdown({
  nextSitting,
}: {
  nextSitting: NextSittingInfo | null;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    // Update once per minute — days-precision countdown doesn't need
    // sub-second ticking and per-second updates were the source of the
    // visible jitter on the previous version.
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Pre-hydration: reserve approximate height so layout doesn't jump in.
  if (now === null) {
    return <div aria-hidden className="h-[44px] md:h-[44px]" />;
  }

  const parlDays = daysUntil(PARLIAMENTARY_TARGET, now);
  const presDays = daysUntil(PRESIDENTIAL_TARGET, now);

  // Sitting: "trwają (28–30 maja)" if active, else "za 12 dni · 26 maja",
  // else fall through (no scheduled sitting in the index).
  let sittingItem: React.ReactNode = null;
  if (nextSitting) {
    const range = fmtSittingRange(nextSitting.firstDate, nextSitting.lastDate);
    if (nextSitting.isActive) {
      sittingItem = (
        <Item
          label="Obrady"
          value="trwają"
          suffix={range}
          delay={360}
          accent
        />
      );
    } else {
      const d = daysUntilISO(nextSitting.firstDate, now);
      const valueText = d === 0 ? "dziś" : `za ${fmtCount(d)} ${daysWord(d)}`;
      sittingItem = (
        <Item
          label="Obrady"
          value={valueText}
          suffix={range}
          delay={360}
        />
      );
    }
  }

  return (
    <section
      aria-label="Licznik do wyborów i najbliższych obrad"
      className="px-4 md:px-8 lg:px-14 border-b border-rule"
    >
      <div className="max-w-[1100px] mx-auto py-2.5 md:py-3 flex items-center gap-x-6 gap-y-1.5 flex-wrap">
        <div
          className="ec-item flex items-center gap-2 font-sans text-[10px] tracking-[0.2em] uppercase text-destructive"
          style={{ animationDelay: "0ms" }}
        >
          <span aria-hidden className="ec-pulse inline-block size-1.5 rounded-full bg-destructive" />
          do wyborów
        </div>

        <Item
          label="Parlamentarne"
          value={fmtCount(parlDays)}
          suffix={daysWord(parlDays)}
          delay={120}
        />
        <span aria-hidden className="text-border hidden md:inline">·</span>
        <Item
          label="Prezydenckie"
          value={fmtCount(presDays)}
          suffix={daysWord(presDays)}
          delay={240}
        />

        {sittingItem && (
          <>
            <span aria-hidden className="text-border hidden md:inline">·</span>
            {sittingItem}
          </>
        )}
      </div>

      <style>{`
        @keyframes ec-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ec-pulse {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1; }
        }
        .ec-item {
          opacity: 0;
          animation: ec-fade 700ms ease-out forwards;
        }
        .ec-pulse {
          animation: ec-pulse 2.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ec-item, .ec-pulse { animation: none; opacity: 1; }
        }
      `}</style>
    </section>
  );
}
