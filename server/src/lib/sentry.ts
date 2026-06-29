import * as Sentry from "@sentry/node";
import { config } from "../config.js";

const SENSITIVE_KEYS = [
  "password",
  "secret",
  "key",
  "token",
  "authorization",
  "x-payment",
  "x402",
  "signedXdr",
  "AGENT_SECRET_KEY",
  "REGISTRY_SECRET_KEY",
  "SUPABASE_SERVICE_KEY",
  "OPENROUTER_API_KEY",
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => lower.includes(sensitive));
}

export function initSentry(): void {
  if (!config.SENTRY_DSN) return;

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: config.NODE_ENV === "production" ? 0.2 : 1.0,
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

      // Scrub extra data and contexts
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

export function captureServerException(err: unknown): void {
  Sentry.captureException(err);
}
