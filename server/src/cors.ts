import cors, { type CorsOptions } from "cors";
import { config } from "./config.js";

/** Headers clients may send for x402 payment retries and API auth. */
export const X402_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "x-api-key",
  "PAYMENT-SIGNATURE",
  "X-Payment",
] as const;

/** Headers the server exposes for x402 flows and payment receipts. */
export const X402_EXPOSED_HEADERS = [
  "PAYMENT-REQUIRED",
  "PAYMENT-RESPONSE",
  "X-PAYMENT-RESPONSE",
  "X-Payment-Id",
  "X-Payment-Amount",
  "X-Payment-Recipient",
] as const;

export function parseAllowedOrigins(raw: string | undefined, fallback: string): string[] {
  if (raw?.trim()) {
    return raw
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  return [fallback];
}

export function createCorsOptions(): CorsOptions {
  const isProduction = config.NODE_ENV === "production";
  const allowedOrigins = parseAllowedOrigins(config.ALLOWED_ORIGINS, config.WEB_APP_URL);

  return {
    origin: isProduction
      ? (origin, callback) => {
          // Non-browser clients (curl, server-side fetch) omit Origin.
          if (!origin) {
            callback(null, true);
            return;
          }
          if (allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
          }
          callback(new Error(`Origin ${origin} is not allowed by CORS`));
        }
      : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: isProduction ? [...X402_ALLOWED_HEADERS] : "*",
    exposedHeaders: isProduction ? [...X402_EXPOSED_HEADERS] : "*",
  };
}

export function corsMiddleware() {
  return cors(createCorsOptions());
}
