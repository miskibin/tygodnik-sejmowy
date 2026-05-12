import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { NotFoundPage } from "@/components/chrome/NotFoundPage";


type DistrictRow = {
  district_num: number;
  dominant_club_short: string | null;
  dominant_club_name: string | null;
  mp_count: number | null;
  avg_age: number | string | null;
  turnout_pct: number | string | null;
};

type MpRow = {
  mp_id: number;
  first_name: string | null;
  last_name: string | null;
};

async function getDistrict(num: number): Promise<DistrictRow | null> {
  const sb = supabase();
  const { data } = await sb
    .from("district_klub_stats")
    .select("district_num, dominant_club_short, dominant_club_name, mp_count, avg_age, turnout_pct")
    .eq("term", 10)
    .eq("district_num", num)
    .maybeSingle();
  return (data as DistrictRow | null) ?? null;
}

async function getMps(num: number): Promise<MpRow[]> {
  const sb = supabase();
  const { data } = await sb
    .from("mps")
    .select("mp_id, first_name, last_name")
    .eq("term", 10)
    .eq("district_num", num)
    .order("last_name", { ascending: true });
  return (data as MpRow[] | null) ?? [];
}

function fmt(n: number | string | null): string {
  if (n == null) return "—";
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(v) ? `${Math.round(v * 10) / 10}` : "—";
}

export default async function OkregPage({ params }: { params: Promise<{ num: string }> }) {
  const { num: rawNum } = await params;
  const num = Number(rawNum);
  if (!Number.isFinite(num) || num < 1 || num > 41) notFound();

  let district: DistrictRow | null = null;
  let mps: MpRow[] = [];
  try {
    [district, mps] = await Promise.all([getDistrict(num), getMps(num)]);
  } catch (err) {
    console.error("[/atlas/okreg/[num]] load failed", { num, err });
    return (
      <NotFoundPage
        entity="Okręg wyborczy"
        gender="m"
        id={num}
        message="Nie udało się załadować danych okręgu. Spróbuj odświeżyć stronę."
        backLink={{ href: "/atlas", label: "Wróć do Atlasu →" }}
      />
    );
  }
  if (!district) notFound();

  return (
    <main className="bg-background text-foreground font-serif px-4 sm:px-8 md:px-14 pt-10 sm:pt-12 pb-24 sm:pb-28">
      <div className="max-w-[900px] mx-auto">
        <PageBreadcrumb
          items={[
            { label: "Atlas", href: "/atlas" },
            { label: `Okręg ${num}` },
          ]}
        />

        <div className="flex flex-wrap gap-4 mb-10 font-mono text-[12px] text-muted-foreground tracking-wide uppercase">
          {district.dominant_club_short ? (
            <ClubBadge
              klub={district.dominant_club_short}
              clubName={district.dominant_club_name ?? undefined}
              withLabel
              size="sm"
            />
          ) : (
            <span>—</span>
          )}
          <span>·</span>
          <span>{district.mp_count ?? "—"} mandatów</span>
          <span>·</span>
          <span>frekwencja {fmt(district.turnout_pct)}%</span>
          <span>·</span>
          <span>śr. wieku {fmt(district.avg_age)} lat</span>
        </div>

        <h2 className="font-serif font-medium text-[24px] mb-4 pb-2 border-b border-rule">
          Posłowie ({mps.length})
        </h2>

        {mps.length === 0 ? (
          <p className="font-serif italic text-muted-foreground">Brak posłów w bazie dla tego okręgu.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 font-sans text-[14px]">
            {mps.map((m) => (
              <li key={m.mp_id} className="border-b border-dotted border-border py-2.5 flex items-baseline justify-between gap-3">
                <Link
                  href={`/posel/${m.mp_id}`}
                  className="text-foreground hover:text-destructive underline decoration-dotted underline-offset-4"
                >
                  {m.first_name} {m.last_name}
                </Link>
                <span className="font-mono text-[10px] text-muted-foreground">#{m.mp_id}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 font-mono text-[10px] text-muted-foreground tracking-wider leading-relaxed">
          Dane z district_klub_stats (mig 0053) + mps (X kadencja).
        </p>
      </div>
    </main>
  );
}
