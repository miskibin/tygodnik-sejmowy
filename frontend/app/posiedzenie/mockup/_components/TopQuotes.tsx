// Ranking of the 5 most-shareable quotes. Rank position replaces the
// numeric score from the inspiration ("№1 cytat dnia" instead of
// "viral 0.87"). The reason explainer lives in the right column.

import { MPAvatarPhoto } from "@/components/tygodnik/MPAvatar";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { ToneBadge } from "@/components/statement/ToneBadge";
import { MOCK, type TopQuote } from "../data";
import { Kicker, SectionHead } from "./SectionHead";

function QuoteRow({ q }: { q: TopQuote }) {
  const first = q.rank === 1;
  return (
    <li
      className="grid gap-7 md:gap-10 py-7"
      style={{
        gridTemplateColumns: "1fr",
        borderTop: first ? "2px solid var(--rule)" : "1px solid var(--border)",
      }}
    >
      <div
        className="grid items-start"
        style={{
          gridTemplateColumns: "90px 1fr",
          gap: 32,
        }}
      >
        <div>
          <div
            className="font-serif italic font-medium"
            style={{
              fontSize: 64,
              lineHeight: 0.9,
              color: first ? "var(--destructive-deep)" : "var(--foreground)",
            }}
          >
            {q.rank}
          </div>
          <Kicker className="mt-1">cytat punktu</Kicker>
        </div>

        <div className="grid gap-7 md:gap-10 md:grid-cols-[1fr_280px]">
          <div>
            <p
              className="font-serif m-0"
              style={{
                fontSize: first ? 25 : 21,
                lineHeight: 1.32,
                color: "var(--foreground)",
                textWrap: "pretty",
                letterSpacing: "-0.008em",
                fontWeight: 400,
              }}
            >
              „{q.text}"
            </p>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <MPAvatarPhoto name={q.speaker} size={36} />
              <div
                className="font-sans"
                style={{ fontSize: 13 }}
              >
                <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
                  {q.speaker}
                </span>
                <span style={{ color: "var(--muted-foreground)" }}> · {q.function} · </span>
                <ClubBadge klub={q.club} size="sm" withLabel />
              </div>
            </div>
          </div>

          <div
            className="md:pl-5 md:border-l"
            style={{ borderColor: "var(--border)" }}
          >
            <Kicker className="mb-1.5">w punkcie</Kicker>
            <div
              className="font-serif mb-3.5"
              style={{
                fontSize: 15.5,
                lineHeight: 1.3,
                color: "var(--secondary-foreground)",
              }}
            >
              <b
                className="font-mono"
                style={{ color: "var(--foreground)", fontSize: 12 }}
              >
                PKT {q.punktOrd}
              </b>{" "}
              <span
                className="font-mono"
                style={{ fontSize: 10, color: "var(--muted-foreground)" }}
              >
                {q.punktTime}
              </span>
              <br />
              {q.punktShort}.
            </div>
            <Kicker className="mb-1.5">tonacja</Kicker>
            <div className="mb-3">
              <ToneBadge tone={q.tone} />
            </div>
            <div
              className="font-serif italic pt-3"
              style={{
                fontSize: 12.5,
                color: "var(--muted-foreground)",
                lineHeight: 1.45,
                borderTop: "1px dotted var(--border)",
              }}
            >
              {q.reason}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export function TopQuotes() {
  return (
    <section
      className="border-b border-border"
      style={{ background: "var(--secondary)" }}
    >
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-14 md:py-16">
        <SectionHead
          num={5}
          title="Pięć cytatów dnia"
          sub="Krótkie, mocne, cytowalne wypowiedzi. Subiektywny ranking redaktora-AI."
          anchor="cytaty"
        />
        <ol className="list-none p-0 m-0">
          {MOCK.topQuotes.map((q) => (
            <QuoteRow key={q.rank} q={q} />
          ))}
        </ol>
      </div>
    </section>
  );
}
