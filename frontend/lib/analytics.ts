/**
 * GA measurement ID (see `app/layout.tsx` gtag bootstrap).
 *
 * Routing and content depth: rely on automatic `page_view` + path.
 *
 * Custom: `patronite_support_click` with param `placement` — fires only on
 * Patronite CTA taps (see `PatroniteTrackedLink`). Mark as conversion in GA4
 * if you want it in conversion reports.
 *
 * Search Console: GA4 Admin → Product links → link the property for
 * https://tygodniksejmowy.pl
 */

export const GA_MEASUREMENT_ID = "G-Q3NSFXD331" as const;

/** Single source for Patronite URLs in UI (masthead, mobile nav, footer). */
export const PATRONITE_SUPPORT_URL = "https://patronite.pl/tygodniksejmowy" as const;

/** Client-only: one lightweight `gtag` call when user taps Wesprzyj / footer link. */
export function trackPatroniteSupportClick(placement: string): void {
  if (typeof window === "undefined") return;
  const g = (window as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof g !== "function") return;
  g("event", "patronite_support_click", { placement });
}
