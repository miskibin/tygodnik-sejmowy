// Editorial footer — primary sources, how-we-read note, share row.

import type { SittingView } from "./types";
import { Kicker } from "./SectionHead";

export function Sources({ data }: { data: SittingView }) {
  const referenceDate = data.dates.at(-1) ?? null;
  const lastUpdateDate = referenceDate
    ? referenceDate.split("-").reverse().join(".")
    : "—";
  return (
    <section
      className="border-t border-border"
      style={{ background: "var(--background)" }}
    >
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-12 md:py-14">
        <div className="grid gap-10 md:gap-12 md:grid-cols-3">
          <div>
            <Kicker className="mb-3.5">źródła pierwotne</Kicker>
            <ul
              className="list-none p-0 m-0 font-sans"
              style={{ fontSize: 13, lineHeight: 1.85, color: "var(--secondary-foreground)" }}
            >
              <li>↗ Porządek obrad — sejm.gov.pl</li>
              <li>↗ Stenogramy dnia (PDF, ok. 14:00 i ~22:00)</li>
              <li>↗ Wyniki głosowań — sejm.gov.pl</li>
              <li>↗ Transmisja archiwalna — Sejm TV</li>
            </ul>
          </div>
          <div>
            <Kicker className="mb-3.5">jak czytamy te dane</Kicker>
            <p
              className="font-serif m-0"
              style={{
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--secondary-foreground)",
                textWrap: "pretty",
              }}
            >
              Każdą wypowiedź przepuszczamy przez model językowy, który nadaje jej tonację, adresata i kilka tagów tematycznych. Sumy klubowe i renegaci liczone są programatycznie z listy imiennej Sejmu. Nic nie zmyślamy — co najwyżej streszczamy.
            </p>
          </div>
          <div>
            <Kicker className="mb-3.5">udostępnij dzień</Kicker>
            <div
              className="font-mono mb-3 break-all"
              style={{
                fontSize: 11,
                padding: "10px 12px",
                background: "var(--secondary)",
                color: "var(--secondary-foreground)",
                border: "1px solid var(--border)",
              }}
            >
              tygodniksejmowy.pl/posiedzenie/{data.number}
            </div>
            <div className="flex gap-2 flex-wrap">
              {["kopiuj link", "pdf dnia", "newsletter", "rss"].map((b) => (
                <button
                  key={b}
                  type="button"
                  className="cursor-pointer rounded-full hover:bg-muted transition-colors"
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    color: "var(--secondary-foreground)",
                    background: "transparent",
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="mt-10 pt-5 flex justify-between flex-wrap gap-3 items-baseline"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span
            className="font-serif italic"
            style={{ fontSize: 13, color: "var(--muted-foreground)" }}
          >
            Tygodnik Sejmowy porządkuje dane z sejm.gov.pl — nie zastępuje ich. Stenogram PDF jest źródłem prawa.
          </span>
          <span
            className="font-mono uppercase"
            style={{
              fontSize: 10,
              color: "var(--muted-foreground)",
              letterSpacing: "0.12em",
            }}
          >
            Posiedzenie {data.number} · ostatnia aktualizacja {lastUpdateDate}
            {data.liveAt ? `, ${data.liveAt}` : ""}
          </span>
        </div>
      </div>
    </section>
  );
}
