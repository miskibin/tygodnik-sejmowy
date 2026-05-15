// "Moment dnia" — the highest-ranked viral quote of the day.

import { MPAvatarPhoto } from "@/components/tygodnik/MPAvatar";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import type { SittingView } from "./types";
import { Kicker, SectionHead } from "./SectionHead";
import { verdictInk } from "./tokens";

export function MomentOfDay({ data }: { data: SittingView }) {
  const top =
    data.topQuotes.find((q) => q.rank === 1) ?? data.topQuotes[0];
  if (!top) {
    return (
      <section className="border-b border-border">
        <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-14 md:py-16">
          <SectionHead
            num={1}
            title="Moment dnia"
            sub="Brak wybranego cytatu dla tego posiedzenia — wracaj po wzbogaceniu danych."
            anchor="moment"
          />
          <p
            className="font-serif italic"
            style={{
              fontSize: 16,
              color: "var(--muted-foreground)",
              maxWidth: 720,
            }}
          >
            Redaktor-AI nie wybrał jeszcze cytatu dnia. Pojawi się tu po
            zakończeniu wzbogacania wypowiedzi.
          </p>
        </div>
      </section>
    );
  }
  const point = data.agendaPoints.find((p) => p.ord === top.pointOrd) ?? null;

  return (
    <section className="border-b border-border">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-14 md:py-16">
        <SectionHead
          num={1}
          title="Moment dnia"
          sub={`Najmocniejszy cytat z ${data.number}. posiedzenia — wybrany przez redaktora-AI z ${data.totals.statements} wypowiedzi.`}
          anchor="moment"
        />

        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div
              className="font-serif italic"
              style={{
                fontSize: 110,
                lineHeight: 0.7,
                color: "var(--destructive-deep)",
                marginBottom: -4,
              }}
              aria-hidden
            >
              „
            </div>
            <blockquote
              className="font-serif m-0"
              style={{
                fontSize: 30,
                lineHeight: 1.28,
                letterSpacing: "-0.012em",
                color: "var(--foreground)",
                fontWeight: 400,
                textWrap: "pretty",
              }}
            >
              {top.text}
            </blockquote>

            <div
              className="mt-7 flex items-center gap-4 pt-5"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <MPAvatarPhoto name={top.speaker} size={48} />
              <div className="min-w-0">
                <div
                  className="font-serif font-medium"
                  style={{ fontSize: 18, color: "var(--foreground)" }}
                >
                  {top.speaker}
                </div>
                <div
                  className="font-sans flex items-center gap-2 mt-0.5 flex-wrap"
                  style={{ fontSize: 12, color: "var(--muted-foreground)" }}
                >
                  <span>{top.function}</span>
                  <span>·</span>
                  <ClubBadge klub={top.club} size="sm" withLabel={false} />
                </div>
              </div>
              <div className="ml-auto text-right">
                <Kicker className="mb-1.5">cytat dnia</Kicker>
                <div
                  className="font-serif italic font-medium"
                  style={{
                    fontSize: 26,
                    color: "var(--destructive-deep)",
                    lineHeight: 1,
                  }}
                >
                  №1
                </div>
              </div>
            </div>

            <div
              className="mt-5 p-4 pl-4"
              style={{
                background: "var(--secondary)",
                borderLeft: "3px solid var(--destructive-deep)",
              }}
            >
              <Kicker
                color="var(--destructive-deep)"
                className="mb-1"
              >
                czemu właśnie ten
              </Kicker>
              <p
                className="font-sans m-0 italic"
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--secondary-foreground)",
                }}
              >
                {top.reason}
              </p>
            </div>
          </div>

          {/* Agenda-point context aside — warm beige, NOT inverted black */}
          {point && (
            <aside
              className="p-7 md:p-8"
              style={{
                background: "var(--secondary)",
                borderTop: "3px solid var(--destructive-deep)",
              }}
            >
              <Kicker className="mb-3">w którym punkcie</Kicker>
              <div className="flex items-baseline gap-4 mb-3">
                <span
                  className="font-serif italic font-medium"
                  style={{
                    fontSize: 60,
                    lineHeight: 0.9,
                    color: "var(--destructive-deep)",
                  }}
                >
                  {point.ord}
                </span>
                <div
                  className="font-mono uppercase"
                  style={{
                    fontSize: 10.5,
                    color: "var(--muted-foreground)",
                    letterSpacing: "0.14em",
                    lineHeight: 1.5,
                  }}
                >
                  {point.timeStart}—{point.timeEnd}
                  <br />
                  {point.durMin} min
                </div>
              </div>
              <h3
                className="font-serif font-medium m-0 mb-2.5"
                style={{
                  fontSize: 21,
                  lineHeight: 1.22,
                  color: "var(--foreground)",
                  textWrap: "balance",
                }}
              >
                {point.shortTitle}.
              </h3>
              {point.plainSummary && (
                <p
                  className="font-serif m-0"
                  style={{
                    fontSize: 14.5,
                    lineHeight: 1.55,
                    color: "var(--secondary-foreground)",
                    textWrap: "pretty",
                  }}
                >
                  {point.plainSummary}
                </p>
              )}

              {point.vote && (
                <div
                  className="mt-5 pt-4"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <Kicker className="mb-1.5">wynik głosowania</Kicker>
                  <div className="flex items-baseline gap-4 flex-wrap">
                    <span
                      className="font-serif italic font-medium"
                      style={{
                        fontSize: 24,
                        color: verdictInk(point.vote.result, point.vote.motionPolarity),
                        lineHeight: 1,
                      }}
                    >
                      {point.vote.result}
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 11.5,
                        color: "var(--muted-foreground)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {point.vote.yes}–{point.vote.no} · różnica{" "}
                      {point.vote.margin}
                    </span>
                  </div>
                </div>
              )}

              <a
                href="#porzadek"
                className="mt-5 inline-flex items-center gap-1.5 hover:opacity-70 transition-opacity"
                style={{
                  fontSize: 12.5,
                  color: "var(--destructive-deep)",
                  borderBottom: "1px solid var(--destructive-deep)",
                  paddingBottom: 2,
                }}
              >
                cała wypowiedź + stenogram →
              </a>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}
