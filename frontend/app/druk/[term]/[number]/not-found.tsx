import { headers } from "next/headers";
import { EmptyState } from "@/components/chrome/EmptyState";

export default async function DrukNotFound() {
  const h = await headers();
  const path =
    h.get("x-invoke-path") ??
    h.get("x-pathname") ??
    h.get("next-url") ??
    h.get("referer") ??
    "";

  let term = "";
  let number = "";
  const m = path.match(/\/druk\/([^/?#]+)\/([^/?#]+)/);
  if (m) {
    term = decodeURIComponent(m[1]);
    number = decodeURIComponent(m[2]);
  }

  const label = term && number ? `Druk ${number}/${term}` : "Druk sejmowy";
  const actions = [];
  if (term && number) {
    actions.push({
      label: `Strona druku w Sejmie`,
      href: `https://www.sejm.gov.pl/Sejm${encodeURIComponent(term)}.nsf/druk.xsp?nr=${encodeURIComponent(number)}`,
      external: true,
    });
    actions.push({
      label: `PDF na sejm.gov.pl`,
      href: `https://api.sejm.gov.pl/sejm/term${encodeURIComponent(term)}/prints/${encodeURIComponent(number)}/${encodeURIComponent(number)}.pdf`,
      external: true,
    });
  }
  actions.push({ label: "‹ Wróć do Tygodnika", href: "/tygodnik" });

  return (
    <EmptyState
      kicker="druk · brak streszczenia"
      title={label}
      body={
        <>
          <p>
            Nie mamy jeszcze streszczenia tego druku w naszej bazie. Może być nowy, proceduralny, albo po prostu jeszcze nie został przetworzony.
          </p>
          <p>
            Pełna treść druku, lista sygnatariuszy i etapy procesu są dostępne na stronie Sejmu — linki poniżej.
          </p>
        </>
      }
      actions={actions}
    />
  );
}
