import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction } from "../actions";

export function LoginForm({ error }: { error?: boolean }) {
  return (
    <div className="max-w-sm">
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
        Panel ETL
      </div>
      <h1 className="font-heading text-2xl font-medium mb-1">Dostęp chroniony</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Podaj hasło, żeby zobaczyć historię przebiegów aktualizacji danych.
      </p>

      <form action={loginAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="etl-password" className="text-sm font-medium">
            Hasło
          </label>
          <Input
            id="etl-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            aria-invalid={error || undefined}
            aria-describedby={error ? "etl-password-error" : undefined}
          />
        </div>

        {error && (
          <p
            id="etl-password-error"
            role="alert"
            className="text-sm"
            style={{ color: "var(--destructive)" }}
          >
            Nieprawidłowe hasło.
          </p>
        )}

        <Button type="submit" className="w-fit">
          Zaloguj
        </Button>
      </form>
    </div>
  );
}
