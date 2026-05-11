"use client";

export type NavArea = "masthead_primary" | "masthead_secondary" | "mobile_nav" | "homepage_pillar";
export type ModuleName = "tygodnik" | "atlas" | "obietnice" | "posel" | "sondaze";

type AnalyticsValue = string | number | boolean;
type AnalyticsParams = Record<string, AnalyticsValue>;

declare global {
  interface Window {
    gtag?: (command: "event", eventName: string, params?: AnalyticsParams) => void;
  }
}

function emitEvent(eventName: string, params: AnalyticsParams) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params);
}

export function trackNavClick(params: {
  fromPath: string;
  targetPath: string;
  navArea: NavArea;
  label: string;
}) {
  emitEvent("nav_click", {
    from_path: params.fromPath,
    target_path: params.targetPath,
    nav_area: params.navArea,
    label: params.label,
  });
}

export function trackExternalLinkClick(params: {
  destinationDomain: string;
  placement: string;
}) {
  emitEvent("external_link_click", {
    destination_domain: params.destinationDomain,
    placement: params.placement,
  });
}

export function trackModuleEntry(module: ModuleName) {
  emitEvent("module_entry", { module });
}
