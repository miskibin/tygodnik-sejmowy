import { stageLabel } from "@/lib/stages";
import type { LinkedCommitteeSitting, ProcessStage } from "@/lib/db/prints";

function SectionHead({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div className="mb-5 flex items-baseline gap-4 border-b border-border pb-3">
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

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Nagłówek sekcji: „5 posiedzeń”, „2 posiedzenia”, „1 posiedzenie”. */
function committeeSectionSubtitle(count: number): string {
  if (count === 1) return "1 posiedzenie";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} posiedzenia`;
  }
  return `${count} posiedzeń`;
}

const COMMITTEE_STAGE_TYPES = new Set(["CommitteeWork", "CommitteeReport", "Reading"]);

type KomisjaRowData = {
  date: string | null;
  title: string;
  subtitle: string | null;
  stageTag: string | null;
  sourceTag: string | null;
  videoPlayerLink: string | null;
};

function committeeStatusLabel(status: LinkedCommitteeSitting["status"]): string | null {
  if (status === "FINISHED") return "zakończone";
  if (status === "ONGOING") return "w toku";
  if (status === "PLANNED") return "zaplanowane";
  return null;
}

function rowsFromRealSittings(sittings: LinkedCommitteeSitting[]): KomisjaRowData[] {
  return sittings.map((s) => {
    const status = committeeStatusLabel(s.status);
    const details = [
      `nr ${s.sittingNum}`,
      s.room ? `sala ${s.room}` : null,
      status,
    ].filter(Boolean);
    return {
      date: s.date,
      title: s.committeeName || `Komisja ${s.committeeCode}`,
      subtitle: details.length > 0 ? details.join(" · ") : null,
      stageTag: `druk nr ${s.matchedPrintNumber}`,
      sourceTag: "w agendzie",
      videoPlayerLink: s.videoPlayerLink,
    };
  });
}

function rowsFromProcessStages(stages: ProcessStage[]): KomisjaRowData[] {
  return stages
    .filter((s) => COMMITTEE_STAGE_TYPES.has(s.stageType))
    .map((s) => {
      const label = stageLabel(s.stageType, s.stageName);
      return {
        date: s.stageDate,
        title: label,
        subtitle: s.stageName && s.stageName !== label ? s.stageName : null,
        stageTag: s.depth > 0 ? `etap ${s.depth}` : null,
        sourceTag: null,
        videoPlayerLink: null,
      };
    });
}

export function Komisje({
  stages,
  committeeSittings,
}: {
  stages: ProcessStage[];
  committeeSittings: LinkedCommitteeSitting[];
}) {
  const rows =
    committeeSittings.length > 0
      ? rowsFromRealSittings(committeeSittings)
      : rowsFromProcessStages(stages);
  if (rows.length === 0) return null;

  return (
    <section
      className="py-12 px-3 md:px-4 lg:px-5 border-b border-border"
      style={{ background: "var(--muted)" }}
    >
      <div className="max-w-[1280px] mx-auto">
        <SectionHead title="Posiedzenia komisji" subtitle={committeeSectionSubtitle(rows.length)} />

        <ol className="list-none p-0 m-0 mt-1 md:mt-2 relative">
          <div
            className="absolute top-2 bottom-3 w-px"
            style={{ left: 96, background: "var(--border)" }}
          />
          {rows.map((k, i) => (
            <KomisjaRow key={`${k.date ?? "pending"}-${k.title}-${i}`} row={k} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function KomisjaRow({ row }: { row: KomisjaRowData }) {
  const pending = !row.date;
  return (
    <li
      className="grid py-4.5 border-b border-border relative"
      style={{
        gridTemplateColumns: "96px 1fr",
        gap: 0,
        paddingTop: 16,
        paddingBottom: 16,
      }}
    >
      <div className="pr-5 text-right relative">
        <div
          className="font-mono font-medium"
          style={{ fontSize: 13, color: pending ? "var(--muted-foreground)" : "var(--foreground)" }}
        >
          {pending ? "oczekuje" : shortDate(row.date)}
        </div>
        <div
          className="absolute rounded-full"
          style={{
            right: -7,
            top: 6,
            width: 13,
            height: 13,
            background: pending ? "var(--muted)" : "var(--foreground)",
            border: pending ? "1px dashed var(--muted-foreground)" : "3px solid var(--muted)",
            boxShadow: pending ? "none" : "0 0 0 1px var(--foreground)",
          }}
        />
      </div>

      <div className="pl-6">
        <div className="flex items-baseline gap-3 flex-wrap mb-1">
          <h3
            className="font-serif font-medium m-0 text-foreground"
            style={{ fontSize: 18, letterSpacing: "-0.005em" }}
          >
            {row.title}
          </h3>
          {row.stageTag && (
            <span
              className="font-mono uppercase"
              style={{
                fontSize: 10,
                color: "var(--muted-foreground)",
                letterSpacing: "0.12em",
              }}
            >
              {row.stageTag}
            </span>
          )}
          {row.sourceTag && (
            <span
              className="font-sans not-italic normal-case"
              style={{
                fontSize: 11,
                color: "var(--muted-foreground)",
                letterSpacing: "0.02em",
              }}
            >
              {row.sourceTag}
            </span>
          )}
        </div>
        {row.subtitle && (
          <p
            className="font-serif m-0 mb-1.5"
            style={{
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "var(--secondary-foreground)",
              textWrap: "pretty" as never,
              maxWidth: 760,
            }}
          >
            {row.subtitle}
          </p>
        )}
        {row.videoPlayerLink && (
          <a
            href={row.videoPlayerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="font-sans underline decoration-dotted underline-offset-4 hover:decoration-solid"
            style={{
              fontSize: 12.5,
              color: "var(--destructive-deep)",
              letterSpacing: "0",
            }}
          >
            Nagranie z posiedzenia
          </a>
        )}
      </div>
    </li>
  );
}
