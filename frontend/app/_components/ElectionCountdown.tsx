"use client";

import { useEffect, useState } from "react";

// Estimated dates — Polish constitutional cycles, exact dates set ~90 days
// before by Marszałek (parl.) / Marszałek Sejmu (pres.). Update when
// announced. References:
//  · 10th-term Sejm convened 2023-11-13 → 4-year term ends Nov 2027
//  · Presidential inauguration 2025-08-06 → 5-year term, next 2030
const PARLIAMENTARY_TARGET = new Date("2027-11-07T08:00:00+01:00");
const PRESIDENTIAL_TARGET = new Date("2030-05-19T08:00:00+02:00");

type Parts = { d: number; h: number; m: number; s: number; total: number };

function diffParts(target: Date, now: number): Parts {
  const total = Math.max(0, target.getTime() - now);
  const s = Math.floor(total / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    total,
  };
}

function fmtDays(n: number): string {
  // 1 466 → with NBSP thousand separator, fits Polish typography
  return n.toLocaleString("pl-PL").replace(/\s/g, " ");
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function CountdownItem({
  label,
  target,
  now,
  delay,
}: {
  label: string;
  target: Date;
  now: number;
  delay: number;
}) {
  const p = diffParts(target, now);
  return (
    <div
      className="ec-item flex items-baseline gap-2.5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="font-sans text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
        {label}
      </span>
      <span className="font-serif text-[17px] md:text-[19px] tabular-nums text-foreground leading-none">
        {fmtDays(p.d)}
      </span>
      <span className="font-sans text-[10.5px] italic text-muted-foreground -ml-1">
        dni
      </span>
      <span
        key={`${p.h}:${p.m}:${p.s}`}
        className="ec-tick font-mono text-[10.5px] tabular-nums text-secondary-foreground/70 hidden sm:inline"
      >
        {pad(p.h)}:{pad(p.m)}:{pad(p.s)}
      </span>
    </div>
  );
}

export function ElectionCountdown() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Reserve layout pre-hydration; render nothing until mounted to avoid SSR
  // mismatch on the live time.
  if (now === null) {
    return <div aria-hidden className="h-[44px] md:h-[40px]" />;
  }

  return (
    <section
      aria-label="Licznik do wyborów"
      className="px-4 md:px-8 lg:px-14 border-b border-rule"
    >
      <div className="max-w-[1100px] mx-auto py-2.5 md:py-3 flex items-center gap-x-6 gap-y-1.5 flex-wrap">
        <div
          className="ec-lead flex items-center gap-2 font-sans text-[10px] tracking-[0.2em] uppercase text-destructive"
          style={{ animationDelay: "0ms" }}
        >
          <span aria-hidden className="ec-pulse inline-block size-1.5 rounded-full bg-destructive" />
          do wyborów
        </div>
        <CountdownItem label="Parlamentarne" target={PARLIAMENTARY_TARGET} now={now} delay={120} />
        <span aria-hidden className="text-border hidden md:inline">·</span>
        <CountdownItem label="Prezydenckie" target={PRESIDENTIAL_TARGET} now={now} delay={240} />
      </div>

      <style>{`
        @keyframes ec-rise {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ec-pulse {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.35); }
        }
        @keyframes ec-flip {
          from { opacity: 0.35; transform: translateY(-2px); }
          to   { opacity: 1;    transform: translateY(0); }
        }
        .ec-lead, .ec-item {
          opacity: 0;
          animation: ec-rise 520ms cubic-bezier(.2,.7,.2,1) forwards;
        }
        .ec-pulse {
          animation: ec-pulse 2.4s ease-in-out infinite;
        }
        .ec-tick {
          animation: ec-flip 240ms ease-out;
          display: inline-block;
        }
        @media (prefers-reduced-motion: reduce) {
          .ec-lead, .ec-item, .ec-pulse, .ec-tick { animation: none; opacity: 1; }
        }
      `}</style>
    </section>
  );
}
