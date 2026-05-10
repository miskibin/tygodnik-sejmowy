import { NotFoundPage } from "@/components/chrome/NotFoundPage";

export default function WatekNotFound() {
  return (
    <NotFoundPage
      entity="Wątek"
      gender="m"
      message="Nie znaleźliśmy wątku legislacyjnego pod tym id. Sprawdź id lub wróć do Tygodnika."
      backLink={{ href: "/tygodnik", label: "Wróć do Tygodnika →" }}
    />
  );
}
