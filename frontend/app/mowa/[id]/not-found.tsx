import { NotFoundPage } from "@/components/chrome/NotFoundPage";

export default function MowaNotFound() {
  return (
    <NotFoundPage
      entity="Wypowiedź"
      gender="f"
      message="Nie znaleźliśmy wypowiedzi pod tym id. Może być błędne, spoza obecnej kadencji, albo jeszcze nie została pobrana ze stenogramu."
      backLink={{ href: "/mowa", label: "Wróć do listy wypowiedzi →" }}
    />
  );
}
