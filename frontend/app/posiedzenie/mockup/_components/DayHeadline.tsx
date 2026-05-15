// Newsroom-style 3-sentence summary of a single day. Sits on a warm
// secondary surface (no inverted black panel) and uses the destructive
// accent for the kicker rule, mirroring the editorial voice elsewhere
// in the site (BriefList atoms, ViralQuote card).

import type { Day } from "../data";
import { Kicker } from "./SectionHead";

export function DayHeadline({ day }: { day: Day }) {
  const year = day.date ? new Date(day.date).getFullYear() : "";
  return (
    <section
      className="border-b border-border"
      style={{ background: "var(--secondary)" }}
    >
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-10 md:py-12">
        <div className="grid gap-10 md:gap-14 md:grid-cols-[auto_1fr] items-start">
          <div className="min-w-[140px]">
            <Kicker color="var(--destructive-deep)" className="mb-2.5">
              nagłówek dnia
            </Kicker>
            <div
              className="font-mono uppercase"
              style={{
                fontSize: 12,
                color: "var(--muted-foreground)",
                letterSpacing: "0.12em",
                lineHeight: 1.8,
              }}
            >
              {day.weekday}
              <br />
              {day.short}.{year}
              <br />
              {day.status === "live" && (
                <span style={{ color: "var(--destructive-deep)" }}>
                  ● obrady trwają
                </span>
              )}
              {day.status === "done" && (
                <span style={{ color: "var(--muted-foreground)" }}>
                  ○ obrady zakończone
                </span>
              )}
              {day.status === "planned" && (
                <span style={{ color: "var(--muted-foreground)" }}>
                  ○ obrady zaplanowane
                </span>
              )}
            </div>
          </div>

          <div>
            <p
              className="font-serif m-0"
              style={{
                fontSize: 28,
                lineHeight: 1.25,
                letterSpacing: "-0.012em",
                color: "var(--foreground)",
                textWrap: "balance",
                fontWeight: 400,
              }}
            >
              {day.headline}
            </p>

            <div
              className="mt-5 flex gap-x-9 gap-y-2 flex-wrap font-sans text-secondary-foreground"
              style={{ fontSize: 13 }}
            >
              <span>
                <b style={{ color: "var(--success)" }}>
                  {day.stats.glosowania} głosowań
                </b>
                {" "}rozstrzygających
              </span>
              <span>
                <b style={{ color: "var(--foreground)" }}>{day.stats.punkty}</b>{" "}
                punktów porządku obrad
              </span>
              <span>
                <b style={{ color: "var(--foreground)" }}>
                  {day.stats.wypowiedzi}
                </b>{" "}
                wypowiedzi z mównicy
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
