import { NotFoundPage } from "@/components/chrome/NotFoundPage";

export default function GlosowanieNotFound() {
  return (
    <NotFoundPage
      entity="Głosowanie"
      gender="n"
      message="Nie znaleźliśmy głosowania pod tym id. Sprawdź, czy id jest poprawne, lub wróć do Tygodnika."
      backLink={{ href: "/tygodnik", label: "Wróć do Tygodnika →" }}
    />
  );
}
