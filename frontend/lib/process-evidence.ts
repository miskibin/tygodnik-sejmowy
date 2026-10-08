import type { LinkedVoting, ProcessStage, PrintDetail, ProcessOutcome } from "@/lib/db/prints";
import { stageLabel } from "@/lib/stages";

/** Compare dates in the institution's timezone, including date-only source values. */
export function warsawDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function recordedStages(stages: ProcessStage[], today = warsawDay()): ProcessStage[] {
  return stages.filter(s => s.depth === 0 && !!s.stageDate && s.stageDate.slice(0, 10) <= today)
    .sort((a, b) => a.stageDate!.localeCompare(b.stageDate!) || a.ord - b.ord);
}

/** Voting numbers restart at each sitting; a vote belongs to its own motion. */
export function chronologicalVotings(votes: LinkedVoting[]): LinkedVoting[] {
  return [...votes].sort((a, b) => a.date.localeCompare(b.date) || a.sitting - b.sitting || a.votingNumber - b.votingNumber);
}

export function latestProcessVoting(votes: LinkedVoting[]): LinkedVoting | null {
  return chronologicalVotings(votes).at(-1) ?? null;
}

/** Same-day coincidence is not evidence that a motion belongs to this stage. */
export function stageVoting(stage: ProcessStage, votes: LinkedVoting[]): LinkedVoting | null {
  const number = stage.voting?.votingNumber;
  const sitting = stage.voting?.sitting ?? stage.sittingNum;
  if (number == null || sitting == null) return null;
  return votes.find(v => v.sitting === sitting && v.votingNumber === number) ?? null;
}

export function processStatus(print: Pick<PrintDetail, "documentCategory">, outcome: ProcessOutcome | null, stages: ProcessStage[]): string | null {
  if (outcome?.act?.publishedAt) return outcome.act.eliId.startsWith("MP/") ? "Opublikowano w Monitorze Polskim" : "Opublikowano w Dzienniku Ustaw";
  const latest = recordedStages(stages).at(-1);
  if (latest) return stageLabel(latest.stageType, latest.stageName);
  if (outcome?.closureDate) return "Postępowanie zakończone";
  if (outcome?.passed) return print.documentCategory === "projekt_ustawy" ? "Uchwalono — publikacja niepotwierdzona w danych" : "Przyjęto — brak dalszych etapów w danych";
  return null;
}
