import * as Sentry from "@sentry/react";

const SENSITIVE_KEYS = [
  "password",
  "secret",
  "key",
  "token",
  "authorization",
  "x-payment",
  "x402",
  "signedXdr",
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lower.includes(sensitive));
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    integrations: [Sentry.browserTracingIntegration()],
    beforeSend(event) {
      // Scrub request headers
      if (event.request?.headers) {
        for (const [key] of Object.entries(event.request.headers)) {
          if (isSensitiveKey(key)) {
            (event.request.headers as Record<string, unknown>)[key] = "[Filtered]";
          }
        }
      }

      // Scrub request data (body)
      if (event.request?.data && typeof event.request.data === "object") {
        const scrubbed: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(event.request.data as Record<string, unknown>)) {
          scrubbed[key] = isSensitiveKey(key) ? "[Filtered]" : value;
        }
        event.request.data = scrubbed;
      }

      // Scrub extra data
      if (event.extra) {
        for (const [key] of Object.entries(event.extra)) {
          if (isSensitiveKey(key)) {
            event.extra[key] = "[Filtered]";
          }
        }
      }

      // Scrub breadcrumbs
      const breadcrumbs = event.breadcrumbs?.values;
      if (breadcrumbs && Array.isArray(breadcrumbs)) {
        for (const breadcrumb of breadcrumbs) {
          if (breadcrumb.data && typeof breadcrumb.data === "object") {
            for (const [key] of Object.entries(breadcrumb.data as Record<string, unknown>)) {
              if (isSensitiveKey(key)) {
                (breadcrumb.data as Record<string, unknown>)[key] = "[Filtered]";
              }
            }
          }
        }
      }

      return event;
    },
  });
}
