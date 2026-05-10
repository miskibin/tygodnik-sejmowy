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

          <p
            className="font-serif text-[17px] sm:text-[19px] md:text-[21px]"
            style={{
              lineHeight: 1.5,
              color: "var(--secondary-foreground)",
              margin: "0 0 36px",
              textWrap: "pretty",
              maxWidth: 560,
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
            „{header.title}".
          </p>

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
