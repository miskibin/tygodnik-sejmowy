import { getMpThisWeek } from "@/lib/db/mps";
import {
  getMpVotes,
  getMpQuestions,
  getMpStatementsTab,
  getMpPromiseAlignments,
} from "@/lib/db/posel-tabs";
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
        Brak danych o wystąpieniach i interpelacjach tego posła w aktualnej kadencji.
      </p>
    );
  }
  return (
    <ul>
      {thisWeek.map((e, i) => {
        const inner = (
          <>
            <span className="font-mono text-[11px] text-muted-foreground tracking-wide pt-1">{formatDate(e.date)}</span>
            <div>
              <div
                className="font-sans text-[10px] uppercase tracking-[0.14em] mb-1.5"
                style={{ color: e.kind === "question" ? "var(--warning)" : "var(--destructive)" }}
              >
                {e.kind === "question" ? "Interpelacja" : "Wystąpienie"}
              </div>
              {e.title ? (
                <div className="font-serif text-[18px] font-medium leading-snug mb-1 tracking-[-0.005em]">{e.title}</div>
              ) : (
                <div className="font-serif italic text-[14px] text-muted-foreground mb-1">brak treści wystąpienia</div>
              )}
              {e.subtitle && <div className="font-sans text-[12px] text-muted-foreground">{e.subtitle}</div>}
            </div>
          </>
        );
        if (e.kind === "statement" && e.statementId != null) {
          return (
            <li key={i} className="border-b border-border">
              <a
                href={`/mowa/${e.statementId}`}
                className="grid gap-5 py-4 hover:bg-muted"
                style={{ gridTemplateColumns: "60px 1fr" }}
              >
                {inner}
              </a>
            </li>
          );
        }
        return (
          <li
            key={i}
            className="grid gap-5 py-4 border-b border-border"
            style={{ gridTemplateColumns: "60px 1fr" }}
          >
            {inner}
          </li>
        );
      })}
    </ul>
  );
}

export async function VotesAsync({ mpId }: { mpId: number }) {
  const data = await getMpVotes(mpId);
  return <Tab1VotesPanel data={data} />;
}

export async function QuestionsAsync({ mpId }: { mpId: number }) {
  const data = await getMpQuestions(mpId);
  return <Tab2QuestionsPanel data={data} />;
}

export async function StatementsAsync({ mpId }: { mpId: number }) {
  const data = await getMpStatementsTab(mpId);
  return <Tab3StatementsPanel data={data} />;
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
