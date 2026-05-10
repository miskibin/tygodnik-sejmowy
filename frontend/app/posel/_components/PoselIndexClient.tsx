"use client";

import { useEffect, useMemo, useState } from "react";
import { useProfile } from "@/lib/profile";
import type { MpListItem } from "@/lib/db/mps";
import { MPCardGrid } from "@/components/posel/MPCardGrid";

function MpGrid({ mps }: { mps: MpListItem[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {mps.map((m) => (
        <li key={m.mpId}>
          <MPCardGrid
            mpId={m.mpId}
            name={m.firstLastName}
            photoUrl={m.photoUrl}
            clubRef={m.clubRef}
            district={m.districtNum}
            photoSize="md"
          />
        </li>
      ))}
    </ul>
  );
}

export function PoselIndexClient({
  mostActive,
  allMps,
}: {
  mostActive: MpListItem[];
  allMps: MpListItem[];
}) {
  const { district, hydrated } = useProfile();
  const [districtMps, setDistrictMps] = useState<MpListItem[] | null>(null);
  const [districtLoading, setDistrictLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!district) {
      setDistrictMps(null);
      return;
    }
    setDistrictLoading(true);
    const ctrl = new AbortController();
    fetch(`/api/mps-by-district?num=${district.num}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => setDistrictMps(j.mps ?? []))
      .catch(() => setDistrictMps([]))
      .finally(() => setDistrictLoading(false));
    return () => ctrl.abort();
  }, [district, hydrated]);

  const totalCount = allMps.length;

  const primary = useMemo(() => {
    if (!hydrated) {
      return null;
    }
    if (district) {
      return (
        <section>
          <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-destructive mb-5 flex items-center gap-2 flex-wrap">
            ✶ Twój okręg · {district.num} · {district.name}
            {districtLoading && (
              <span className="font-mono text-[10px] text-muted-foreground normal-case tracking-normal">
                ładowanie…
              </span>
            )}
          </div>
          {districtMps && districtMps.length === 0 && !districtLoading ? (
            <p className="font-serif italic text-muted-foreground">
              Nie znaleziono posłów dla tego okręgu w aktualnej kadencji.
            </p>
          ) : (
            <MpGrid mps={districtMps ?? []} />
          )}
        </section>
      );
    }
    return (
      <section>
        <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-destructive mb-5">
          ✶ Najbardziej aktywni w tym tygodniu
        </div>
        {mostActive.length === 0 ? (
          <p className="font-serif italic text-muted-foreground">
            Brak danych o aktywności z ostatnich 30 dni.
          </p>
        ) : (
          <MpGrid mps={mostActive} />
        )}
        <p className="font-serif italic text-[12.5px] text-muted-foreground mt-4 max-w-[640px]">
          Liczone wg liczby wystąpień w ciągu ostatnich 30 dni.
          Ustaw kod pocztowy na stronie głównej, żeby zamiast tego widzieć posłów Twojego okręgu.
        </p>
      </section>
    );
  }, [hydrated, district, districtMps, districtLoading, mostActive]);

  return (
    <>
      {primary}

      <section className="mt-12 border-t border-border pt-8">
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="font-sans text-[11px] tracking-[0.16em] uppercase text-muted-foreground hover:text-destructive flex items-center gap-2 cursor-pointer"
        >
          <span>{showAll ? "▾" : "▸"}</span>
          <span>
            {showAll ? "Ukryj" : "Pokaż"} całą listę {totalCount} posłów (A–Z)
          </span>
        </button>
        {showAll && (
          <div className="mt-5">
            <MpGrid mps={allMps} />
          </div>
        )}
      </section>
    </>
  );
}
