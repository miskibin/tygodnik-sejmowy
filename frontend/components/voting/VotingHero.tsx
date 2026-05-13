import type { VotingPageData } from "@/lib/db/voting";
import { VerdictStamp } from "./VerdictStamp";
import { VotingResultBar } from "./VotingResultBar";
import { Hemicycle460 } from "./Hemicycle460";

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function VotingHero({ data }: { data: VotingPageData }) {
  const { header, passed, linkedPrint, seats } = data;

  const cleanedTitle =
    linkedPrint?.short_title ??
    header.title.replace(/^Pkt\.?\s*\d+\s*/, "");

  // Issue #25 follow-up: header.title is the AGENDA kicker ("Pkt. 5 Pierwsze
  // czytanie..."), NOT the question that was actually voted on. The real
  // question lives in header.topic ("wniosek o odrzucenie projektu w
  // pierwszym czytaniu" for voting 1517). Render topic for the "pytanie
  // poddane pod głosowanie" line; fall back to title only when topic is
  // missing/blank (rare — null for ~0.5% of term-10 rows).
  const motionQuestion = header.topic?.trim() || header.title;
  // Show the agenda kicker as a small subcaption so the reader still sees
  // the procedural context (which czytanie / which print) without it
  // masquerading as the question.
  const agendaCaption = header.topic?.trim() ? header.title : null;

  const dateLong = formatDateLong(header.date);
  const timeStr = formatTime(header.date);

  return (
    <section
      className="px-4 sm:px-8 md:px-14 py-8 sm:py-12 md:py-14"
      style={{
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        className="mx-auto grid items-start gap-10 md:gap-16 grid-cols-1 md:grid-cols-[1.1fr_1fr]"
        style={{ maxWidth: 1280 }}
      >
        <div>
          <div
            className="font-mono uppercase"
            style={{
              fontSize: 11,
              color: "var(--muted-foreground)",
              letterSpacing: "0.16em",
              marginBottom: 18,
            }}
          >
            Posiedzenie&nbsp;{header.sitting} · Głosowanie&nbsp;
            {header.voting_number} · {dateLong}, {timeStr}
          </div>

          <h1
            className="font-serif text-[32px] md:text-[56px]"
            style={{
              lineHeight: 1.04,
              fontWeight: 500,
              letterSpacing: "-0.022em",
              margin: "0 0 22px",
              textWrap: "balance",
              color: "var(--foreground)",
            }}
          >
            {cleanedTitle}.
          </h1>

          <div style={{ margin: "0 0 36px", maxWidth: 560 }}>
            <p
              className="font-serif text-[17px] sm:text-[19px] md:text-[21px]"
              style={{
                lineHeight: 1.5,
                color: "var(--secondary-foreground)",
                margin: 0,
                textWrap: "pretty",
                fontStyle: "italic",
              }}
            >
              <span
                className="block font-mono uppercase"
                style={{
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                  letterSpacing: "0.1em",
                  marginBottom: 4,
                  fontStyle: "normal",
                }}
              >
                pytanie poddane pod głosowanie
              </span>
              „{motionQuestion}".
            </p>
            {agendaCaption && (
              <p
                className="font-mono"
                style={{
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                  marginTop: 8,
                  letterSpacing: "0.04em",
                  lineHeight: 1.45,
                }}
              >
                kontekst: {agendaCaption}
              </p>
            )}
          </div>

          <VerdictStamp header={header} passed={passed} />

          <VotingResultBar header={header} />
        </div>

        <div>
          <Hemicycle460 seats={seats} />
        </div>
      </div>
    </section>
  );
}
