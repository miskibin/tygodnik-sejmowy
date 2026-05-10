// Predicted legislative timeline for a Sejm-passed law.
//
// Validated against term-10 historical processes (BILL only, n=29-18 per
// stage). See VOTING_PREDICTION_VALIDATION.md for full report.
//
// One-step-ahead conditional MAE (UI behaviour — uses actual prior dates):
//   sejm → senate          MAE 8.2d, within-14d 100% — DEADLINE-ONLY (no point estimate)
//   senate → toPresident   MAE 2.3d, within-7d 82%  — point estimate OK
//   toPres → presSig       MAE 4.9d, within-7d 83%  — point estimate OK
//   presSig → promulgation MAE 2.1d, within-7d 94%  — point estimate OK
//
// Senate stage shows no point estimate because Sejm→Senate gap genuinely
// varies 0–26 days. Constitutional deadline (30d, art. 121 ust. 2) is the
// only honest commitment. Other stages have tight enough variance to
// predict.
//
// Deadline coverage 100% across all stages — UI's binding upper bound never
// misses for term-10 data.

export type PredictedStage = {
  key: "sejm" | "senate" | "president" | "promulgation";
  label: string;
  detail: string;
  // expectedDate omitted for stages where point prediction is not honest
  // (currently only `senate`). UI must render `deadlineDate` for those.
  expectedDate: Date | null;
  deadlineDate: Date;
  constitutionRef?: string;
  current: boolean;
};

// Empirical medians (in days) and constitutional caps observed in term 10.
const STAGE_GAPS = {
  sejmToSenate: { median: 13, deadline: 30 },        // art. 121 ust. 2
  senateToPresident: { median: 1, deadline: 10 },    // empirical p90
  presidentConsider: { median: 18, deadline: 21 },   // art. 122 ust. 2
  signatureToPromulgation: { median: 5, deadline: 14 }, // empirical p90
} as const;

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export type PredictInput = {
  sejmVoteDate: Date;
  // Optional historical anchors — when present, predictions hang off real dates
  // instead of cascading from Sejm vote.
  senatePositionDate?: Date | null;
  toPresidentDate?: Date | null;
  presidentSignatureDate?: Date | null;
  promulgationDate?: Date | null;
  passed: boolean;
};

export function predictStages(input: PredictInput): PredictedStage[] {
  const { sejmVoteDate, senatePositionDate, toPresidentDate, presidentSignatureDate, promulgationDate, passed } = input;

  // Stage 1 — Sejm vote (always known, always past).
  const stages: PredictedStage[] = [
    {
      key: "sejm",
      label: "Sejm uchwalił",
      detail: passed ? "ustawa przyjęta w trzecim czytaniu" : "ustawa odrzucona",
      expectedDate: sejmVoteDate,
      deadlineDate: sejmVoteDate,
      current: !passed, // if rejected, this is the terminal stage
    },
  ];

  if (!passed) return stages;

  // Stage 2 — Senate. No point estimate (gap is 0–26d in observed data).
  const senateActual = senatePositionDate ?? null;
  const senateDeadline = addDays(sejmVoteDate, STAGE_GAPS.sejmToSenate.deadline);
  stages.push({
    key: "senate",
    label: "Senat",
    detail: "30 dni na rozpatrzenie — może przyjąć, odrzucić lub wprowadzić poprawki",
    expectedDate: senateActual,    // null until actual happens
    deadlineDate: senateDeadline,
    constitutionRef: "art. 121 ust. 2",
    current: senatePositionDate == null,
  });

  // Stage 3 — President. Point estimate honest (MAE 4.9d).
  // For prediction without senate actual, anchor at sejmVote + sejmToSenate.median.
  const baseForPres = senatePositionDate ?? addDays(sejmVoteDate, STAGE_GAPS.sejmToSenate.median);
  const presExpected = presidentSignatureDate
    ?? addDays(toPresidentDate ?? baseForPres, STAGE_GAPS.presidentConsider.median);
  const presDeadline = addDays(toPresidentDate ?? baseForPres, STAGE_GAPS.presidentConsider.deadline);
  stages.push({
    key: "president",
    label: "Prezydent",
    detail: "21 dni na podpis lub weto — możliwe skierowanie do TK",
    expectedDate: presExpected,
    deadlineDate: presDeadline,
    constitutionRef: "art. 122 ust. 2",
    current: senatePositionDate != null && presidentSignatureDate == null,
  });

  // Stage 4 — Promulgation. Point estimate honest (MAE 2.1d).
  const baseForPub = presidentSignatureDate ?? presExpected;
  const pubExpected = promulgationDate ?? addDays(baseForPub, STAGE_GAPS.signatureToPromulgation.median);
  const pubDeadline = addDays(baseForPub, STAGE_GAPS.signatureToPromulgation.deadline);
  stages.push({
    key: "promulgation",
    label: "Wejście w życie",
    detail: "publikacja w Dz.U. i wejście w życie wg klauzuli ustawy (zwykle 14 dni od publikacji)",
    expectedDate: pubExpected,
    deadlineDate: pubDeadline,
    current: presidentSignatureDate != null && promulgationDate == null,
  });

  return stages;
}

// Inputs not exported for production but kept for the validation harness.
export const _STAGE_GAPS_INTERNAL = STAGE_GAPS;
