import { stageLabel } from "@/lib/stages";

type StageLike = {
  depth?: number;
  stageType: string | null;
  stageName: string;
  stageDate: string | null;
};

export type PassedProcessBanner = {
  title: string;
  detail: string;
  date: string | null;
};

const POST_SEJM_STAGE_TYPES = new Set([
  "SenatePosition",
  "SenatePositionConsideration",
  "SenateAmendments",
  "ToPresident",
  "PresidentSignature",
  "PresidentVeto",
  "Veto",
  "PresidentMotionConsideration",
  "ConstitutionalTribunal",
  "Promulgation",
]);

function latestTopLevelStage(stages: StageLike[]): StageLike | null {
  for (let i = stages.length - 1; i >= 0; i--) {
    const stage = stages[i];
    if ((stage.depth ?? 0) !== 0) continue;
    if (stage.stageDate) return stage;
  }
  return null;
}

function isSejmPassageStage(stage: StageLike | null): boolean {
  if (!stage) return false;
  if (stage.stageType !== "SejmReading") return false;
  const normalized = stage.stageName.toLowerCase();
  return normalized.includes("iii czytanie") || normalized.includes("uchwal");
}

export function getPassedProcessBanner(
  stages: StageLike[],
  closureDate: string | null,
): PassedProcessBanner {
  const latest = latestTopLevelStage(stages);
  const date = latest?.stageDate ?? closureDate;

  if (!latest || isSejmPassageStage(latest)) {
    return {
      title: "Uchwalono w Sejmie",
      detail: "kolejne etapy: Senat i Prezydent",
      date,
    };
  }

  if (latest.stageType === "PresidentSignature") {
    return {
      title: "Podpisana przez Prezydenta",
      detail: "oczekuje na publikację w dzienniku urzędowym",
      date,
    };
  }

  if (latest.stageType === "Promulgation") {
    return {
      title: "Opublikowano",
      detail: "ogłoszenie aktu jest już odnotowane w przebiegu procesu",
      date,
    };
  }

  if (POST_SEJM_STAGE_TYPES.has(latest.stageType ?? "")) {
    return {
      title: "Prace po uchwaleniu w Sejmie",
      detail: latest.stageName || stageLabel(latest.stageType),
      date,
    };
  }

  return {
    title: "Po uchwaleniu w Sejmie",
    detail: latest.stageName || stageLabel(latest.stageType),
    date,
  };
}

export function publicationJournalLabel(displayAddress: string | null | undefined): string {
  return displayAddress?.startsWith("M.P.") ? "Monitorze Polskim" : "Dzienniku Ustaw";
}
