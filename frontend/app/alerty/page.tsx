import { ComingSoonPage } from "@/components/chrome/ComingSoonPage";

// Subskrypcje alertów wymagają działającego backendu auth-less
// (insert_alert_subscription RPC + worker dostarczający e-mail/RSS/push).
// Dopóki tych dwóch elementów nie ma na produkcji, strona pokazuje
// uczciwy placeholder zamiast mock-listy z formularzem, który nic
// nie zapisuje.

export default function AlertyPage() {
  return (
    <ComingSoonPage
      routeName={
        <>
          Twoje <span className="italic text-destructive">alerty</span>
        </>
      }
      description={
        <>
          Wkrótce uruchomimy subskrypcje bez konta — wpiszesz e-mail, klikniesz
          link potwierdzający i dostaniesz powiadomienie, gdy Sejm zajmie się
          tym, co Cię obchodzi. Na razie infrastruktura dostarczania jeszcze
          nie działa, więc nie udajemy, że można się zapisać.
        </>
      }
      plannedFeatures={[
        "Alerty po frazie, pośle, klubie, komisji, druku, okręgu lub akcie ELI",
        "Kanały: e-mail, RSS, push w przeglądarce, kalendarz ICS",
        "Bez konta — link potwierdzający w e-mailu, wypisanie z każdej wiadomości",
      ]}
    />
  );
}
