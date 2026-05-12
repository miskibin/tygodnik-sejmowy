import type { CommitteeSitting, AgendaItem } from "@/lib/db/committees";
import { AgendaList } from "./AgendaList";

const STATUS_LABEL: Record<string, string> = {
  FINISHED: "zakończone",
  ONGOING: "trwa",
  PLANNED: "planowane",
};

const STATUS_CLASS: Record<string, string> = {
  FINISHED: "text-muted-foreground border-border",
  ONGOING: "text-destructive border-destructive",
  PLANNED: "text-foreground border-foreground/40",
};

function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" });
}

export function SittingCard({
  sitting,
  agenda,
  variant = "expanded",
}: {
  sitting: CommitteeSitting;
  agenda: AgendaItem[];
  variant?: "expanded" | "compact";
}) {
  const status = sitting.status ?? "FINISHED";
  const dateLabel = formatLongDate(sitting.date);

  if (variant === "compact") {
    const oneLine = agenda.length > 0 ? agenda[0].text : sitting.agendaText;
    return (
      <li className="border-b border-border last:border-b-0 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-serif text-[14px]">{dateLabel}</span>
          <span className="font-sans text-[10.5px] text-muted-foreground tracking-[0.08em]">nr {sitting.num}</span>
          <span className={`font-sans text-[9.5px] tracking-[0.14em] uppercase border px-1.5 py-0.5 ${STATUS_CLASS[status] ?? STATUS_CLASS.FINISHED}`}>
            {STATUS_LABEL[status] ?? status.toLowerCase()}
          </span>
          {sitting.videoPlayerLink && (
            <a
              href={sitting.videoPlayerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto font-sans text-[11px] underline decoration-dotted underline-offset-4 hover:text-destructive"
            >
              ▶ wideo
            </a>
          )}
        </div>
        {oneLine && (
          <p className="font-serif text-[13px] leading-snug text-muted-foreground mt-1 max-w-[820px] line-clamp-2">
            {oneLine}
          </p>
        )}
      </li>
    );
  }

  return (
    <article className="border border-border bg-background p-4 md:p-5">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <h3 className="font-serif text-[18px] md:text-[20px] font-medium leading-none tracking-[-0.01em] m-0">
          {dateLabel}
        </h3>
        <span className="font-sans text-[11px] text-muted-foreground tracking-[0.08em]">posiedzenie nr {sitting.num}</span>
        <span className={`font-sans text-[10px] tracking-[0.14em] uppercase border px-1.5 py-0.5 ${STATUS_CLASS[status] ?? STATUS_CLASS.FINISHED}`}>
          {STATUS_LABEL[status] ?? status.toLowerCase()}
        </span>
        {sitting.closed && (
          <span className="font-sans text-[10px] tracking-[0.14em] uppercase text-muted-foreground border border-border px-1.5 py-0.5">
            zamknięte
          </span>
        )}
        {sitting.remote && (
          <span className="font-sans text-[10px] tracking-[0.14em] uppercase text-muted-foreground border border-border px-1.5 py-0.5">
            zdalne
          </span>
        )}
        {sitting.videoPlayerLink && status !== "PLANNED" && (
          <a
            href={sitting.videoPlayerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-sans text-[12px] tracking-[0.04em] text-destructive underline decoration-dotted underline-offset-4 hover:no-underline"
          >
            ▶ Nagranie wideo
          </a>
        )}
      </header>
      {sitting.room && (
        <div className="font-sans text-[11px] text-muted-foreground mb-3">
          {sitting.room}
        </div>
      )}
      {agenda.length > 0 ? (
        <AgendaList items={agenda} max={10} />
      ) : sitting.agendaText ? (
        <p className="font-serif text-[14.5px] leading-relaxed text-secondary-foreground m-0 max-w-[820px]">
          {sitting.agendaText}
        </p>
      ) : (
        <p className="font-sans text-[11px] italic text-muted-foreground m-0">Brak porządku obrad.</p>
      )}
    </article>
  );
}
