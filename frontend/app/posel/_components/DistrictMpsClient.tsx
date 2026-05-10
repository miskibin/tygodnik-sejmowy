"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useProfile } from "@/lib/profile";
import type { MpListItem } from "@/lib/db/mps";

export function DistrictMpsClient() {
  const { district, hydrated } = useProfile();
  const [mps, setMps] = useState<MpListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!district) { setMps(null); return; }
    setLoading(true);
    const ctrl = new AbortController();
    fetch(`/api/mps-by-district?num=${district.num}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => setMps(j.mps ?? []))
      .catch(() => setMps([]))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [district, hydrated]);

  if (!hydrated) return null;
  if (!district) {
    return (
      <div className="text-center font-serif italic text-muted-foreground text-base">
        Ustaw kod pocztowy na stronie głównej, żeby pokazać tu posłów Twojego okręgu.
      </div>
    );
  }

  return (
    <section>
      <div className="font-sans text-[11px] tracking-[0.16em] uppercase text-destructive mb-5 flex items-center gap-2">
        ✶ Twój okręg · {district.num} · {district.name}
        {loading && <span className="font-mono text-[10px] text-muted-foreground normal-case tracking-normal">ładowanie…</span>}
      </div>
      {mps && mps.length === 0 && !loading ? (
        <p className="font-serif italic text-muted-foreground">
          Nie znaleziono posłów dla tego okręgu w aktualnej kadencji.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {(mps ?? []).map((m) => (
            <li key={m.mpId}>
              <Link
                href={`/posel/${m.mpId}`}
                className="block border border-border hover:border-destructive bg-background p-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {m.photoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={m.photoUrl}
                      alt=""
                      style={{ width: 48, height: 60 }}
                      className="object-cover bg-border flex-shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div style={{ width: 48, height: 60 }} className="bg-border" />
                  )}
                  <div className="min-w-0">
                    <div className="font-serif text-sm font-medium leading-tight truncate">{m.firstLastName}</div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-1">{m.clubRef ?? "—"}</div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
