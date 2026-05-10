import { NotFoundPage } from "@/components/chrome/NotFoundPage";

export default function OkregNotFound() {
  return (
    <NotFoundPage
      entity="Okręg wyborczy"
      gender="m"
      message="W Polsce jest 41 okręgów wyborczych do Sejmu (numery 1–41). Sprawdź numer lub wróć do Atlasu."
      backLink={{ href: "/atlas", label: "Wróć do Atlasu →" }}
    />
  );
}
