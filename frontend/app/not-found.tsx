import { NotFoundPage } from "@/components/chrome/NotFoundPage";

// Global Next.js not-found boundary. Catches any uncaught notFound() call
// from anywhere in the app, plus unmatched URLs. Per-route not-found.tsx
// files (e.g. /proces/[term]/[number]/not-found.tsx) take precedence.
export default function GlobalNotFound() {
  return (
    <NotFoundPage
      entity="Strona"
      gender="f"
      message="Pod tym adresem nic nie ma. Sprawdź adres lub wróć do Tygodnika."
    />
  );
}
