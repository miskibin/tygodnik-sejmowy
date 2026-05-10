import { EmptyState } from "@/components/chrome/EmptyState";

export default function KomisjaNotFound() {
  return (
    <EmptyState
      kicker="komisja · nie znaleziono"
      title="Nie znaleźliśmy tej komisji"
      body={
        <>
          <p>
            Komisja o tym identyfikatorze nie istnieje w naszej bazie albo jest oznaczona jako szkielet bez danych. Niektóre wpisy w danych Sejmu to puste odwołania z dokumentów — pomijamy je.
          </p>
          <p>
            Wróć do listy wszystkich komisji albo zajrzyj do Atlasu Sejmu.
          </p>
        </>
      }
      actions={[
        { label: "‹ Lista komisji", href: "/komisja" },
        { label: "Atlas Sejmu", href: "/atlas" },
      ]}
    />
  );
}
