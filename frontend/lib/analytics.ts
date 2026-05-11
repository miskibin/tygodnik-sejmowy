"use client";

type AnalyticsEventMap = {
  landing_view: Record<string, never>;
  postcode_input_started: Record<string, never>;
  postcode_lookup_result: {
    success: boolean;
    district_num?: number;
    error_type?: string;
  };
  topic_toggled: {
    id: string;
    enabled: boolean;
    topic_count: number;
    persona_count: number;
  };
  persona_toggled: {
    id: string;
    enabled: boolean;
    topic_count: number;
    persona_count: number;
  };
  cta_tygodnik_click: {
    has_postcode: boolean;
    has_district: boolean;
    topic_count: number;
    persona_count: number;
  };
  tygodnik_first_view: {
    filters_active: boolean;
  };
};

declare global {
  interface Window {
    gtag?: (command: "event", eventName: string, params?: Record<string, unknown>) => void;
  }
}

export function trackEvent<E extends keyof AnalyticsEventMap>(
  eventName: E,
  params?: AnalyticsEventMap[E],
) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params);
}

export function trackEventOncePerSession<E extends keyof AnalyticsEventMap>(
  key: string,
  eventName: E,
  params?: AnalyticsEventMap[E],
) {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
  } catch {
    // ignore sessionStorage issues
  }
  trackEvent(eventName, params);
}
