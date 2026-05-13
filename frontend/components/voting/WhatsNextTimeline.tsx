import Link from "next/link";
import type { PredictedStage } from "@/lib/voting/predict_stages";
import { computeBillOutcome, billAdvancesToSenate, type BillOutcome } from "@/lib/voting/bill_outcome";
import type { MotionPolarity } from "@/lib/promiseAlignment";
import type { VotingPageData } from "@/lib/db/voting";

type Props = {
  stages: PredictedStage[];
  promiseLink: VotingPageData["promiseLink"];
  passed: boolean;
  // Issue #25: when this vote is a procedural motion (wniosek o odrzucenie,
  // poprawka, etc.) the bill-level outcome diverges from `passed`. Optional
  // for back-compat; falls back to legacy `passed`-only copy when omitted.
  motionPolarity?: MotionPolarity | null;
};

const PL_MONTHS = [
  "sty",
  "lut",
  "mar",
  "kwi",
  "maj",
  "cze",
  "lip",
  "sie",
  "wrz",
  "paź",
  "lis",
  "gru",
];

function fmtDate(d: Date): string {
  return `${d.getDate()} ${PL_MONTHS[d.getMonth()]}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function SectionHead({
  label,
  title,
  subtitle,
}: {
  label: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className="flex items-baseline flex-wrap"
      style={{
        marginBottom: 32,
        gap: 24,
        borderBottom: "2px solid var(--rule)",
        paddingBottom: 18,
      }}
    >
      <span
        className="font-serif italic"
        style={{
          fontSize: 36,
          color: "var(--destructive)",
          lineHeight: 1,
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <h2
        className="font-serif m-0"
        style={{
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: "-0.018em",
          lineHeight: 1,
          color: "var(--foreground)",
        }}
      >
        {title}.
      </h2>
      {subtitle && (
        <span
          className="font-sans ml-auto"
          style={{ fontSize: 12, color: "var(--muted-foreground)" }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}

function StageItem({ stage }: { stage: PredictedStage }) {
  const isPastOrCurrent = stage.key === "sejm" || stage.current;
  const barColor = stage.current ? "var(--destructive)" : "var(--border)";
  const dotBg = isPastOrCurrent ? "var(--destructive)" : "var(--background)";
  const dotBorder = isPastOrCurrent ? "var(--destructive)" : "var(--border)";

  let dateLabel: string;
  if (stage.key === "senate" && stage.expectedDate == null) {
    dateLabel = `do ${fmtDate(stage.deadlineDate)}`;
  } else if (stage.expectedDate) {
    dateLabel = fmtDate(stage.expectedDate);
  } else {
    dateLabel = fmtDate(stage.deadlineDate);
  }

  const showDeadlineSuffix =
    stage.expectedDate != null &&
    !sameDay(stage.expectedDate, stage.deadlineDate);

  return (
    <li style={{ position: "relative", paddingRight: 24 }}>
      <div
        style={{
          height: 2,
          background: barColor,
          marginBottom: 14,
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: -5,
            left: 0,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: dotBg,
            border: `2px solid ${dotBorder}`,
          }}
        />
      </div>
      <div
        className="font-mono"
        style={{
          fontSize: 11,
          color: "var(--destructive)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {dateLabel}
      </div>
      {showDeadlineSuffix && stage.expectedDate && (
        <div
          className="font-mono"
          style={{
            fontSize: 10,
            color: "var(--border)",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          najpóźniej do {fmtDate(stage.deadlineDate)}
        </div>
      )}
      <p
        className="font-serif m-0"
        style={{
          fontSize: 16,
          lineHeight: 1.5,
          color: "var(--secondary-foreground)",
          textWrap: "pretty",
        }}
      >
        {stage.detail}
        {stage.constitutionRef && (
          <span style={{ color: "var(--border)", fontStyle: "italic" }}>
            {" "}
            (Konst. {stage.constitutionRef})
          </span>
        )}
      </p>
    </li>
  );
}

const CLOSED_COPY: Record<Exclude<BillOutcome, "passed">, { subtitle: string; line: string }> = {
  rejected: {
    subtitle: "proces zamknięty",
    line: "Ustawa odrzucona — proces zamknięty.",
  },
  continues: {
    // Failed "wniosek o odrzucenie" — bill survives and goes to committee.
    // Senate/President timeline doesn't apply yet; show why the timeline
    // stops here instead of pretending the law was rejected.
    subtitle: "projekt wraca do dalszych prac",
    line: "Wniosek o odrzucenie nie uzyskał większości — projekt skierowany do dalszej pracy w komisji. Dalsze etapy zostaną wyznaczone po kolejnych głosowaniach.",
  },
  indeterminate: {
    subtitle: "głosowanie proceduralne",
    line: "Głosowanie nad wnioskiem proceduralnym — etap projektu w Sejmie bez zmian.",
  },
};

export default function WhatsNextTimeline({
  stages,
  promiseLink,
  passed,
  motionPolarity,
}: Props) {
  const outcome: BillOutcome =
    motionPolarity === undefined
      ? (passed ? "passed" : "rejected")
      : computeBillOutcome(motionPolarity, passed);

  if (!billAdvancesToSenate(outcome)) {
    // `outcome` here is narrowed: billAdvancesToSenate is true only for "passed",
    // so this branch is "rejected" | "continues" | "indeterminate".
    const copy = CLOSED_COPY[outcome as Exclude<BillOutcome, "passed">];
    return (
      <section
        className="px-4 sm:px-8 md:px-14 py-12 sm:py-16"
        style={{
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <SectionHead
            label="V"
            title="Co dalej z tą ustawą"
            subtitle={copy.subtitle}
          />
          <p
            className="font-serif italic m-0"
            style={{
              fontSize: 18,
              lineHeight: 1.5,
              color: "var(--secondary-foreground)",
            }}
          >
            {copy.line}
          </p>
        </div>
      </section>
    );
  }

  const visibleStages = stages.filter((s) => s.key !== "sejm");

  return (
    <section
      className="px-4 sm:px-8 md:px-14 py-12 sm:py-16"
      style={{
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionHead
          label="V"
          title="Co dalej z tą ustawą"
          subtitle="droga od Sejmu do Dziennika Ustaw"
        />
        <ol
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
          style={{ listStyle: "none", padding: 0, margin: 0, gap: 0 }}
        >
          {visibleStages.map((s) => (
            <StageItem key={s.key} stage={s} />
          ))}
        </ol>

        {promiseLink && (
          <div
            style={{
              marginTop: 36,
              padding: "22px 28px",
              background: "var(--muted)",
              borderLeft: "3px solid var(--destructive)",
            }}
          >
            <p
              className="font-serif italic m-0"
              style={{
                fontSize: 17,
                lineHeight: 1.55,
                color: "var(--foreground)",
              }}
            >
              Realizuje konkret{" "}
              <Link
                href={`/obietnice/${promiseLink.party_code}`}
                style={{
                  color: "var(--destructive-deep)",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                }}
              >
                {promiseLink.party_code}
              </Link>{" "}
              z kampanii: „{promiseLink.title}".
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
