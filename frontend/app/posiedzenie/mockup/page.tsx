import Link from "next/link";
import type { Metadata } from "next";
import { MOCK_SITTING, type AgendaPoint, type StageBadge } from "./data";

export const metadata: Metadata = {
  title: "Posiedzenie 19 — porządek obrad · mockup",
  robots: { index: false, follow: false },
};

const PL_DATE_LONG = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const PL_DATE_SHORT = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
});
const PL_WEEKDAY = new Intl.DateTimeFormat("pl-PL", { weekday: "long" });

function formatDateRange(dates: string[]): string {
  if (dates.length === 0) return "—";
  if (dates.length === 1) return PL_DATE_LONG.format(new Date(dates[0]));
  const f = new Date(dates[0]);
  const l = new Date(dates[dates.length - 1]);
  const sameMonth = f.getMonth() === l.getMonth() && f.getFullYear() === l.getFullYear();
  if (sameMonth) {
    const monthYear = new Intl.DateTimeFormat("pl-PL", {
      month: "long",
      year: "numeric",
    }).format(f);
    return `${f.getDate()}–${l.getDate()} ${monthYear}`;
  }
  return `${PL_DATE_LONG.format(f)} – ${PL_DATE_LONG.format(l)}`;
}

function formatDuration(min: number | null): string {
  if (!min) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const STAGE_TONE: Record<StageBadge, "neutral" | "vote" | "info" | "alarm"> = {
  "I czytanie": "neutral",
  "II czytanie": "neutral",
  "III czytanie": "vote",
  "Głosowanie": "vote",
  "Sprawozdanie komisji": "neutral",
  "Pierwsze czytanie": "neutral",
  "Informacja": "info",
  "Pytania w sprawach bieżących": "info",
  "Wniosek formalny": "alarm",
};

function StageChip({ label }: { label: StageBadge }) {
  const tone = STAGE_TONE[label] ?? "neutral";
  const styles: Record<string, React.CSSProperties> = {
    neutral: {
      color: "var(--destructive-deep)",
      background: "var(--muted)",
      border: "1px solid var(--border)",
    },
    vote: {
      color: "var(--primary-foreground)",
      background: "var(--destructive-deep)",
      border: "1px solid var(--destructive-deep)",
    },
    info: {
      color: "var(--secondary-foreground)",
      background: "var(--secondary)",
      border: "1px solid var(--border)",
    },
    alarm: {
      color: "var(--destructive)",
      background: "var(--background)",
      border: "1px dashed var(--destructive)",
    },
  };
  return (
    <span
      className="font-sans uppercase shrink-0"
      style={{
        fontSize: 10,
        letterSpacing: "0.08em",
        padding: "3px 7px",
        borderRadius: 2,
        whiteSpace: "nowrap",
        ...styles[tone],
      }}
    >
      {label}
    </span>
  );
}

function KpiBlock({
  value,
  label,
  sub,
}: {
  value: string | number;
  label: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-1.5">
        {label}
      </div>
      <div
        className="font-serif font-medium text-foreground"
        style={{ fontSize: "clamp(1.75rem, 3.4vw, 2.5rem)", lineHeight: 1 }}
      >
        {value}
      </div>
      {sub && (
        <div className="font-sans text-[11px] text-muted-foreground mt-1.5 leading-snug">
          {sub}
        </div>
      )}
    </div>
  );
}

function DayChip({
  date,
  pointCount,
  active = false,
}: {
  date: string;
  pointCount: number;
  active?: boolean;
}) {
  const d = new Date(date);
  return (
    <a
      href={`#dzien-${date}`}
      className="block px-4 py-3 border transition-colors hover:bg-muted"
      style={{
        borderColor: active ? "var(--destructive-deep)" : "var(--border)",
        background: active ? "var(--secondary)" : "transparent",
        minWidth: 140,
      }}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
        {PL_WEEKDAY.format(d)}
      </div>
      <div
        className="font-serif font-medium text-foreground mt-1"
        style={{ fontSize: 18, lineHeight: 1.1 }}
      >
        {PL_DATE_SHORT.format(d)}
      </div>
      <div className="font-sans text-[11px] text-muted-foreground mt-1">
        {pointCount} {pointCount === 1 ? "punkt" : "punktów"}
      </div>
    </a>
  );
}

function ProcessLink({ p }: { p: AgendaPoint["processes"][number] }) {
  return (
    <Link
      href={`/proces/${p.term}/${p.number}`}
      className="inline-flex items-center gap-2 px-2.5 py-1 border border-border hover:bg-muted transition-colors"
      style={{ borderRadius: 2 }}
    >
      <span
        className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground"
        style={{ minWidth: 36 }}
      >
        DRUK&nbsp;{p.number}
      </span>
      <span
        className="font-serif text-secondary-foreground"
        style={{ fontSize: 12.5, lineHeight: 1.3 }}
      >
        {p.shortTitle}
      </span>
    </Link>
  );
}

function PrintChip({ p }: { p: AgendaPoint["prints"][number] }) {
  return (
    <Link
      href={`/druk/${p.term}/${p.number}`}
      className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5"
      style={{
        background: "var(--background)",
        border: "1px dotted var(--border)",
        borderRadius: 2,
      }}
    >
      druk&nbsp;{p.number}
    </Link>
  );
}

function ViralPull({ q }: { q: NonNullable<AgendaPoint["viralQuote"]> }) {
  return (
    <figure
      className="mt-5 pl-5 border-l-2"
      style={{ borderColor: "var(--destructive-deep)" }}
    >
      <blockquote
        className="font-serif italic text-foreground"
        style={{ fontSize: 17, lineHeight: 1.45, textWrap: "pretty" as never }}
      >
        „{q.quote}”
      </blockquote>
      <figcaption className="font-sans text-[11.5px] text-muted-foreground mt-2">
        <span className="font-medium text-secondary-foreground">{q.speakerName}</span>
        {q.clubRef && <span> · {q.clubRef}</span>}
        {q.function && <span> · {q.function}</span>}
      </figcaption>
    </figure>
  );
}

function AgendaPointCard({ point }: { point: AgendaPoint }) {
  const d = new Date(point.date);
  return (
    <article
      className="grid gap-6 md:gap-10 py-8 md:py-10 border-b border-border"
      style={{ gridTemplateColumns: "minmax(0, 100px) minmax(0, 1fr)" }}
    >
      {/* Left column: big ord + meta */}
      <aside className="min-w-0">
        <div
          className="font-serif italic font-medium text-secondary-foreground"
          style={{ fontSize: 56, lineHeight: 0.9 }}
        >
          {String(point.ord).padStart(2, "0")}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground mt-3 leading-[1.7]">
          <div>{PL_DATE_SHORT.format(d)}</div>
          {point.startTime && <div>godz. {point.startTime}</div>}
          {point.durationMin !== null && (
            <div className="text-foreground/70">
              {formatDuration(point.durationMin)}
            </div>
          )}
        </div>
      </aside>

      {/* Right column: stages, title, links, summary, quote, stats */}
      <div className="min-w-0 max-w-[820px]">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {point.stages.map((s) => (
            <StageChip key={s} label={s} />
          ))}
        </div>

        <h3
          className="font-serif font-medium text-foreground m-0"
          style={{
            fontSize: 22,
            lineHeight: 1.25,
            letterSpacing: "-0.01em",
            textWrap: "balance" as never,
          }}
        >
          {point.title}
        </h3>

        {point.processes.length > 0 && (
          <div className="mt-4 flex flex-col gap-1.5">
            {point.processes.map((p) => (
              <ProcessLink key={p.number} p={p} />
            ))}
          </div>
        )}

        {point.prints.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {point.prints.map((p) => (
              <PrintChip key={p.number} p={p} />
            ))}
          </div>
        )}

        {point.summary && (
          <p
            className="font-serif text-secondary-foreground mt-5"
            style={{
              fontSize: 14.5,
              lineHeight: 1.55,
              textWrap: "pretty" as never,
            }}
          >
            {point.summary}
          </p>
        )}

        {point.viralQuote && <ViralPull q={point.viralQuote} />}

        {/* Inline stat row */}
        <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 pt-4 border-t border-border">
          <Stat n={point.statementCount} label="wypowiedzi" />
          <Stat n={point.uniqueSpeakers} label="mówców" />
          <Stat n={point.votingCount} label="głosowań" emphasize={point.votingCount > 0} />
          {point.topicTags.length > 0 && (
            <div className="ml-auto flex flex-wrap gap-1">
              {point.topicTags.map((t) => (
                <span
                  key={t}
                  className="font-sans text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-sans text-[12px]">
          <a
            href={`#statements-${point.agendaItemId}`}
            className="text-destructive hover:underline"
          >
            Wypowiedzi w tym punkcie →
          </a>
          {point.votingCount > 0 && (
            <a
              href={`#votings-${point.agendaItemId}`}
              className="text-destructive hover:underline"
            >
              Wyniki głosowań →
            </a>
          )}
          <a
            href={`#stenogram-${point.agendaItemId}`}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Stenogram (fragment)
          </a>
        </div>
      </div>
    </article>
  );
}

function Stat({
  n,
  label,
  emphasize = false,
}: {
  n: number;
  label: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="font-serif font-medium"
        style={{
          fontSize: 18,
          color: emphasize ? "var(--destructive-deep)" : "var(--foreground)",
        }}
      >
        {n}
      </span>
      <span className="font-sans text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </span>
    </div>
  );
}

export default function ProceedingMockupPage() {
  const s = MOCK_SITTING;
  const byDay = new Map<string, number>();
  for (const p of s.points) {
    byDay.set(p.date, (byDay.get(p.date) ?? 0) + 1);
  }

  return (
    <main className="bg-background min-h-screen pb-20">
      {/* Top breadcrumb / kicker */}
      <div className="border-b border-border">
        <div className="max-w-[1280px] mx-auto px-3 md:px-6 py-3 font-sans text-[11px] text-muted-foreground flex items-center gap-2">
          <Link href="/" className="hover:text-foreground">
            Tygodnik Sejmowy
          </Link>
          <span>·</span>
          <Link href="/tygodnik" className="hover:text-foreground">
            Posiedzenia
          </Link>
          <span>·</span>
          <span className="text-foreground">
            X kadencja, posiedzenie nr {s.number}
          </span>
          {s.current && (
            <span
              className="ml-auto font-sans uppercase"
              style={{
                fontSize: 9,
                letterSpacing: "0.16em",
                padding: "2px 8px",
                borderRadius: 2,
                color: "var(--destructive-foreground)",
                background: "var(--destructive)",
              }}
            >
              ● trwa
            </span>
          )}
        </div>
      </div>

      {/* Hero */}
      <section className="border-b border-border">
        <div className="max-w-[1280px] mx-auto px-3 md:px-6 py-10 md:py-14">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Posiedzenie nr {s.number} · X kadencja · {formatDateRange(s.dates)}
          </div>
          <h1
            className="font-serif font-medium text-foreground m-0"
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              textWrap: "balance" as never,
              maxWidth: 900,
            }}
          >
            Porządek obrad
          </h1>
          <p
            className="font-serif italic text-muted-foreground mt-3"
            style={{ fontSize: 16, maxWidth: 720 }}
          >
            Wszystkie punkty omówione w czasie trzech dni obrad — z linkami do
            procesów legislacyjnych, druków, wypowiedzi i wyników głosowań.
          </p>

          {/* KPI strip */}
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8 pt-8 border-t border-border">
            <KpiBlock value={s.totalPoints} label="Punkty obrad" sub="zgodnie z porządkiem" />
            <KpiBlock
              value={s.totalVotings}
              label="Głosowań"
              sub="łącznie w tym posiedzeniu"
            />
            <KpiBlock
              value={s.totalStatements}
              label="Wypowiedzi"
              sub={`${s.totalSpeakers} unikalnych mówców`}
            />
            <KpiBlock
              value={s.dates.length}
              label="Dni obrad"
              sub={formatDateRange(s.dates)}
            />
          </div>
        </div>
      </section>

      {/* Day timeline */}
      <section className="border-b border-border">
        <div className="max-w-[1280px] mx-auto px-3 md:px-6 py-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
            Skok do dnia
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {s.dates.map((d, i) => (
              <DayChip
                key={d}
                date={d}
                pointCount={byDay.get(d) ?? 0}
                active={i === 0}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Agenda points list */}
      <section>
        <div className="max-w-[1280px] mx-auto px-3 md:px-6 py-8">
          <div className="flex items-baseline justify-between mb-2 pb-3 border-b border-border">
            <h2
              className="font-serif font-medium text-foreground m-0"
              style={{ fontSize: 22, letterSpacing: "-0.015em" }}
            >
              Punkty obrad
            </h2>
            <div className="font-sans text-[11px] text-muted-foreground">
              {s.points.length} z {s.totalPoints} (skrót — kliknij, aby
              rozwinąć)
            </div>
          </div>

          {s.points.map((p) => (
            <AgendaPointCard key={p.agendaItemId} point={p} />
          ))}
        </div>
      </section>

      {/* Footer ribbon */}
      <section>
        <div className="max-w-[1280px] mx-auto px-3 md:px-6 py-10">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3 font-sans text-[12.5px]">
            <a className="text-destructive hover:underline" href="#">
              Pobierz pełny stenogram (PDF) →
            </a>
            <a className="text-destructive hover:underline" href="#">
              Wszystkie głosowania tego posiedzenia →
            </a>
            <a className="text-muted-foreground hover:text-foreground hover:underline" href="#">
              Subskrybuj RSS posiedzeń
            </a>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              źródło: api.sejm.gov.pl · /sejm/term10/proceedings/{s.number}
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
