import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** SHA-256 hex digest of an empty body (used for DELETE and bodyless POST). */
export const EMPTY_BODY_HASH = createHash("sha256").update(Buffer.alloc(0)).digest("hex");

export function hashRequestBody(body: Buffer | string): string {
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Canonical SHA-256 of multipart publish fields. Form keys are sorted; when a
 * file is present its raw bytes are hashed and included as `file=<hex>`.
 */
export function hashMultipartBody(
  fields: Record<string, unknown>,
  file?: { buffer: Buffer },
): string {
  const sortedKeys = Object.keys(fields).sort();
  const lines = sortedKeys.map((key) => `${key}=${String(fields[key] ?? "")}`);
  if (file) {
    lines.push(`file=${createHash("sha256").update(file.buffer).digest("hex")}`);
  }
  return hashRequestBody(lines.join("\n"));
}

/** Path and query from the request URL (no scheme/host). */
export function getRequestPath(originalUrl: string): string {
  const hashIndex = originalUrl.indexOf("#");
  return hashIndex === -1 ? originalUrl : originalUrl.slice(0, hashIndex);
}

export function buildCanonicalString(params: {
  method: string;
  path: string;
  timestamp: string;
  bodyHash: string;
  idempotencyKey?: string;
}): string {
  const parts = [
    params.method.toUpperCase(),
    params.path,
    params.timestamp,
    params.bodyHash,
  ];
  if (params.idempotencyKey) {
    parts.push(params.idempotencyKey);
  }
  return parts.join("\n");
}

export function computeRequestSignature(secret: string, canonical: string): string {
  return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

export function signPublisherRequest(params: {
  secret: string;
  method: string;
  path: string;
  timestamp: string;
  bodyHash: string;
  idempotencyKey?: string;
}): string {
  const canonical = buildCanonicalString(params);
  return computeRequestSignature(params.secret, canonical);
}

export function verifyRequestSignature(params: {
  secret: string;
  method: string;
  path: string;
  timestamp: string;
  bodyHash: string;
  idempotencyKey?: string;
  signature: string;
}): boolean {
  const expected = signPublisherRequest(params);
  return timingSafeEqualHex(expected, params.signature);
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length !== 64) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function isTimestampWithinSkew(
  timestampSeconds: number,
  nowMs: number,
  maxSkewMs: number,
): boolean {
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }
  const requestMs = timestampSeconds * 1000;
  return Math.abs(nowMs - requestMs) <= maxSkewMs;
}
