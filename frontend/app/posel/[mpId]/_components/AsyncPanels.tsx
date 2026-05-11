import { getMpThisWeek } from "@/lib/db/mps";
import {
  getMpVotes,
  getMpQuestionsRows,
  getMpQuestionsStats,
  getMpStatementsRows,
  getMpStatementsStats,
  getMpPromiseAlignments,
} from "@/lib/db/posel-tabs";
import { MP_QUESTIONS_STATEMENTS_TAB_LIMIT } from "@/lib/posel-tab-page-size";
import { Tab1VotesPanel } from "./Tab1VotesPanel";
import { Tab2QuestionsPanel } from "./Tab2QuestionsPanel";
import { Tab3StatementsPanel } from "./Tab3StatementsPanel";
import { Tab4PromisesPanel } from "./Tab4PromisesPanel";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
}

export async function TydzienAsync({ mpId }: { mpId: number }) {
  const thisWeek = await getMpThisWeek(mpId, 10, 8);
  if (thisWeek.length === 0) {
    return (
      <p className="font-serif italic text-muted-foreground text-center py-12">
        W bazie nie ma jeszcze wystąpień ani interpelacji przypisanych do tej osoby w tej kadencji.
      </p>
    );
  }
  return (
    <>
      <p className="font-sans text-[12px] text-muted-foreground leading-snug m-0 mb-5 max-w-[720px] break-words">
        Najnowsze wystąpienia na posiedzeniach Sejmu oraz interpelacje i zapytania — wg daty w bazie.
      </p>
      <ul className="min-w-0">
      {thisWeek.map((e, i) => {
        const dateEl = (
          <span className="font-mono text-[11px] text-muted-foreground tracking-wide shrink-0 sm:pt-1">
            {formatDate(e.date)}
          </span>
        );
        const bodyEl = (
          <div className="min-w-0">
            <div
              className="font-sans text-[10px] uppercase tracking-[0.14em] mb-1.5"
              style={{ color: e.kind === "question" ? "var(--warning)" : "var(--destructive)" }}
            >
              {e.kind === "question" ? "Interpelacja" : "Wystąpienie"}
            </div>
            {e.title ? (
              <div className="font-serif text-[16px] sm:text-[18px] font-medium leading-snug mb-1 tracking-[-0.005em] break-words">
                {e.title}
              </div>
            ) : (
              <div className="font-serif italic text-[14px] text-muted-foreground mb-1">brak treści wystąpienia</div>
            )}
            {e.subtitle && (
              <div className="font-sans text-[12px] text-muted-foreground break-words">{e.subtitle}</div>
            )}
          </div>
        );
        const rowLayout =
          "flex flex-col gap-2 py-4 min-w-0 sm:grid sm:grid-cols-[minmax(0,3.25rem)_minmax(0,1fr)] sm:gap-5 sm:items-start";
        if (e.kind === "statement" && e.statementId != null) {
          return (
            <li key={i} className="border-b border-border min-w-0">
              <a href={`/mowa/${e.statementId}`} className={`${rowLayout} block sm:hover:bg-muted`}>
                {dateEl}
                {bodyEl}
              </a>
            </li>
          );
        }
        return (
          <li key={i} className={`${rowLayout} border-b border-border`}>
            {dateEl}
            {bodyEl}
          </li>
        );
      })}
    </ul>
    </>
  );
}

export async function VotesAsync({ mpId }: { mpId: number }) {
  const data = await getMpVotes(mpId);
  return <Tab1VotesPanel data={data} />;
}

export async function QuestionsAsync({ mpId }: { mpId: number }) {
  const term = 10;
  const [stats, initialRows] = await Promise.all([
    getMpQuestionsStats(mpId, term),
    getMpQuestionsRows(mpId, term, 0, MP_QUESTIONS_STATEMENTS_TAB_LIMIT),
  ]);
  return <Tab2QuestionsPanel stats={stats} initialRows={initialRows} mpId={mpId} />;
}

export async function StatementsAsync({ mpId }: { mpId: number }) {
  const term = 10;
  const [stats, initialRows] = await Promise.all([
    getMpStatementsStats(mpId, term),
    getMpStatementsRows(mpId, term, 0, MP_QUESTIONS_STATEMENTS_TAB_LIMIT),
  ]);
  return <Tab3StatementsPanel stats={stats} initialRows={initialRows} mpId={mpId} />;
}

export async function PromisesAsync({ mpId }: { mpId: number }) {
  const data = await getMpPromiseAlignments(mpId);
  return <Tab4PromisesPanel data={data} />;
}

export function PanelFallback({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 py-6">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border border-border bg-background p-4 animate-pulse">
          <div className="bg-muted h-3 w-1/3 mb-3" />
          <div className="bg-muted h-2 w-full mb-2" />
          <div className="bg-muted h-2 w-4/5" />
        </div>
      ))}
    </div>
  );
}
