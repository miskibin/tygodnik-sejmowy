import type { Metadata } from "next";
import { PreferencesEditor } from "../_components/PreferencesEditor";

export const metadata: Metadata = {
  title: "Preferencje — Tygodnik Sejmowy",
  description: "Wybierz tematy i sytuacje, które chcesz śledzić w Tygodniku Sejmowym.",
};

export default function PreferencesPage() {
  return (
    <main className="bg-background text-foreground pb-12 sm:pb-16 min-w-0">
      <div className="max-w-[920px] mx-auto px-3 sm:px-8 md:px-14 pt-8 sm:pt-12 min-w-0">
        <h1 className="font-sans text-[24px] sm:text-[28px] font-medium tracking-[-0.02em] m-0 mb-6">
          Preferencje
        </h1>
        <PreferencesEditor />
      </div>
    </main>
  );
}
