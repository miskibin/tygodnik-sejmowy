import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { etlPassword, hasEtlSession } from "@/lib/admin-auth";
import { getEtlCursors, getEtlRuns } from "@/lib/db/etl";
import { CursorsCard } from "./_components/CursorsCard";
import { DurationStrip } from "./_components/DurationStrip";
import { Filters, KINDS, LIMITS } from "./_components/Filters";
import { LoginForm } from "./_components/LoginForm";
import { RunsTable } from "./_components/RunsTable";
import { SummaryStrip } from "./_components/SummaryStrip";

// Operator view over the updater's ledger — always the live table, never a
// cached snapshot, and never indexed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "ETL — Tygodnik Sejmowy" },
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

function one(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-background text-foreground px-3 sm:px-8 md:px-14 pt-8 sm:pt-12 pb-12 sm:pb-16 min-w-0">
      <div className="max-w-[1280px] mx-auto min-w-0">{children}</div>
    </main>
  );
}

export default async function EtlDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Not configured = not deployed. 404 before touching anything else so a
  // missing env var can never leak the ledger.
  if (!etlPassword()) notFound();

  const sp = await searchParams;

  if (!(await hasEtlSession())) {
    return (
      <Shell>
        <LoginForm error={one(sp.blad) === "1"} />
      </Shell>
    );
  }

  const kindParam = one(sp.kind);
  const kind = (KINDS as readonly string[]).includes(kindParam ?? "") ? kindParam : null;
  const limitParam = Number(one(sp.limit));
  const limit = (LIMITS as readonly number[]).includes(limitParam) ? limitParam : LIMITS[1];

  const [runs, cursors] = await Promise.all([
    safe(getEtlRuns({ limit, kind: kind ?? undefined }), []),
    safe(getEtlCursors(), []),
  ]);

  return (
    <Shell>
      <PageBreadcrumb
        items={[{ label: "Panel" }, { label: "ETL" }]}
        subtitle={`Rejestr przebiegów aktualizacji · ${runs.length} wczytanych`}
      />

      <div className="mb-6">
        <Filters kind={kind} limit={limit} />
      </div>

      <SummaryStrip runs={runs} />
      <DurationStrip runs={runs} />

      <section className="mt-8">
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Przebiegi · etl_runs
        </h2>
        <RunsTable runs={runs} />
      </section>

      <div className="mt-8">
        <CursorsCard cursors={cursors} />
      </div>
    </Shell>
  );
}
