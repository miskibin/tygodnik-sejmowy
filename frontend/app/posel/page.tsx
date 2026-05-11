import { getAllActiveMps } from "@/lib/db/mps";
import { getAllMpCardStats } from "@/lib/db/mp-card-stats";
import { PoselDirectoryClient } from "./_components/PoselDirectoryClient";
import { PageHeading } from "@/components/chrome/PageHeading";
import { ViewMethodologyFooter } from "@/components/chrome/ViewMethodologyFooter";

export const metadata = {
  title: "Posłowie — Tygodnik Sejmowy",
  description:
    "Wszyscy posłowie X kadencji. Filtruj po klubie, okręgu, sortuj po aktywności. Każde dossier zawiera głosowania, interpelacje, wystąpienia.",
};

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function PoselIndexPage() {
  const [mps, statsMap] = await Promise.all([
    safe(getAllActiveMps(), []),
    safe(getAllMpCardStats(), new Map()),
  ]);

  // Merge stats into the directory rows; never drop an MP if stats are missing.
  const rows = mps.map((m) => {
    const s = statsMap.get(m.mpId);
    return {
      ...m,
      attendancePct: s?.attendancePct ?? null,
      loyaltyPct: s?.loyaltyPct ?? null,
      questionCount: s?.questionCount ?? 0,
      statementCount: s?.statementCount ?? 0,
    };
  });

  return (
    <main className="bg-background text-foreground font-serif pb-12 sm:pb-16 min-w-0">
      <div className="max-w-[1280px] mx-auto px-3 sm:px-8 md:px-14 pt-8 sm:pt-12 min-w-0">
        <header className="mb-7 sm:mb-9 pb-5 sm:pb-6 border-b border-border">
          <div className="font-sans text-[10px] sm:text-[11px] tracking-[0.18em] uppercase text-destructive mb-3">
            X kadencja · {mps.length} mandatów
          </div>
          <PageHeading
            size="xl"
            caption="Imię, nazwisko, klub lub okręg — wyszukiwanie działa w jednym polu."
          >
            Twój <span className="font-serif italic text-destructive">poseł</span>
          </PageHeading>
        </header>

        <PoselDirectoryClient mps={rows} />

        <ViewMethodologyFooter
          columns={[
            {
              kicker: "Czego tu nie ma",
              children: (
                <>
                  Świadomie nie pokazujemy rankingu &bdquo;najaktywniejszego posła&rdquo;. Większa liczba
                  interpelacji nie znaczy lepszej pracy — zachęcałaby do produkcji szumu, nie
                  rzeczywistej polityki.
                </>
              ),
            },
            {
              kicker: "Skąd dane",
              children: (
                <>
                  api.sejm.gov.pl + matviews <code className="font-mono text-[11px]">mp_attendance</code>,{" "}
                  <code className="font-mono text-[11px]">mp_discipline_summary</code>,{" "}
                  <code className="font-mono text-[11px]">mp_activity_summary</code>. Odświeżane raz dziennie.
                </>
              ),
            },
            {
              kicker: "Widzisz błąd?",
              children: (
                <>
                  Zgłoś go publicznie — repozytorium jest otwarte, korekty publikujemy w ciągu 48 godzin.
                  <a
                    href="https://github.com/miskibin/tygodnik-sejmowy/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 border border-foreground px-3 py-1.5 font-mono text-[10.5px] tracking-[0.14em] uppercase text-foreground hover:bg-foreground hover:text-background transition-colors"
                  >
                    ↗ Zgłoś na GitHubie
                  </a>
                </>
              ),
            },
          ]}
        />
      </div>
    </main>
  );
}
