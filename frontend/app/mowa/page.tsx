import { ComingSoonPage } from "@/components/chrome/ComingSoonPage";

// Indeks mowy sejmowej tymczasowo wyłączony.
// Powód: licznik (`getStatementsCount`) zwraca prawdziwe liczby (~22 554),
// ale lista wystąpień (`getStatements`) zwraca pustą tablicę na produkcji
// — przez co header pokazuje "22 554 wystąpień" obok body z "Brak wystąpień".
// To jest sprzeczność, której nie da się załatać kosmetyką w UI; trzeba
// wrócić do data-layera i naprawić faktyczne zapytanie. Dopóki nie wróci,
// użytkownik dostaje uczciwy placeholder zamiast pustego feedu z licznikiem.
//
// Strona detalu (/mowa/[id]) działa niezależnie i pozostaje aktywna —
// linki z innych części serwisu (np. wyniki głosowań) nadal trafiają w
// konkretne wystąpienia.

export default function MowaPage() {
  return (
    <ComingSoonPage
      routeName={
        <>
          Mowa <span className="italic text-destructive">sejmowa</span>
        </>
      }
      description={
        <>
          Wkrótce wróci pełen feed wystąpień z mównicy — przeszukiwalny po
          klubie, pośle, dacie i posiedzeniu. Pojedyncze wystąpienia nadal
          działają — możesz do nich trafić z głosowań i wątków.
        </>
      }
      plannedFeatures={[
        "Chronologiczny feed wystąpień z X kadencji",
        "Filtry: klub, poseł, posiedzenie, zakres dat",
        "Pełen tekst stenogramu z linkiem do oryginału w sejm.gov.pl",
      ]}
    />
  );
}
