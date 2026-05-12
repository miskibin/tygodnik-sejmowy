import type { Metadata } from "next";
import { ftsSearch } from "@/lib/db/fts-search";
import { type FtsHit, type FtsKind } from "@/lib/db/fts-types";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { SzukajResults } from "./_components/SzukajResults";

export const metadata: Metadata = {
  title: "Szukaj",
  description:
    "Pełnotekstowe wyszukiwanie po polsku w drukach, posłach, głosowaniach, komisjach, obietnicach i wystąpieniach.",
};

const GROUP_ORDER: FtsKind[] = ["mp", "voting", "print", "committee", "promise", "statement"];

export default async function SzukajPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const { q: rawQ, tab: rawTab } = await searchParams;
  const q = (rawQ ?? "").trim();
  const tab = (rawTab ?? "all").trim();

  let hits: FtsHit[] = [];
  let errorMsg: string | null = null;
  if (q.length >= 2) {
    try {
      hits = await ftsSearch(q, "all", 200);
    } catch (err) {
      console.error("[/szukaj] ftsSearch failed", err);
      errorMsg = "Wystąpił błąd podczas wyszukiwania. Spróbuj ponownie za chwilę.";
    }
  }

  const counts: Record<FtsKind, number> = {
    mp: 0, voting: 0, print: 0, committee: 0, promise: 0, statement: 0,
  };
  for (const h of hits) counts[h.kind]++;

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <PageBreadcrumb
          items={[{ label: "Szukaj" }]}
          subtitle={
            q
              ? `Zapytanie: „${q}” · ${hits.length} ${hits.length === 1 ? "wynik" : "wyników"}`
              : "Pełnotekstowe wyszukiwanie po polsku"
          }
        />

        <form method="GET" action="/szukaj" className="mb-8">
          <div className="flex items-center gap-2 border border-border rounded-full px-4 py-2.5 bg-background focus-within:border-foreground transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Wpisz frazę — np. 'Tusk', 'CIT', 'rolnictwo'…"
              className="flex-1 bg-transparent outline-none text-[14px] text-foreground placeholder:text-muted-foreground"
              autoFocus={!q}
            />
            <button
              type="submit"
              className="px-3 py-1 rounded-full bg-foreground text-background text-[12px] font-medium"
            >
              Szukaj
            </button>
          </div>
        </form>

        {!q && (
          <div className="text-[14px] text-muted-foreground space-y-3">
            <p>
              Pełnotekstowa wyszukiwarka obejmuje: druki sejmowe, posłów, głosowania, komisje,
              obietnice wyborcze i wystąpienia.
            </p>
            <p>
              Naciśnij <kbd className="font-mono px-1.5 py-0.5 border border-border rounded text-[11px]">Ctrl K</kbd>{" "}
              w dowolnym miejscu, aby otworzyć szybkie wyszukiwanie.
            </p>
          </div>
        )}

        {q && q.length < 2 && (
          <div className="text-[14px] text-muted-foreground">Wpisz co najmniej 2 znaki.</div>
        )}

        {errorMsg && (
          <div className="text-[14px] text-destructive border border-destructive/40 rounded-md px-4 py-3">
            {errorMsg}
          </div>
        )}

        {q.length >= 2 && !errorMsg && hits.length === 0 && (
          <div className="text-[14px] text-muted-foreground">
            Brak wyników dla „{q}”. Spróbuj innej frazy lub krótszego zapytania.
          </div>
        )}

        {hits.length > 0 && (
          <SzukajResults hits={hits} counts={counts} initialTab={tab} groupOrder={GROUP_ORDER} />
        )}
      </div>
    </main>
  );
}
