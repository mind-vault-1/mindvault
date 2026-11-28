import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { ErrorCode } from "./errorCodes.js";
import type { ErrorSource, MappedError } from "./errorMapping.js";

export const CURSOR_TOKEN_VERSION = 2;
export const CURSOR_TTL_MS = 15 * 60 * 1000;
const MIN_SIGNING_KEY_LENGTH = 32;
const MAX_TOKEN_LENGTH = 4096;
const MAX_CLOCK_SKEW_MS = 60_000;

export type CursorKind = "catalog" | "registry" | "subscription";
export type CursorFailureReason = "invalid" | "tampered" | "expired";

interface CursorBody<T> {
  v: 2;
  k: CursorKind;
  iat: number;
  exp: number;
  p: T;
}

interface CursorEnvelope<T> extends CursorBody<T> {
  sig: string;
}

export type CursorTokenResult<T> =
  | { ok: true; payload: T }
  | { ok: false; reason: CursorFailureReason; error: string };

const LABELS: Record<CursorKind, string> = {
  catalog: "catalog",
  registry: "registry",
  subscription: "resource subscription",
};

const RECOVERY: Record<CursorKind, string> = {
  catalog: "Omit the cursor to start a new browse or search.",
  registry: "Omit the cursor to start from the first page.",
  subscription: "Omit the cursor to start a new subscription.",
};

export const CURSOR_ERROR_CODES: Record<CursorFailureReason, ErrorCode> = {
  invalid: "MV_CURSOR_INVALID",
  tampered: "MV_CURSOR_TAMPERED",
  expired: "MV_CURSOR_EXPIRED",
};

const ERROR_ACTIONS: Record<CursorFailureReason, string> = {
  invalid:
    "Omit the cursor and start again. Cursors are opaque tokens; do not edit or combine them.",
  tampered:
    "Discard the cursor and use the nextCursor returned by the previous call. Do not edit or combine tokens.",
  expired: `Omit the cursor to start again. Cursors expire after ${CURSOR_TTL_MS / 60_000} minutes.`,
};

const processSigningKey = randomBytes(32).toString("hex");

function signingKey(): string {
  const configured = process.env.MINDVAULT_CURSOR_SIGNING_KEY;
  return configured && configured.length >= MIN_SIGNING_KEY_LENGTH ? configured : processSigningKey;
}

function sign(body: CursorBody<unknown>): string {
  return createHmac("sha256", signingKey()).update(JSON.stringify(body)).digest("hex");
}

export function cursorErrorMessage(kind: CursorKind, reason: CursorFailureReason): string {
  if (reason === "expired") {
    return `Expired ${LABELS[kind]} cursor (valid for ${CURSOR_TTL_MS / 60_000} minutes). ${RECOVERY[kind]}`;
  }
  const prefix = reason === "tampered" ? "Tampered" : "Invalid";
  return `${prefix} ${LABELS[kind]} cursor. ${RECOVERY[kind]}`;
}

export function createCursorToken<T>(
  kind: CursorKind,
  payload: T,
  now: () => number = Date.now,
): string {
  const issuedAt = now();
  const body: CursorBody<T> = {
    v: CURSOR_TOKEN_VERSION,
    k: kind,
    iat: issuedAt,
    exp: issuedAt + CURSOR_TTL_MS,
    p: payload,
  };
  return Buffer.from(JSON.stringify({ ...body, sig: sign(body) }), "utf8").toString("base64url");
}

export function readCursorToken<T>(
  token: string,
  kind: CursorKind,
  now: () => number = Date.now,
): CursorTokenResult<T> {
  const fail = (reason: CursorFailureReason) => ({
    ok: false as const,
    reason,
    error: cursorErrorMessage(kind, reason),
  });

  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return fail("invalid");
  }

  let envelope: Partial<CursorEnvelope<unknown>>;
  try {
    envelope = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as Partial<
      CursorEnvelope<unknown>
    >;
  } catch {
    return fail("invalid");
  }

  if (
    !envelope ||
    typeof envelope !== "object" ||
    envelope.v !== CURSOR_TOKEN_VERSION ||
    envelope.k !== kind ||
    typeof envelope.iat !== "number" ||
    !Number.isInteger(envelope.iat) ||
    envelope.iat < 0 ||
    typeof envelope.exp !== "number" ||
    !Number.isInteger(envelope.exp) ||
    envelope.exp <= envelope.iat ||
    !envelope.p ||
    typeof envelope.p !== "object" ||
    Array.isArray(envelope.p) ||
    typeof envelope.sig !== "string"
  ) {
    return fail("invalid");
  }

  const body: CursorBody<unknown> = {
    v: CURSOR_TOKEN_VERSION,
    k: kind,
    iat: envelope.iat,
    exp: envelope.exp,
    p: envelope.p,
  };
  const expected = Buffer.from(sign(body), "utf8");
  const actual = Buffer.from(envelope.sig, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return fail("tampered");
  }

  const current = now();
  if (!Number.isFinite(current) || current < envelope.iat - MAX_CLOCK_SKEW_MS) {
    return fail("invalid");
  }
  if (current >= envelope.exp) return fail("expired");

  return { ok: true, payload: envelope.p as T };
}

export function cursorMappedError(input: {
  operation: string;
  reason: CursorFailureReason;
  error: string;
  source?: ErrorSource;
}): MappedError {
  return {
    source: input.source ?? "api",
    category: "validation",
    summary: `${input.operation}: ${input.error}`,
    detail: input.error,
    action: ERROR_ACTIONS[input.reason],
    code: CURSOR_ERROR_CODES[input.reason],
  };
}
