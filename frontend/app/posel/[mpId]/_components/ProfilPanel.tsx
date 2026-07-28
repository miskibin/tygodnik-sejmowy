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
        <h3 className="font-sans text-[11px] text-muted-foreground mb-4 font-medium">
          ✶ Biografia
        </h3>
        <div className="text-[16px] sm:text-[18px] leading-[1.65] text-foreground text-pretty space-y-4">
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
            <p className="m-0 text-muted-foreground">
              Brak rozszerzonych danych biograficznych w bazie.
            </p>
          )}
        </div>
      </section>

      <aside className="min-w-0">
        <h3 className="font-sans text-[11px] text-muted-foreground mb-4 font-medium">
          ✶ Kontakt
        </h3>
        <div className="border border-rule p-5 sm:p-6">
          <div className="text-[11px] text-muted-foreground mb-2 font-medium">
            Klub parlamentarny
          </div>
          <div className="text-[16px] text-foreground mb-4 leading-[1.4]">
            {clubName ?? mp.clubRef ?? "brak"}
          </div>

          {mp.districtNum && (
            <>
              <div className="text-[11px] text-muted-foreground mb-2 font-medium">
                Okręg wyborczy
              </div>
              <div className="text-[16px] text-foreground mb-4 leading-[1.4]">
                {mp.districtNum}{mp.voivodeship ? ` · ${mp.voivodeship}` : ""}
              </div>
            </>
          )}

          {mp.email ? (
            <>
              <div className="text-[11px] text-muted-foreground mb-2 font-medium">
                E-mail
              </div>
              <a
                href={`mailto:${mp.email}`}
                className="text-[15px] text-destructive hover:underline break-all"
              >
                {mp.email}
              </a>
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground m-0">
              Brak publicznego adresu e-mail w bazie Sejmu.
            </p>
          )}
        </div>

      </aside>
    </div>
  );
}
