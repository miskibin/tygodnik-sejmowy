import type { MpRow } from "@/lib/db/mps";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

export function ProfilPanel({ mp, clubName }: { mp: MpRow; clubName: string | null }) {
  const birth = fmtDate(mp.birthDate);
  return (
    <div className="grid gap-10 md:gap-14 md:grid-cols-[1.4fr_1fr] min-w-0">
      <section className="min-w-0">
        <h3 className="font-sans text-[11px] tracking-[0.18em] uppercase text-destructive mb-4">
          ✶ Biografia
        </h3>
        <div className="font-serif text-[16px] sm:text-[18px] leading-[1.65] text-foreground text-pretty space-y-4">
          {(birth || mp.birthLocation) && (
            <p className="m-0">
              {birth ? <>Data urodzenia: {birth}</> : null}
              {birth && mp.birthLocation ? <>, </> : null}
              {mp.birthLocation ? <>miejsce: {mp.birthLocation}</> : null}
              {birth || mp.birthLocation ? "." : null}
            </p>
          )}
          {(mp.profession || mp.educationLevel) && (
            <p className="m-0 text-secondary-foreground">
              {mp.educationLevel ? <>Wykształcenie: <strong className="text-foreground">{mp.educationLevel}</strong>.</> : null}
              {mp.educationLevel && mp.profession ? " " : null}
              {mp.profession ? <>Zawód: <strong className="text-foreground">{mp.profession}</strong>.</> : null}
            </p>
          )}
          {!birth && !mp.birthLocation && !mp.profession && !mp.educationLevel && (
            <p className="m-0 font-serif italic text-muted-foreground">
              Brak rozszerzonych danych biograficznych w bazie.
            </p>
          )}
        </div>
      </section>

      <aside className="min-w-0">
        <h3 className="font-sans text-[11px] tracking-[0.18em] uppercase text-destructive mb-4">
          ✶ Kontakt
        </h3>
        <div className="border border-rule p-5 sm:p-6">
          <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2">
            Klub parlamentarny
          </div>
          <div className="font-serif text-[16px] text-foreground mb-4 leading-[1.4]">
            {clubName ?? mp.clubRef ?? "brak"}
          </div>

          {mp.districtNum && (
            <>
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2">
                Okręg wyborczy
              </div>
              <div className="font-serif text-[16px] text-foreground mb-4 leading-[1.4]">
                {mp.districtNum}{mp.voivodeship ? ` · ${mp.voivodeship}` : ""}
              </div>
            </>
          )}

          {mp.email ? (
            <>
              <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2">
                E-mail
              </div>
              <a
                href={`mailto:${mp.email}`}
                className="font-serif text-[15px] text-destructive hover:underline break-all"
              >
                {mp.email}
              </a>
            </>
          ) : (
            <p className="font-serif italic text-[13px] text-muted-foreground m-0">
              Brak publicznego adresu e-mail w bazie Sejmu.
            </p>
          )}
        </div>

      </aside>
    </div>
  );
}
