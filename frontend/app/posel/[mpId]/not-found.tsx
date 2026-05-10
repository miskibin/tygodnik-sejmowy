import { NotFoundPage } from "@/components/chrome/NotFoundPage";

export default function PoselNotFound() {
  return (
    <NotFoundPage
      entity="Poseł"
      gender="m"
      message="Nie znaleźliśmy posła pod tym id. Sprawdź id lub wróć do listy posłów."
      backLink={{ href: "/posel", label: "Wróć do listy posłów →" }}
    />
  );
}
