import { computeBillOutcome, billOutcomeLabel } from "./bill_outcome";
import type { MotionPolarity } from "@/lib/promiseAlignment";

export type PredictedStage = {
  key: "sejm" | "senate" | "president" | "promulgation";
  label: string;
  detail: string;
  // Only recorded event dates. Unknown dates must remain unknown.
  expectedDate: Date | null;
  deadlineDate: Date | null;
  constitutionRef?: string;
  current: boolean;
};

export type PredictInput = {
  sejmVoteDate: Date;
  toSenateDate?: Date | null;
  senatePositionDate?: Date | null;
  toPresidentDate?: Date | null;
  presidentSignatureDate?: Date | null;
  promulgationDate?: Date | null;
  passed: boolean;
  motionPolarity?: MotionPolarity | null;
  documentType?: string | null;
  // Unknown procedure or possible suspension: no calculated deadline.
  procedure?: "ordinary" | "urgent" | "budget" | "constitutional" | null;
  presidentialDeadlineSuspended?: boolean;
};

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export function predictStages(input: PredictInput): PredictedStage[] {
  const outcome = computeBillOutcome(input.motionPolarity ?? null, input.passed);
  const resolution = input.documentType === "RESOLUTION" || input.documentType === "projekt_uchwaly";
  const bill = input.documentType === "BILL" || input.documentType === "projekt_ustawy";
  const advances = outcome === "passed" && bill;
  const stages: PredictedStage[] = [{
    key: "sejm", label: resolution ? "Głosowanie nad uchwałą" : "Głosowanie w Sejmie",
    detail: resolution ? (input.passed ? "Sejm przyjął projekt uchwały" : "Projekt uchwały nie uzyskał większości") : bill ? billOutcomeLabel(outcome) : "Wynik dotyczy tego głosowania. Brak potwierdzonej ścieżki ustawy w danych.",
    expectedDate: input.sejmVoteDate, deadlineDate: null, current: !advances,
  }];
  if (!advances) return stages;
  const senateDays = { ordinary: 30, urgent: 14, budget: 20 };
  const presidentDays = { ordinary: 21, urgent: 7, budget: 7, constitutional: 21 };
  const procedure = input.procedure;
  stages.push({
    key: "senate", label: "Senat",
    detail: "Termin rozpatrzenia biegnie od przekazania ustawy Senatowi: zwykle 30 dni, w trybie pilnym 14, dla budżetu 20. Zmiana Konstytucji wymaga uchwalenia identycznego tekstu przez Senat w odrębnym trybie z art. 235; jego 60 dni liczy się od uchwalenia ustawy przez Sejm. Stanowisko Senatu może wymagać kolejnego głosowania Sejmu.",
    expectedDate: input.senatePositionDate ?? null,
    // Art. 235 has a separate procedure; do not apply the ordinary transmission rule.
    deadlineDate: procedure && procedure !== "constitutional" && input.toSenateDate ? addDays(input.toSenateDate, senateDays[procedure]) : null,
    current: !!input.toSenateDate && !input.senatePositionDate && !input.toPresidentDate,
  });
  stages.push({
    key: "president", label: "Prezydent",
    detail: "Termin biegnie od przedstawienia ustawy Prezydentowi: zwykle 21 dni, w trybie pilnym i dla budżetu 7. Weto lub skierowanie do TK wstrzymuje bieg terminu; dla budżetu i zmiany Konstytucji obowiązują odrębne reguły.",
    expectedDate: input.presidentSignatureDate ?? null,
    deadlineDate: procedure && input.toPresidentDate && !input.presidentialDeadlineSuspended && !input.presidentSignatureDate ? addDays(input.toPresidentDate, presidentDays[procedure]) : null,
    current: !!input.toPresidentDate && !input.presidentSignatureDate,
  });
  stages.push({
    key: "promulgation", label: "Publikacja w Dzienniku Ustaw",
    detail: "Ogłoszenie i wejście w życie to różne zdarzenia. Termin wejścia w życie ustala się z przepisów ogłoszonej ustawy; poszczególne przepisy mogą mieć różne daty.",
    expectedDate: input.promulgationDate ?? null, deadlineDate: null,
    current: !!input.presidentSignatureDate && !input.promulgationDate,
  });
  return stages;
}
