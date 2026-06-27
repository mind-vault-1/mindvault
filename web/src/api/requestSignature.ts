/**
 * HMAC-SHA256 request signing for publisher mutations.
 * Mirrors server/src/utils/requestSignature.ts — keep in sync when changing the scheme.
 */

export const EMPTY_BODY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function buildCanonicalString(params: {
  method: string;
  path: string;
  timestamp: string;
  bodyHash: string;
  idempotencyKey?: string;
}): string {
  const parts = [params.method.toUpperCase(), params.path, params.timestamp, params.bodyHash];
  if (params.idempotencyKey) {
    parts.push(params.idempotencyKey);
  }
  return parts.join("\n");
}

export async function hashRequestBody(body: string): Promise<string> {
  return sha256Hex(body);
}

export async function signPublisherRequestHeaders(params: {
  apiKey: string;
  method: string;
  path: string;
  body?: string;
  idempotencyKey?: string;
}): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyHash = params.body ? await hashRequestBody(params.body) : EMPTY_BODY_HASH;
  const canonical = buildCanonicalString({
    method: params.method,
    path: params.path,
    timestamp,
    bodyHash,
    idempotencyKey: params.idempotencyKey,
  });
  const signature = await hmacSha256Hex(params.apiKey, canonical);
  return {
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  };
}

/** Authenticated JSON fetch with optional request signing headers. */
export async function signedPublisherFetch(
  url: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : undefined;
  const path = new URL(url).pathname + new URL(url).search;
  const idempotencyKey =
    init.headers instanceof Headers
      ? (init.headers.get("Idempotency-Key") ?? undefined)
      : (init.headers as Record<string, string> | undefined)?.["Idempotency-Key"];

  const signatureHeaders = await signPublisherRequestHeaders({
    apiKey,
    method,
    path,
    body: method === "GET" || method === "DELETE" ? undefined : body,
    idempotencyKey,
  });

  const headers = new Headers(init.headers);
  headers.set("x-api-key", apiKey);
  if (body) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-Timestamp", signatureHeaders["X-Timestamp"]);
  headers.set("X-Signature", signatureHeaders["X-Signature"]);

  return fetch(url, { ...init, headers });
}
