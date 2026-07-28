// "Porządek obrad" — the main agenda list. Filterable, chronological.

"use client";

import { useState } from "react";
import {
  TopicChips,
  StageBadge,
  PrintRef,
  ProcessRef,
  VoteResultCard,
  QuoteCard,
  SectionHead,
  Kicker,
} from "@/components/tygodnik/atoms";
import type { ClubTallyRaw } from "@/lib/events-types";
import type { AgendaPoint, SittingView, ViralQuote, Vote as VoteType } from "./types";

// Convert the local /posiedzenie Vote.byClub map to the shared
// ClubTallyRaw[] shape consumed by ClubResultBar / VoteResultCard.
function byClubToTally(byClub: NonNullable<VoteType["byClub"]>): ClubTallyRaw[] {
  const out: ClubTallyRaw[] = [];
  for (const [club, counts] of Object.entries(byClub)) {
    if (!counts) continue;
    const total = counts.yes + counts.no + counts.abstain + Math.max(0, counts.absent);
    if (total === 0) continue;
    out.push({
      club_short: club,
      club_name: club,
      yes: counts.yes,
      no: counts.no,
      abstain: counts.abstain,
      not_voting: counts.absent,
      total,
    });
  }
  return out;
}

type FilterId = "all" | "done" | "planned" | "vote" | "flagship";

const FILTERS: { id: FilterId; label: (n: number) => string; pred: (p: AgendaPoint) => boolean }[] = [
  { id: "all", label: (n) => `wszystkie · ${n}`, pred: () => true },
  { id: "done", label: (n) => `już za nami · ${n}`, pred: (p) => !p.planned },
  { id: "planned", label: (n) => `zaplanowane · ${n}`, pred: (p) => p.planned },
  { id: "vote", label: (n) => `z głosowaniem · ${n}`, pred: (p) => !!p.vote },
  { id: "flagship", label: (n) => `kluczowe · ${n}`, pred: (p) => p.importance === "flagship" },
];

// Local viral-score extractor for QuoteCard's kicker — ViralQuote.reason
// is free-form ("controversy score 0.71"), we surface the numeric value.
function viralScoreOf(q: ViralQuote): string | null {
  const m = q.reason?.match(/(\d+\.\d+)/);
  return m ? m[1] : null;
}

function PlannedMini({ p }: { p: AgendaPoint }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        border: "1px dashed var(--border)",
        color: "var(--muted-foreground)",
      }}
    >
      <Kicker className="mb-1.5">zaplanowane</Kicker>
      <div
        className="italic"
        style={{ fontSize: 14.5, lineHeight: 1.4 }}
      >
        Punkt rozpocznie się ok.{" "}
        <b style={{ color: "var(--foreground)", fontStyle: "normal" }}>{p.timeStart}</b>.
        Wracaj po odświeżenie.
      </div>
    </div>
  );
}

function AgendaRow({ p }: { p: AgendaPoint }) {
  const isFlag = p.importance === "flagship";
  return (
    <li
      id={`punkt-${p.ord}`}
      className="grid gap-5 md:gap-8 py-7 border-t"
      style={{
        gridTemplateColumns: "1fr",
        borderColor: p.planned ? "var(--border)" : "var(--rule)",
        opacity: p.planned ? 0.85 : 1,
      }}
    >
      <div
        className="hidden md:grid"
        style={{
          gridTemplateColumns: "84px 1fr 320px",
          gap: 32,
        }}
      >
        <div>
          <div
            className="italic font-medium"
            style={{
              fontSize: 56,
              lineHeight: 0.9,
              letterSpacing: "-0.02em",
              color: isFlag ? "var(--destructive-deep)" : "var(--foreground)",
            }}
          >
            {p.ord}
          </div>
          <div
            className="font-mono mt-2"
            style={{
              fontSize: 11,
              color: "var(--muted-foreground)",
              lineHeight: 1.5,
            }}
          >
            {p.timeStart}
            <br />
            <span style={{ color: "var(--border)" }}>↓ {p.durMin}min</span>
            <br />
            {p.timeEnd}
          </div>
          {p.ongoing && (
            <div
              className="mt-3 font-medium"
              style={{
                fontSize: 11,
                color: "var(--destructive-deep)",
              }}
            >
              ● trwa
            </div>
          )}
          {p.planned && (
            <div
              className="mt-3 font-medium"
              style={{
                fontSize: 11,
                color: "var(--muted-foreground)",
              }}
            >
              ○ planowany
            </div>
          )}
        </div>

        <AgendaCenter p={p} />

        <div>
          {p.vote ? (
            <VoteResultCard
              time={p.vote.time}
              result={p.vote.result}
              subtitle={p.vote.topic ?? p.vote.subtitle}
              yes={p.vote.yes}
              no={p.vote.no}
              abstain={p.vote.abstain}
              absent={p.vote.absent}
              margin={p.vote.margin}
              motionPolarity={p.vote.motionPolarity}
              clubTally={p.vote.byClub ? byClubToTally(p.vote.byClub) : undefined}
            />
          ) : p.viralQuote ? (
            <QuoteCard
              text={p.viralQuote.text}
              speaker={p.viralQuote.speaker}
              speakerFunction={p.viralQuote.function}
              club={p.viralQuote.club}
              viralScore={viralScoreOf(p.viralQuote)}
            />
          ) : p.planned ? (
            <PlannedMini p={p} />
          ) : null}
        </div>
      </div>

      <div className="md:hidden">
        <div className="flex items-baseline gap-3 mb-3">
          <span
            className="italic font-medium"
            style={{
              fontSize: 40,
              lineHeight: 0.9,
              color: isFlag ? "var(--destructive-deep)" : "var(--foreground)",
            }}
          >
            {p.ord}
          </span>
          <div
            className="font-mono"
            style={{
              fontSize: 11,
              color: "var(--muted-foreground)",
              lineHeight: 1.5,
            }}
          >
            {p.timeStart}—{p.timeEnd} · {p.durMin} min
            {p.ongoing && (
              <span
                className="ml-2 uppercase"
                style={{
                  color: "var(--destructive-deep)",
                }}
              >
                ● trwa
              </span>
            )}
            {p.planned && (
              <span
                className="ml-2 uppercase"
                style={{
                  color: "var(--muted-foreground)",
                }}
              >
                ○ planowany
              </span>
            )}
          </div>
        </div>
        <AgendaCenter p={p} />
        <div className="mt-5">
          {p.vote ? (
            <VoteResultCard
              time={p.vote.time}
              result={p.vote.result}
              subtitle={p.vote.topic ?? p.vote.subtitle}
              yes={p.vote.yes}
              no={p.vote.no}
              abstain={p.vote.abstain}
              absent={p.vote.absent}
              margin={p.vote.margin}
              motionPolarity={p.vote.motionPolarity}
              clubTally={p.vote.byClub ? byClubToTally(p.vote.byClub) : undefined}
            />
          ) : p.viralQuote ? (
            <QuoteCard
              text={p.viralQuote.text}
              speaker={p.viralQuote.speaker}
              speakerFunction={p.viralQuote.function}
              club={p.viralQuote.club}
              viralScore={viralScoreOf(p.viralQuote)}
            />
          ) : p.planned ? (
            <PlannedMini p={p} />
          ) : null}
        </div>
      </div>
    </li>
  );
}

function AgendaCenter({ p }: { p: AgendaPoint }) {
  return (
    <div className="min-w-0">
      <div className="flex gap-1.5 mb-2.5 flex-wrap">
        {p.stages.map((s) => (
          <StageBadge key={s}>{s}</StageBadge>
        ))}
        {p.prints.map((d) => (
          <PrintRef key={`${d.term}-${d.number}`} term={d.term} number={d.number} />
        ))}
        {p.processes.map((pr) => (
          <ProcessRef key={`${pr.term}-${pr.number}`} term={pr.term} number={pr.number} />
        ))}
      </div>

      <h3
        className="font-medium m-0 mb-2"
        style={{
          fontSize: 22,
          lineHeight: 1.2,
          letterSpacing: "-0.012em",
          color: "var(--foreground)",
          textWrap: "balance",
        }}
      >
        {p.shortTitle}.
      </h3>
      {p.plainSummary && (
        <p
          className="m-0 mb-3.5"
          style={{
            fontSize: 14.5,
            lineHeight: 1.55,
            color: "var(--secondary-foreground)",
            textWrap: "pretty",
          }}
        >
          {p.plainSummary}
        </p>
      )}

      <details className="mb-4">
        <summary
          className="cursor-pointer font-medium"
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            listStyle: "none",
          }}
        >
          ▸ pełny urzędowy tytuł
        </summary>
        <p
          className="italic mt-2 mb-0"
          style={{
            fontSize: 13,
            color: "var(--muted-foreground)",
            lineHeight: 1.5,
            maxWidth: 720,
          }}
        >
          „{p.title}”
        </p>
      </details>

      {!p.planned && (
        <div
          className="flex items-center gap-x-5 gap-y-2 flex-wrap font-medium"
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
          }}
        >
          <span>
            <b style={{ color: "var(--foreground)", fontWeight: 700 }}>
              {p.stats.statements}
            </b>{" "}
            wypowiedzi
          </span>
          <span>
            <b style={{ color: "var(--foreground)", fontWeight: 700 }}>
              {p.stats.speakers}
            </b>{" "}
            mówców
          </span>
          {p.stats.votes > 0 && (
            <span>
              <b style={{ color: "var(--foreground)", fontWeight: 700 }}>
                {p.stats.votes}
              </b>{" "}
              głosowań
            </span>
          )}
          {p.topics.length > 0 && (
            <span className="ml-auto inline-flex">
              <TopicChips topicIds={p.topics} size="sm" />
            </span>
          )}
        </div>
      )}

    </div>
  );
}

export function AgendaList({ data }: { data: SittingView }) {
  const [filter, setFilter] = useState<FilterId>("all");

  const counts: Record<FilterId, number> = {
    all: data.agendaPoints.length,
    done: data.agendaPoints.filter((p) => !p.planned).length,
    planned: data.agendaPoints.filter((p) => p.planned).length,
    vote: data.agendaPoints.filter((p) => !!p.vote).length,
    flagship: data.agendaPoints.filter((p) => p.importance === "flagship").length,
  };

  const visible = data.agendaPoints.filter(FILTERS.find((f) => f.id === filter)!.pred);

  return (
    <section className="border-b border-border">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-14 md:py-16">
        <SectionHead
          num={4}
          title="Porządek obrad"
          sub="Każdy punkt z osobna — chronologicznie, z cytatem dnia i tonacją dyskusji."
          anchor="porzadek"
        />

        <div className="flex gap-2.5 mb-7 flex-wrap font-sans" style={{ fontSize: 12.5 }}>
          <span
            className="self-center mr-1 font-medium"
            style={{
              fontSize: 11,
              color: "var(--muted-foreground)",
            }}
          >
            filtruj
          </span>
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="cursor-pointer rounded-full transition-colors"
                style={{
                  padding: "6px 13px",
                  border: `1px solid ${on ? "var(--foreground)" : "var(--border)"}`,
                  background: on ? "var(--foreground)" : "transparent",
                  color: on ? "var(--background)" : "var(--secondary-foreground)",
                }}
                aria-pressed={on}
              >
                {f.label(counts[f.id])}
              </button>
            );
          })}
        </div>

        <ol className="list-none p-0 m-0">
          {visible.map((p) => (
            <AgendaRow key={p.ord} p={p} />
          ))}
        </ol>
      </div>
    </section>
  );
}
