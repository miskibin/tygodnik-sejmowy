"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/lib/profile";

type LookupState = "idle" | "loading" | "found" | "not-found" | "error";

type PostcodeResponse = {
  district?: { num: number; name: string } | null;
  error?: string;
};

function formatPostcode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 5);
  return digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
}

export function PostcodeDistrictLookup() {
  const { postcode, district, hydrated, setPostcode, setDistrict } = useProfile();
  const [lookupState, setLookupState] = useState<LookupState>("idle");

  useEffect(() => {
    if (!hydrated) return;
    if (!/^\d{2}-\d{3}$/.test(postcode)) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLookupState("loading");
      try {
        const response = await fetch(`/api/postcode?p=${encodeURIComponent(postcode)}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as PostcodeResponse;
        if (!response.ok || body.error) {
          setDistrict(null);
          setLookupState("error");
        } else if (body.district) {
          setDistrict(body.district);
          setLookupState("found");
        } else {
          setDistrict(null);
          setLookupState("not-found");
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setDistrict(null);
          setLookupState("error");
        }
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [hydrated, postcode, setDistrict]);

  const handleChange = (value: string) => {
    setPostcode(formatPostcode(value));
    setDistrict(null);
    setLookupState("idle");
  };

  return (
    <section className="mb-5 font-sans" aria-label="Okręg wyborczy">
      <div className="flex flex-wrap items-center gap-3 min-h-9">
        <label className="flex items-center gap-2 shrink-0">
          <span className="text-[12px] text-secondary-foreground">Kod pocztowy</span>
          <input
            value={postcode}
            onChange={(event) => handleChange(event.target.value)}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="00-000"
            aria-describedby="postcode-status"
            className="w-[108px] h-9 px-3 bg-background border border-border rounded-md font-mono text-[13px] tracking-wide text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <div id="postcode-status" aria-live="polite" className="min-h-[16px] text-[11px]">
        {lookupState === "loading" && <span className="text-muted-foreground">Sprawdzam kod…</span>}
        {lookupState === "found" && district && (
          <span className="text-foreground">
            Twój okręg: <strong>nr {district.num}</strong> · {district.name}
          </span>
        )}
        {lookupState === "not-found" && (
          <span className="text-muted-foreground">Nie znaleziono okręgu dla tego kodu.</span>
        )}
        {lookupState === "error" && (
          <span className="text-destructive">Nie udało się sprawdzić kodu. Spróbuj ponownie.</span>
        )}
        </div>
      </div>
    </section>
  );
}
