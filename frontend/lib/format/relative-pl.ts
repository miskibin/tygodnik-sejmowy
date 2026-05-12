// Polish relative-date + pluralization helpers.
// Used by komisja list/detail and any future page that needs "3 dni temu" style.

export function pluralPl(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  if (abs === 1) return forms[0];
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

// "3 dni temu", "wczoraj", "dziś", "2 tyg. temu", "5 mies. temu", "ponad rok temu".
// Returns null for null/invalid input. Uses UTC-day math to avoid timezone drift.
export function formatRelativePl(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  const days = Math.round(ms / 86_400_000);
  if (days <= 0) return "dziś";
  if (days === 1) return "wczoraj";
  if (days < 7) return `${days} dni temu`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} ${pluralPl(w, ["tydzień", "tyg.", "tyg."])} temu`;
  }
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `${m} ${pluralPl(m, ["mies.", "mies.", "mies."])} temu`;
  }
  const y = Math.floor(days / 365);
  if (y === 1) return "ponad rok temu";
  return `${y} ${pluralPl(y, ["lat", "lata", "lat"])} temu`;
}

// Days between iso date and now (UTC-day math). Positive = past, negative = future, null = invalid.
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((Date.now() - d.getTime()) / 86_400_000);
}
