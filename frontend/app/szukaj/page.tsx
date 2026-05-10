import { ComingSoonPage } from "@/components/chrome/ComingSoonPage";

// Pełnotekstowe wyszukiwanie po polsku jest wstrzymane do czasu wgrania
// funkcji RPC `polish_fts_search` (migracja 0073) na produkcyjną bazę
// — w obecnym stanie produkcyjnym każde zapytanie zwracało
// "Could not find the function public.polish_fts_search(...)".
// Strona renderuje czysty placeholder, dopóki search-stack nie wróci.

export default function SzukajPage() {
  return (
    <ComingSoonPage
      routeName={
        <>
          Szukaj <span className="italic text-destructive">w prawie</span>
        </>
      }
      description={
        <>
          Wkrótce uruchomimy pełnotekstowe wyszukiwanie po polsku — frazą lub
          pytaniem, z odmianą słów i diakrytykami, w drukach, obietnicach
          i wystąpieniach. Na razie szukaj przez Tygodnik i Atlas.
        </>
      }
      plannedFeatures={[
        "Wyszukiwanie w drukach sejmowych z podświetleniem trafień",
        "Filtrowanie po kadencji, klubie i typie dokumentu",
        "Hasła z obietnic wyborczych i stenogramów",
      ]}
    />
  );
}
