import type { Metadata } from "next";
import {
  getPromisesEnriched,
  isActivityFilter,
  isHubSort,
} from "@/lib/db/promises";
import { ObietniceClient } from "./_components/ObietniceClient";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";

export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/obietnice" },
};

function parseList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
  }
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function ObietnicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const parties = parseList(sp.parties);
  const q = pickString(sp.q) ?? "";
  const rawActivity = pickString(sp.activity);
  const activity = isActivityFilter(rawActivity) ? rawActivity : "all";
  const rawSort = pickString(sp.sort);
  const sort = isHubSort(rawSort) ? rawSort : "evidence";

  const { rows, counts, total } = await getPromisesEnriched({
    parties,
    activity,
    q,
    sort,
  });

  return (
    <div className="bg-background text-foreground font-serif pb-20">
      <div className="max-w-[1240px] mx-auto px-4 md:px-8 lg:px-14 pt-6 md:pt-8">
        <PageBreadcrumb
          items={[{ label: "Obietnice" }]}
          subtitle={`${total} obietnic z kampanii 2023 — co partie obiecały, co rusza w Sejmie.`}
        />
        <ObietniceClient rows={rows} counts={counts} total={total} />
      </div>
    </div>
  );
}
