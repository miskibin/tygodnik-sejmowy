// "Kto najdłużej mówił" — ranking of top speakers by minutes on the
// rostrum, paired with their dominant tone and best quote (replaces the
// inspiration's "viral ø 0.71" decimal — we surface an actual quote
// excerpt instead, which carries more editorial signal anyway).

import { MPAvatarPhoto } from "@/components/tygodnik/MPAvatar";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { ToneBadge } from "@/components/statement/ToneBadge";
import { MOCK } from "../data";
import { Kicker, SectionHead } from "./SectionHead";

export function TopSpeakers() {
  const maxMin = Math.max(...MOCK.topSpeakers.map((s) => s.minutes));

  return (
    <section className="border-b border-border">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-14 md:py-16">
        <SectionHead
          num={7}
          title="Kto najdłużej mówił"
          sub="Top 8 mówców dnia w minutach na mównicy. Dominująca tonacja zdradza, jakim językiem walczyli o uwagę."
          anchor="mowcy"
        />

        <div
          className="hidden md:grid items-center pb-2.5 mb-2 font-mono uppercase"
          style={{
            gridTemplateColumns: "40px minmax(220px, 1fr) minmax(240px, 1.2fr) 80px 160px minmax(220px, 1.4fr)",
            gap: 16,
            fontSize: 9.5,
            color: "var(--muted-foreground)",
            letterSpacing: "0.14em",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <span>#</span>
          <span>Poseł</span>
          <span>Minuty na mównicy</span>
          <span className="text-right">Wyp.</span>
          <span>Dominująca tonacja</span>
          <span>Najlepszy fragment</span>
        </div>

        {MOCK.topSpeakers.map((s, i) => (
          <div
            key={i}
            className="hidden md:grid items-center py-4"
            style={{
              gridTemplateColumns: "40px minmax(220px, 1fr) minmax(240px, 1.2fr) 80px 160px minmax(220px, 1.4fr)",
              gap: 16,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              className="font-serif italic font-medium"
              style={{
                fontSize: 24,
                color:
                  i === 0
                    ? "var(--destructive-deep)"
                    : "var(--foreground)",
                lineHeight: 1,
              }}
            >
              {i + 1}
            </div>

            <div className="flex items-center gap-3 min-w-0">
              <MPAvatarPhoto name={s.name} size={36} />
              <div className="min-w-0">
                <div
                  className="font-serif font-medium truncate"
                  style={{
                    fontSize: 16,
                    color: "var(--foreground)",
                    lineHeight: 1.1,
                  }}
                >
                  {s.name}
                </div>
                <div
                  className="font-sans flex items-center gap-1.5 mt-1 flex-wrap"
                  style={{ fontSize: 11, color: "var(--muted-foreground)" }}
                >
                  <span>{s.function}</span>
                  <ClubBadge klub={s.club} size="xs" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                style={{
                  width: `${(s.minutes / maxMin) * 100}%`,
                  height: 8,
                  background: "var(--foreground)",
                  minWidth: 4,
                }}
                aria-hidden
              />
              <span
                className="font-mono font-bold"
                style={{ fontSize: 12, color: "var(--foreground)" }}
              >
                {s.minutes}
              </span>
              <span
                className="font-sans"
                style={{ fontSize: 11, color: "var(--muted-foreground)" }}
              >
                min
              </span>
            </div>

            <div
              className="text-right font-mono"
              style={{ fontSize: 13, color: "var(--secondary-foreground)" }}
            >
              {s.wypowiedzi}
            </div>

            <div>
              <ToneBadge tone={s.dominantTone} />
            </div>

            <div
              className="font-serif italic"
              style={{
                fontSize: 13,
                color: "var(--secondary-foreground)",
                lineHeight: 1.45,
                textWrap: "pretty",
              }}
            >
              „{s.bestQuote}"
            </div>
          </div>
        ))}

        {/* Mobile: stacked card list */}
        <div className="md:hidden flex flex-col">
          {MOCK.topSpeakers.map((s, i) => (
            <div
              key={i}
              className="py-4"
              style={{
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="font-serif italic font-medium"
                  style={{
                    fontSize: 24,
                    color: i === 0
                      ? "var(--destructive-deep)"
                      : "var(--foreground)",
                    lineHeight: 1,
                    minWidth: 24,
                  }}
                >
                  {i + 1}
                </span>
                <MPAvatarPhoto name={s.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div
                    className="font-serif font-medium"
                    style={{
                      fontSize: 16,
                      color: "var(--foreground)",
                      lineHeight: 1.1,
                    }}
                  >
                    {s.name}
                  </div>
                  <div
                    className="font-sans flex items-center gap-1.5 mt-1 flex-wrap"
                    style={{ fontSize: 11, color: "var(--muted-foreground)" }}
                  >
                    <span>{s.function}</span>
                    <ClubBadge klub={s.club} size="xs" />
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="font-mono font-bold"
                    style={{ fontSize: 16, color: "var(--foreground)" }}
                  >
                    {s.minutes}
                  </div>
                  <Kicker>min · {s.wypowiedzi} wyp.</Kicker>
                </div>
              </div>
              <div className="mt-2 mb-2 flex">
                <div
                  style={{
                    width: `${(s.minutes / maxMin) * 100}%`,
                    height: 6,
                    background: "var(--foreground)",
                    minWidth: 4,
                  }}
                  aria-hidden
                />
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <ToneBadge tone={s.dominantTone} />
              </div>
              <p
                className="font-serif italic m-0"
                style={{
                  fontSize: 13,
                  color: "var(--secondary-foreground)",
                  lineHeight: 1.45,
                }}
              >
                „{s.bestQuote}"
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
