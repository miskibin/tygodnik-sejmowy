export type ErrorEventPayload = {
  context: string;
  route?: string;
  status_code?: number;
  is_retryable: boolean;
};

export type EmptyStatePayload = {
  context: string;
  active_filters: Record<string, string | number | boolean | null>;
};

function emit(name: string, params: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === "function") {
    gtag("event", name, params);
    return;
  }
  const dlWindow = window as Window & { dataLayer?: unknown[] };
  dlWindow.dataLayer = dlWindow.dataLayer || [];
  dlWindow.dataLayer.push({ event: name, ...params });
}

export function emitUiError(payload: ErrorEventPayload) {
  emit("ui_error", payload);
}

export function emitApiRouteError(payload: ErrorEventPayload) {
  emit("api_route_error", payload);
}

export function emitEmptyStateShown(payload: EmptyStatePayload) {
  emit("empty_state_shown", payload);
}
