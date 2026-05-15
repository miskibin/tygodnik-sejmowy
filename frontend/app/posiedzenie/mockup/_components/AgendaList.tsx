// "Porządek obrad" — the main agenda list. Filterable, chronological.
// Each row: ord+time rail / title+summary+stats / vote OR quote OR planned.
// On mobile the 3-column grid stacks; the rail collapses to a horizontal
// "PKT N · HH:MM" strip.

"use client";

import { useState } from "react";
import Link from "next/link";
import { MPAvatarPhoto } from "@/components/tygodnik/MPAvatar";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { TopicChips } from "@/components/tygodnik/atoms/TopicChips";
import { ToneBadge } from "@/components/statement/ToneBadge";
import { TOPICS } from "@/lib/topics";
import {
  MOCK,
  type AgendaPoint,
  type Vote as VoteType,
  type ViralQuote,
  type Tone,
} from "../data";
import { TONE_INK, TONE_LABEL, verdictInk } from "../tokens";
import { Kicker, SectionHead } from "./SectionHead";

type FilterId = "all" | "done" | "planned" | "vote" | "flagship";

const FILTERS: { id: FilterId; label: (n: number) => string; pred: (p: AgendaPoint) => boolean }[] = [
  { id: "all", label: (n) => `wszystkie · ${n}`, pred: () => true },
  { id: "done", label: (n) => `już za nami · ${n}`, pred: (p) => !p.planned },
  { id: "planned", label: (n) => `zaplanowane · ${n}`, pred: (p) => p.planned },
  { id: "vote", label: (n) => `z głosowaniem · ${n}`, pred: (p) => !!p.vote },
  { id: "flagship", label: (n) => `kluczowe · ${n}`, pred: (p) => p.importance === "flagship" },
];

function StageBadge({ label }: { label: string }) {
  return (
    <span
      className="font-mono uppercase"
      style={{
        fontSize: 9.5,
        color: "var(--background)",
        background: "var(--foreground)",
        padding: "3px 8px",
        letterSpacing: "0.14em",
      }}
    >
      {label}
    </span>
  );
}

function PrintRef({ number, term }: { term: number; number: string }) {
  return (
    <Link
      href={`/druk/${term}/${number}`}
      className="font-mono uppercase no-underline hover:bg-muted transition-colors"
      style={{
        fontSize: 9.5,
        color: "var(--secondary-foreground)",
        padding: "3px 8px",
        letterSpacing: "0.14em",
        border: "1px solid var(--border)",
      }}
    >
      druk {number}
    </Link>
  );
}

function ProcessRef({ number, term }: { term: number; number: string }) {
  return (
    <Link
      href={`/proces/${term}/${number}`}
      className="font-mono uppercase no-underline hover:bg-muted transition-colors"
      style={{
        fontSize: 9.5,
        color: "var(--destructive-deep)",
        padding: "3px 8px",
        letterSpacing: "0.14em",
        border: "1px solid var(--destructive-deep)",
      }}
    >
      proces {number}
    </Link>
  );
}

function ToneBar({ tones }: { tones: Partial<Record<Tone, number>> }) {
  const sum = Object.values(tones).reduce<number>((s, v) => s + (v ?? 0), 0);
  if (sum === 0) return null;
  return (
    <div className="mt-4">
      <div
        className="flex"
        style={{ height: 8, background: "var(--secondary)", border: "1px solid var(--border)" }}
        aria-hidden
      >
        {Object.entries(tones).map(([k, v]) => (
          <div
            key={k}
            style={{
              width: `${((v ?? 0) / sum) * 100}%`,
              background: TONE_INK[k as Tone],
            }}
            title={`${TONE_LABEL[k as Tone]}: ${v}`}
          />
        ))}
      </div>
    </div>
  );
}

function VoteMini({ v }: { v: VoteType }) {
  const accent = verdictInk(v.result, v.motionPolarity);
  return (
    <div
      className="block no-underline text-inherit"
      style={{
        padding: "14px 16px",
        border: "1.5px solid var(--foreground)",
        background: "var(--background)",
      }}
    >
      <Kicker className="mb-1.5">głosowanie · {v.time}</Kicker>
      <div
        className="font-serif italic font-medium"
        style={{
          fontSize: 22,
          color: accent,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {v.result}
      </div>
      {v.subtitle && (
        <div
          className="font-sans"
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            marginBottom: 8,
          }}
        >
          {v.subtitle}
        </div>
      )}
      <div
        className="font-sans"
        style={{ fontSize: 12, color: "var(--secondary-foreground)", marginBottom: 10 }}
      >
        większością <b>{v.za}–{v.przeciw}</b>, różnica {v.margin}
      </div>

      <div
        className="flex"
        style={{ height: 8, border: "1px solid var(--border)" }}
        aria-hidden
      >
        <div style={{ width: `${(v.za / 460) * 100}%`, background: "var(--success)" }} />
        <div style={{ width: `${(v.przeciw / 460) * 100}%`, background: "var(--destructive)" }} />
        <div style={{ width: `${(v.wstrzym / 460) * 100}%`, background: "var(--warning)" }} />
        <div style={{ width: `${(v.nieob / 460) * 100}%`, background: "var(--border)" }} />
      </div>

      {v.byClub && (
        <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {Object.entries(v.byClub).map(([club, cb]) => {
            const total = (cb.za + cb.pr + cb.ws + Math.max(0, cb.nb)) || 1;
            return (
              <div key={club} title={`${club}: ZA ${cb.za}, PR ${cb.pr}, WS ${cb.ws}`}>
                <div
                  className="font-mono"
                  style={{
                    fontSize: 8.5,
                    color: "var(--secondary-foreground)",
                    fontWeight: 700,
                    marginBottom: 2,
                  }}
                >
                  {club.slice(0, 4)}
                </div>
                <div className="flex" style={{ height: 4 }} aria-hidden>
                  <div style={{ width: `${(cb.za / total) * 100}%`, background: "var(--success)" }} />
                  <div style={{ width: `${(cb.pr / total) * 100}%`, background: "var(--destructive)" }} />
                  <div style={{ width: `${(cb.ws / total) * 100}%`, background: "var(--warning)" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        className="mt-3 font-mono uppercase"
        style={{
          fontSize: 10,
          color: "var(--destructive-deep)",
          letterSpacing: "0.14em",
        }}
      >
        całe głosowanie →
      </div>
    </div>
  );
}

function QuoteMini({ q }: { q: ViralQuote }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderLeft: "3px solid var(--destructive-deep)",
        background: "var(--secondary)",
      }}
    >
      <Kicker className="mb-2">cytat punktu</Kicker>
      <p
        className="font-serif italic m-0 mb-2.5"
        style={{
          fontSize: 15,
          lineHeight: 1.4,
          color: "var(--foreground)",
          textWrap: "pretty",
        }}
      >
        „{q.text}”
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <MPAvatarPhoto name={q.speaker} size={28} />
        <div
          className="font-sans"
          style={{ fontSize: 11.5, color: "var(--secondary-foreground)" }}
        >
          <b style={{ color: "var(--foreground)" }}>{q.speaker}</b>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span style={{ color: "var(--muted-foreground)" }}>{q.function}</span>
            {q.club && <ClubBadge klub={q.club} size="xs" />}
          </div>
        </div>
      </div>
    </div>
  );
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
        className="font-serif italic"
        style={{ fontSize: 14.5, lineHeight: 1.4 }}
      >
        Punkt rozpocznie się ok.{" "}
        <b style={{ color: "var(--foreground)", fontStyle: "normal" }}>{p.timeStart}</b>.
        Wracaj po odświeżenie.
      </div>
    </div>
  );
}

function PunktRow({ p }: { p: AgendaPoint }) {
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
        {/* Rail */}
        <div>
          <div
            className="font-serif italic font-medium"
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
              fontSize: 10,
              color: "var(--muted-foreground)",
              letterSpacing: "0.1em",
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
              className="font-mono uppercase mt-3"
              style={{
                fontSize: 9.5,
                color: "var(--destructive-deep)",
                letterSpacing: "0.16em",
              }}
            >
              ● trwa
            </div>
          )}
          {p.planned && (
            <div
              className="font-mono uppercase mt-3"
              style={{
                fontSize: 9.5,
                color: "var(--muted-foreground)",
                letterSpacing: "0.16em",
              }}
            >
              ○ planowany
            </div>
          )}
        </div>

        {/* Center */}
        <PunktCenter p={p} />

        {/* Right */}
        <div>
          {p.vote ? (
            <VoteMini v={p.vote} />
          ) : p.viralQuote ? (
            <QuoteMini q={p.viralQuote} />
          ) : p.planned ? (
            <PlannedMini p={p} />
          ) : null}
        </div>
      </div>

      {/* Mobile stacked */}
      <div className="md:hidden">
        <div className="flex items-baseline gap-3 mb-3">
          <span
            className="font-serif italic font-medium"
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
              fontSize: 10,
              color: "var(--muted-foreground)",
              letterSpacing: "0.1em",
              lineHeight: 1.5,
            }}
          >
            {p.timeStart}—{p.timeEnd} · {p.durMin} min
            {p.ongoing && (
              <span
                className="ml-2 uppercase"
                style={{
                  color: "var(--destructive-deep)",
                  letterSpacing: "0.16em",
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
                  letterSpacing: "0.16em",
                }}
              >
                ○ planowany
              </span>
            )}
          </div>
        </div>
        <PunktCenter p={p} />
        <div className="mt-5">
          {p.vote ? (
            <VoteMini v={p.vote} />
          ) : p.viralQuote ? (
            <QuoteMini q={p.viralQuote} />
          ) : p.planned ? (
            <PlannedMini p={p} />
          ) : null}
        </div>
      </div>
    </li>
  );
}

function PunktCenter({ p }: { p: AgendaPoint }) {
  return (
    <div className="min-w-0">
      <div className="flex gap-1.5 mb-2.5 flex-wrap">
        {p.stages.map((s) => (
          <StageBadge key={s} label={s} />
        ))}
        {p.prints.map((d) => (
          <PrintRef key={`${d.term}-${d.number}`} term={d.term} number={d.number} />
        ))}
        {p.procesy.map((pr) => (
          <ProcessRef key={`${pr.term}-${pr.number}`} term={pr.term} number={pr.number} />
        ))}
      </div>

      <h3
        className="font-serif font-medium m-0 mb-2"
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
      <p
        className="font-serif m-0 mb-3.5"
        style={{
          fontSize: 14.5,
          lineHeight: 1.55,
          color: "var(--secondary-foreground)",
          textWrap: "pretty",
        }}
      >
        {p.plainSummary}
      </p>

      <details className="mb-4">
        <summary
          className="cursor-pointer font-mono uppercase"
          style={{
            fontSize: 10,
            color: "var(--muted-foreground)",
            letterSpacing: "0.14em",
            listStyle: "none",
          }}
        >
          ▸ pełny urzędowy tytuł
        </summary>
        <p
          className="font-serif italic mt-2 mb-0"
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
          className="flex items-center gap-x-5 gap-y-2 flex-wrap font-mono uppercase"
          style={{
            fontSize: 10.5,
            color: "var(--muted-foreground)",
            letterSpacing: "0.1em",
          }}
        >
          <span>
            <b style={{ color: "var(--foreground)", fontWeight: 700 }}>
              {p.stats.wypowiedzi}
            </b>{" "}
            wypowiedzi
          </span>
          <span>
            <b style={{ color: "var(--foreground)", fontWeight: 700 }}>
              {p.stats.mowcy}
            </b>{" "}
            mówców
          </span>
          {p.stats.glosowania > 0 && (
            <span>
              <b style={{ color: "var(--foreground)", fontWeight: 700 }}>
                {p.stats.glosowania}
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

      {!p.planned && <ToneBar tones={p.tones} />}
    </div>
  );
}

export function AgendaList() {
  const [filter, setFilter] = useState<FilterId>("all");

  const counts: Record<FilterId, number> = {
    all: MOCK.punkty.length,
    done: MOCK.punkty.filter((p) => !p.planned).length,
    planned: MOCK.punkty.filter((p) => p.planned).length,
    vote: MOCK.punkty.filter((p) => !!p.vote).length,
    flagship: MOCK.punkty.filter((p) => p.importance === "flagship").length,
  };

  const visible = MOCK.punkty.filter(FILTERS.find((f) => f.id === filter)!.pred);

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
            className="font-mono uppercase self-center mr-1"
            style={{
              fontSize: 10,
              color: "var(--muted-foreground)",
              letterSpacing: "0.16em",
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
            <PunktRow key={p.ord} p={p} />
          ))}
        </ol>
      </div>
    </section>
  );
}
