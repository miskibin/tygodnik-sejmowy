"use client";

import { useMemo, useState } from "react";
import type { MpVoteRow, VoteValue } from "@/lib/db/posel-tabs";
import { VotingRow, type VotingRowVote } from "@/components/voting/VotingRow";

const VOTE_SHORT: Record<VoteValue, string> = {
  YES: "ZA",
  NO: "PRZ",
  ABSTAIN: "WSTRZ",
  ABSENT: "NIEOB",
  PRESENT: "OBEC",
};

// Maps view stage codes -> short Polish badge labels. Unknown codes pass
// through verbatim. 'Voting' (final vote on whole bill) gets special
// treatment elsewhere — it's rendered with accent + bolder type since it's
// the consequential roll-call, not the procedural noise around it.
const STAGE_LABEL: Record<string, string> = {
  Voting: "całość",
  CommitteeReport: "sprawozd.",
  SenatePosition: "Senat",
  Amendment: "poprawka",
  Procedural: "procedur.",
  Election: "wybór",
  Motion: "wniosek",
  FirstReading: "1 czyt",
  SecondReading: "2 czyt",
  ThirdReading: "3 czyt",
  Reading: "czytanie",
  SejmReading: "czytanie",
  ReadingReferral: "skierowanie",
  Referral: "skierowanie",
  CommitteeWork: "praca K.",
  End: "koniec",
  ToPresident: "Prezydent",
  PresidentSignature: "Prezydent",
  Opinion: "opinia",
  SenatePositionConsideration: "Senat",
  Veto: "weto",
};

const PAGE_SIZE = 50;

export function VotesList({ rows, dissentCount }: { rows: MpVoteRow[]; dissentCount: number }) {
  const [filter, setFilter] = useState<"all" | "dissent">("all");
  const [shown, setShown] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter(
      (r) =>
        r.clubWinner != null &&
        r.clubWinner !== r.vote &&
        (r.vote === "YES" || r.vote === "NO" || r.vote === "ABSTAIN")
    );
  }, [rows, filter]);

  const slice = filtered.slice(0, shown);
  const hasMore = shown < filtered.length;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-3">
        <div className="font-sans text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          Lista głosowań
        </div>
        <div className="flex gap-1.5 font-sans text-[12px]">
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setShown(PAGE_SIZE);
            }}
            className="px-2.5 py-1 rounded-full cursor-pointer transition-colors"
            style={{
              border: filter === "all" ? "1px solid var(--foreground)" : "1px solid var(--border)",
              background: filter === "all" ? "var(--foreground)" : "transparent",
              color: filter === "all" ? "var(--background)" : "var(--secondary-foreground)",
            }}
          >
            Wszystkie {rows.length}
          </button>
          <button
            type="button"
            onClick={() => {
              setFilter("dissent");
              setShown(PAGE_SIZE);
            }}
            className="px-2.5 py-1 rounded-full cursor-pointer transition-colors"
            style={{
              border: filter === "dissent" ? "1px solid var(--destructive)" : "1px solid var(--border)",
              background: filter === "dissent" ? "var(--destructive)" : "transparent",
              color: filter === "dissent" ? "var(--background)" : "var(--secondary-foreground)",
            }}
          >
            Wbrew klubowi {dissentCount}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="font-serif italic text-muted-foreground text-center py-8">
          {filter === "dissent"
            ? "Ten poseł nie odbiegał od linii klubu w żadnym głosowaniu."
            : "Brak głosowań."}
        </p>
      ) : (
        <>
          <ul>
            {slice.map((r) => {
              const dissent =
                r.clubWinner != null &&
                r.clubWinner !== r.vote &&
                (r.vote === "YES" || r.vote === "NO" || r.vote === "ABSTAIN");
              // Title hierarchy: print short_title > process title > raw voting title.
              // Process subline is redundant when print short_title already names
              // the bill — only surface it as hover tooltip, not a second line.
              const headline =
                r.printShortTitle?.trim() ||
                r.processTitle?.trim() ||
                r.title ||
                "(bez tytułu)";
              const tooltip =
                r.printShortTitle && r.processTitle && r.processTitle !== r.printShortTitle
                  ? `${headline} — ${r.processTitle}`
                  : headline;
              const stageLabel = r.stageType ? STAGE_LABEL[r.stageType] ?? r.stageType : null;
              const isFinal = r.stageType === "Voting";
              const dissentTooltip = dissent && r.clubWinner
                ? `Wbrew klubowi · linia klubu ${VOTE_SHORT[r.clubWinner]} (Za ${r.yes}, Przeciw ${r.no}, Wstrz. ${r.abstain})`
                : undefined;
              return (
                <VotingRow
                  key={r.votingId}
                  votingId={r.votingId}
                  date={r.date}
                  title={headline}
                  titleTooltip={tooltip}
                  yes={r.yes}
                  no={r.no}
                  abstain={r.abstain}
                  badge={stageLabel ? { label: stageLabel, tooltip: r.stageType ?? "" } : null}
                  mpVote={r.vote as VotingRowVote}
                  dissent={dissent ? { tooltip: dissentTooltip } : null}
                  isFinal={isFinal}
                />
              );
            })}
          </ul>
          {hasMore && (
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE_SIZE)}
                className="font-sans text-[12px] text-destructive underline decoration-dotted underline-offset-4 cursor-pointer"
              >
                Pokaż następne {Math.min(PAGE_SIZE, filtered.length - shown)} z {filtered.length - shown}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
