"use client";

import { useState } from "react";
import { stageLabel } from "@/lib/stages";
import type { LinkedVoting, ProcessStage } from "@/lib/db/prints";

// Stage display state derived from data:
//  - done    → has a stageDate that is in the past, sequence still has later
//              dated entries OR explicitly ended (End/Withdrawn/Rejected)
//  - current → the last dated stage when the process is still open
//  - future  → no stageDate
type StationStatus = "done" | "current" | "future";

type Station = {
  ord: number;
  stage: string;
  date: string | null;
  actor: string | null;
  note: string;
  status: StationStatus;
  branch: { vote: number; label: string; result: string } | null;
};

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
}

function stageActor(stageType: string): string | null {
  switch (stageType) {
    case "Start":
      return "Wnioskodawca";
    case "Referral":
    case "ReadingReferral":
      return "Marszałek Sejmu";
    case "Reading":
    case "SejmReading":
    case "Voting":
      return "Sejm · plenum";
    case "CommitteeWork":
    case "CommitteeReport":
      return "Komisja";
    case "SenatePosition":
    case "SenatePositionConsideration":
    case "SenateAmendments":
      return "Senat";
    case "ToPresident":
    case "PresidentSignature":
    case "PresidentVeto":
    case "Veto":
    case "PresidentMotionConsideration":
      return "Prezydent";
    case "Promulgation":
      return "Dz.U.";
    case "ConstitutionalTribunal":
      return "TK";
    case "Opinion":
    case "ExpertOpinion":
    case "GovermentPosition":
    case "GovernmentPosition":
      return "Opinia";
    default:
      return null;
  }
}

function stageNote(s: ProcessStage): string {
  if (s.decision) return s.decision;
  if (s.voting?.title) return s.voting.title;
  return s.stageName || stageLabel(s.stageType, s.stageName);
}

function compactStageLabel(s: ProcessStage): string {
  const full = stageLabel(s.stageType, s.stageName);
  const reading = full.match(/\b([ivx]+)\s+czytanie\b/i);
  if (reading) return `${reading[1].toUpperCase()} czytanie`;
  return full;
}

// Attach a vote-branch indicator to a station when a rejection / amendment
// motion exists in relatedVotings with a matching date. Only "reject" /
// "amendment" polarities surface as a branch — "pass" votings are
// represented by the station node itself, not a hanging branch.
function pickBranch(date: string | null, votings: LinkedVoting[]): Station["branch"] {
  if (!date) return null;
  const day = date.slice(0, 10);
  const hit = votings.find((v) => {
    if (!v.date) return false;
    if (v.date.slice(0, 10) !== day) return false;
    return v.motionPolarity === "reject" || v.motionPolarity === "amendment" || v.motionPolarity === "minority";
  });
  if (!hit) return null;
  const passed = hit.majorityVotes != null ? hit.yes >= hit.majorityVotes : hit.yes > hit.no;
  const label =
    hit.motionPolarity === "reject"
      ? "wniosek o odrzucenie"
      : hit.motionPolarity === "amendment"
      ? "poprawki"
      : "wniosek mniejszości";
  const result = passed ? "przyjęty" : "odrzucony";
  return { vote: hit.votingNumber, label, result };
}

function buildStations(stages: ProcessStage[], votings: LinkedVoting[]): Station[] {
  const top = stages.filter((s) => s.depth === 0);
  const lastDatedIdx = (() => {
    for (let i = top.length - 1; i >= 0; i--) {
      if (top[i].stageDate) return i;
    }
    return -1;
  })();
  return top.map((s, i) => {
    const hasDate = !!s.stageDate;
    const isLastDated = i === lastDatedIdx;
    const status: StationStatus = !hasDate ? "future" : isLastDated ? "current" : "done";
    return {
      ord: s.ord,
      stage: compactStageLabel(s),
      date: s.stageDate,
      actor: stageActor(s.stageType),
      note: stageNote(s),
      status,
      branch: pickBranch(s.stageDate, votings),
    };
  });
}

// ── Future-phase projection ──────────────────────────────────────────
// The DB only stores stages that actually happened (or are scheduled).
// To show citizens the *remaining* path the bill will travel, we layer a
// canonical Sejm legislative path on top of the real stations: find the
// highest phase already reached, then append the unreached phases as
// dashed "future" stations.
type PhaseKey =
  | "intake"
  | "reading_referral"
  | "reading_1"
  | "committee"
  | "reading_2"
  | "reading_3"
  | "senate"
  | "president"
  | "promulgation";

const PHASE_ORDER: PhaseKey[] = [
  "intake",
  "reading_referral",
  "reading_1",
  "committee",
  "reading_2",
  "reading_3",
  "senate",
  "president",
  "promulgation",
];

const PHASE_META: Record<PhaseKey, { label: string; actor: string; note: string }> = {
  intake: { label: "Wpłynięcie", actor: "Wnioskodawca", note: "Projekt wpływa do Sejmu." },
  reading_referral: {
    label: "Skier. do czytania",
    actor: "Marszałek Sejmu",
    note: "Marszałek kieruje projekt do pierwszego czytania.",
  },
  reading_1: {
    label: "I czytanie",
    actor: "Sejm · plenum",
    note: "Pierwsze czytanie projektu w Sejmie lub komisji.",
  },
  committee: {
    label: "Praca w komisji",
    actor: "Komisja sejmowa",
    note: "Rozpatrzenie projektu i zgłaszanie poprawek.",
  },
  reading_2: {
    label: "II czytanie",
    actor: "Sejm · plenum",
    note: "Debata, zgłaszanie poprawek z plenum.",
  },
  reading_3: {
    label: "III czytanie",
    actor: "Sejm · plenum",
    note: "Głosowanie nad całością projektu.",
  },
  senate: {
    label: "Senat",
    actor: "30 dni na decyzję",
    note: "Senat przyjmie, odrzuci lub zaproponuje poprawki.",
  },
  president: {
    label: "Prezydent",
    actor: "21 dni",
    note: "Podpis, weto albo skierowanie do Trybunału Konstytucyjnego.",
  },
  promulgation: {
    label: "Dz.U.",
    actor: "wejście w życie",
    note: "14 dni od ogłoszenia, chyba że ustawa stanowi inaczej.",
  },
};

// Map an existing process stage to a canonical phase, when possible.
// Anything not recognized (Opinia, GovermentPosition, Withdrawn, …)
// returns null and is ignored for the projection.
function phaseOf(s: ProcessStage): PhaseKey | null {
  const t = s.stageType;
  const n = (s.stageName || "").toLowerCase();
  if (t === "Start") return "intake";
  if (t === "Referral" || t === "ReadingReferral") return "reading_referral";
  if (t === "Reading") return "reading_1";
  if (t === "SejmReading" || t === "Voting") {
    if (/\biii\s+czytanie\b/.test(n)) return "reading_3";
    if (/\bii\s+czytanie\b/.test(n)) return "reading_2";
    if (/\bi\s+czytanie\b/.test(n)) return "reading_1";
    return "reading_2";
  }
  if (t === "CommitteeWork" || t === "CommitteeReport") return "committee";
  if (t === "SenatePosition" || t === "SenateAmendments" || t === "SenatePositionConsideration")
    return "senate";
  if (
    t === "ToPresident" ||
    t === "PresidentSignature" ||
    t === "PresidentVeto" ||
    t === "Veto" ||
    t === "PresidentMotionConsideration"
  )
    return "president";
  if (t === "Promulgation") return "promulgation";
  return null;
}

function projectFutureStations(stages: ProcessStage[]): Station[] {
  const phases = stages
    .filter((s) => s.depth === 0)
    .map(phaseOf)
    .filter((p): p is PhaseKey => p !== null);
  if (phases.length === 0) return [];
  const maxIdx = Math.max(...phases.map((p) => PHASE_ORDER.indexOf(p)));
  if (maxIdx < 0 || maxIdx >= PHASE_ORDER.length - 1) return [];
  return PHASE_ORDER.slice(maxIdx + 1).map((key, i) => {
    const meta = PHASE_META[key];
    return {
      ord: 10_000 + i,
      stage: meta.label,
      date: null,
      actor: meta.actor,
      note: meta.note,
      status: "future" as StationStatus,
      branch: null,
    };
  });
}

export function Timeline({
  stages,
  votings,
  processStillOpen,
}: {
  stages: ProcessStage[];
  votings: LinkedVoting[];
  processStillOpen: boolean;
}) {
  const real = buildStations(stages, votings);
  const future = processStillOpen ? projectFutureStations(stages) : [];
  const stations: Station[] = [...real, ...future];
  const hasFailedTerminal = stages.some(
    (s) => s.depth === 0 && (s.stageType === "Rejected" || s.stageType === "Withdrawn"),
  );
  const currentTone = processStillOpen
    ? "var(--warning)"
    : hasFailedTerminal
    ? "var(--destructive)"
    : "var(--success)";
  const currentIdx = stations.findIndex((s) => s.status === "current");
  const [hover, setHover] = useState<number>(currentIdx >= 0 ? currentIdx : stations.length - 1);

  if (stations.length === 0) {
    return (
      <section className="px-0 py-10 border-b border-border" style={{ background: "var(--muted)" }}>
        <div className="max-w-[1280px] mx-auto px-4 md:px-8 lg:px-14">
          <SectionHead title="Ścieżka projektu" />
          <p className="font-serif italic text-muted-foreground">
            Brak etapów procesu legislacyjnego dla tego druku.
          </p>
        </div>
      </section>
    );
  }

  const active = stations[hover] ?? stations[stations.length - 1];

  return (
    <section className="py-12 md:py-14 border-b border-border" style={{ background: "var(--muted)" }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 lg:px-14">
        <SectionHead title="Ścieżka projektu" />

        {/* Horizontal station strip — md+ */}
        <div
          className="hidden md:grid mt-2 md:mt-3"
          style={{ gridTemplateColumns: `repeat(${stations.length}, minmax(0, 1fr))` }}
        >
          {stations.map((s, i) => (
            <StationCell
              key={i}
              index={i}
              s={s}
              first={i === 0}
              last={i === stations.length - 1}
              prevDone={i > 0 && stations[i - 1].status !== "future"}
              hover={hover === i}
              currentTone={currentTone}
              onHover={() => setHover(i)}
            />
          ))}
        </div>

        {/* Vertical stack — mobile */}
        <ol className="md:hidden relative m-0 pl-0">
          <div className="absolute left-3 top-3 bottom-3 w-px bg-border" />
          {stations.map((s, i) => (
            <StationRowMobile
              key={i}
              s={s}
              active={hover === i}
              last={i === stations.length - 1}
              currentTone={currentTone}
              onClick={() => setHover(i)}
            />
          ))}
        </ol>

        <ActiveDetail s={active} />
      </div>
    </section>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
      <div className="mb-6 md:mb-7 flex items-baseline gap-4 border-b border-border pb-3">
      <h2
        className="font-serif font-medium text-foreground m-0"
        style={{ fontSize: 22, lineHeight: 1, letterSpacing: "-0.015em" }}
      >
        {title}
      </h2>
      {subtitle && <span className="font-sans text-[11.5px] text-muted-foreground ml-auto">{subtitle}</span>}
    </div>
  );
}

function StationCell({
  index,
  s,
  first,
  last,
  prevDone,
  hover,
  currentTone,
  onHover,
}: {
  index: number;
  s: Station;
  first: boolean;
  last: boolean;
  prevDone: boolean;
  hover: boolean;
  currentTone: string;
  onHover: () => void;
}) {
  const done = s.status === "done";
  const current = s.status === "current";
  const future = s.status === "future";
  const nodeSize = current ? 20 : 13;
  const segLeftColor = prevDone ? "var(--foreground)" : "var(--border)";
  const segRightColor = done ? "var(--foreground)" : "var(--border)";

  return (
    <div
      onMouseEnter={onHover}
      onFocus={onHover}
      tabIndex={0}
      aria-current={current ? "step" : undefined}
      className="flex flex-col items-stretch cursor-pointer relative outline-none focus-visible:[&_.station-date]:underline"
    >
      {!last && (
        <div
          aria-hidden
          className="absolute right-0 top-[88px] bottom-8 w-px"
          style={{ background: hover ? "var(--rule)" : "var(--border)", opacity: 0.55 }}
        />
      )}
      {/* Branch slot — fixed height so all stations align */}
      <div className="h-24 relative">
        {s.branch && (
          <>
            <div
              className="absolute top-[56px] left-1/2 bottom-0 w-px"
              style={{ background: "var(--destructive)", transform: "translateX(-0.5px)" }}
            />
            <div
              className="absolute top-[48px] left-1/2 -translate-x-1/2 w-2.5 h-2.5"
              style={{ background: "var(--destructive)" }}
            />
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 font-mono uppercase px-2 py-1 leading-[1.2] text-center"
              style={{
                fontSize: 9.5,
                color: "var(--destructive-deep)",
                letterSpacing: "0.1em",
                background: "var(--muted)",
                width: "calc(100% - 8px)",
                maxWidth: 180,
                whiteSpace: "normal",
                textWrap: "pretty" as never,
              }}
            >
              głos. {s.branch.vote} · {s.branch.label} → <strong>{s.branch.result}</strong>
            </div>
          </>
        )}
      </div>

      <div
        className="text-center font-mono"
        style={{
          height: 12,
          fontSize: 9,
          color: current ? "var(--destructive)" : "var(--muted-foreground)",
          letterSpacing: "0.12em",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>

      {/* Stage label */}
      <div
        className="px-1.5 text-center font-serif font-medium flex items-start justify-center"
        style={{
          height: 42,
          fontSize: 14.5,
          color: done || current ? "var(--foreground)" : "var(--muted-foreground)",
          lineHeight: 1.15,
          letterSpacing: "-0.005em",
        }}
      >
        {s.stage}
      </div>

      {/* "TU JESTEŚMY" pin row — fixed height */}
      <div
        className="text-center font-mono"
        style={{
          height: 16,
          fontSize: 9.5,
          color: currentTone,
          letterSpacing: "0.16em",
        }}
      >
        {current ? "▼ TU JESTEŚMY" : ""}
      </div>

      {/* Node + track row */}
      <div className="relative h-[22px] flex items-center justify-center">
        {!first && (
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2"
            style={{ right: "50%", height: 2, background: segLeftColor }}
          />
        )}
        {!last && (
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2"
            style={{ left: "50%", height: 2, background: segRightColor }}
          />
        )}
        <div
          className="relative z-[2] rounded-full"
          style={{
            width: nodeSize,
            height: nodeSize,
            background: done ? "var(--foreground)" : current ? currentTone : "var(--muted)",
            border: future ? "1.5px dashed var(--muted-foreground)" : "3px solid var(--muted)",
            boxShadow: done
              ? "0 0 0 2px var(--foreground)"
              : current
              ? `0 0 0 2px ${currentTone}, 0 0 0 6px var(--highlight)`
              : "none",
            transition: "all 0.18s",
          }}
        />
      </div>

      <div
        className="station-date mt-3 text-center font-mono"
        style={{
          fontSize: 11,
          color: done ? "var(--foreground)" : current ? currentTone : "var(--muted-foreground)",
          letterSpacing: "0.04em",
          fontWeight: current ? 600 : 400,
        }}
      >
        {shortDate(s.date)}
      </div>

      <div
        className="mt-2 mx-3"
        style={{
          height: 2,
          background: hover ? (current ? currentTone : "var(--foreground)") : "transparent",
          transition: "background 0.15s",
        }}
      />
    </div>
  );
}

function StationRowMobile({
  s,
  active,
  last,
  currentTone,
  onClick,
}: {
  s: Station;
  active: boolean;
  last: boolean;
  currentTone: string;
  onClick: () => void;
}) {
  const done = s.status === "done";
  const current = s.status === "current";
  const future = s.status === "future";
  return (
    <li className="relative py-3.5 pl-8 pr-1 cursor-pointer select-none" onClick={onClick}>
      <span
        className="absolute top-[18px] left-[7px] rounded-full z-[1]"
        style={{
          width: 11,
          height: 11,
          background: done ? "var(--foreground)" : current ? currentTone : "var(--muted)",
          border: future ? "1.5px dashed var(--muted-foreground)" : "2px solid var(--muted)",
          boxShadow: current ? `0 0 0 2px ${currentTone}` : done ? "0 0 0 1px var(--foreground)" : "none",
        }}
      />
      <div
        className="font-mono uppercase mb-1"
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          color: current ? currentTone : "var(--muted-foreground)",
        }}
      >
        {shortDate(s.date)}
        {current && <> &nbsp;·&nbsp; TU JESTEŚMY</>}
      </div>
      <div
        className="font-serif font-medium leading-tight"
        style={{
          fontSize: 17,
          color: done || current ? "var(--foreground)" : "var(--muted-foreground)",
          textDecoration: active ? "underline" : "none",
          textUnderlineOffset: 4,
        }}
      >
        {s.stage}
      </div>
      {!last && (
        <div
          className="mt-3"
          style={{
            height: 1,
            background: "var(--border)",
            opacity: 0.65,
          }}
        />
      )}
    </li>
  );
}

function ActiveDetail({ s }: { s: Station }) {
  return (
    <div
      className="mt-6 pl-5"
      style={{
        maxWidth: 820,
        borderLeft: `3px solid ${
          s.status === "current"
            ? "var(--destructive)"
            : s.status === "done"
            ? "var(--foreground)"
            : "var(--border)"
        }`,
      }}
    >
      <div
        className="font-mono uppercase mb-1"
        style={{
          fontSize: 11,
          color: s.status === "current" ? "var(--destructive)" : "var(--muted-foreground)",
          letterSpacing: "0.16em",
        }}
      >
        {shortDate(s.date)}
        {s.actor && <> &nbsp;·&nbsp; {s.actor}</>}
      </div>
      <div
        className="font-serif font-medium text-foreground mb-1.5"
        style={{ fontSize: 22, lineHeight: 1.2 }}
      >
        {s.stage}.
      </div>
      <p
        className="font-serif text-foreground m-0"
        style={{
          fontSize: 15.5,
          lineHeight: 1.55,
          color: "var(--secondary-foreground)",
          textWrap: "pretty" as never,
        }}
      >
        {s.note}
      </p>
      {s.branch && (
        <div
          className="mt-3 inline-flex items-center gap-2.5 font-mono uppercase px-2.5 py-1.5"
          style={{
            fontSize: 11,
            color: "var(--destructive-deep)",
            letterSpacing: "0.1em",
            background: "var(--highlight)",
          }}
        >
          ⇩ głosowanie nr {s.branch.vote} · {s.branch.label} → {s.branch.result}
        </div>
      )}
    </div>
  );
}
