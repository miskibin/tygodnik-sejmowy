/**
 * Umami Cloud (cookieless, no PII).
 * Website ID configured in app/layout.tsx Script tag.
 *
 * Automatic: pageviews, referrers, devices, countries, UTM params.
 * Outbound link tracking: enable in Umami dashboard (Settings -> Tracking).
 *
 * Custom events: prefer declarative `data-umami-event="name"` on the element.
 * Use trackEvent() only when state must be captured at click time.
 */

export const PATRONITE_SUPPORT_URL = "https://patronite.pl/tygodniksejmowy" as const;

type UmamiProps = Record<string, string | number | boolean>;
type UmamiTrack = (event: string, data?: UmamiProps) => void;

function umamiTrack(): UmamiTrack | null {
  if (typeof window === "undefined") return null;
  const w = window as { umami?: { track: UmamiTrack } };
  return w.umami?.track ?? null;
}

export function trackEvent(name: string, props?: UmamiProps): void {
  umamiTrack()?.(name, props);
}

export function trackPatroniteSupportClick(placement: string): void {
  trackEvent("patronite_support_click", { placement });
}
