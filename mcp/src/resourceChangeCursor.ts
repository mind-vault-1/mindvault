import type { CatalogCacheContext } from "./catalogCache.js";
import {
  createCursorToken,
  cursorErrorMessage,
  readCursorToken,
  type CursorFailureReason,
} from "./cursorToken.js";

export interface ResourceChangeCursorState {
  price: string | null;
  verificationStatus: string | null;
  listed: boolean | null;
}

export interface ResourceChangeCursorPayload {
  version: 1;
  resourceId: string;
  context: CatalogCacheContext;
  state: ResourceChangeCursorState;
  lastDetectedAt: number;
}

function isState(value: unknown): value is ResourceChangeCursorState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<ResourceChangeCursorState>;
  return (
    (state.price === null || typeof state.price === "string") &&
    (state.verificationStatus === null || typeof state.verificationStatus === "string") &&
    (state.listed === null || typeof state.listed === "boolean")
  );
}

function sameContext(a: unknown, b: CatalogCacheContext): boolean {
  if (!a || typeof a !== "object") return false;
  const context = a as Partial<CatalogCacheContext>;
  return (
    context.profile === b.profile &&
    context.network === b.network &&
    context.contractId === b.contractId &&
    context.apiOrigin === b.apiOrigin
  );
}

export function createResourceChangeCursor(
  resourceId: string,
  state: ResourceChangeCursorState,
  context: CatalogCacheContext,
  now: () => number = Date.now,
): string {
  return createCursorToken(
    "subscription",
    {
      version: 1,
      resourceId,
      context,
      state,
      lastDetectedAt: now(),
    } satisfies ResourceChangeCursorPayload,
    now,
  );
}

export type ResolvedResourceChangeCursor =
  | { ok: true; state: ResourceChangeCursorState; lastDetectedAt: number }
  | { ok: false; reason: CursorFailureReason; error: string };

export function resolveResourceChangeCursor(
  cursor: string | undefined,
  resourceId: string,
  context: CatalogCacheContext,
  now: () => number = Date.now,
): ResolvedResourceChangeCursor {
  if (cursor === undefined) {
    return {
      ok: true,
      state: { price: null, verificationStatus: null, listed: null },
      lastDetectedAt: 0,
    };
  }

  const token = readCursorToken<Partial<ResourceChangeCursorPayload>>(cursor, "subscription", now);
  if (!token.ok) return token;

  const payload = token.payload;
  if (
    payload.version !== 1 ||
    payload.resourceId !== resourceId ||
    !sameContext(payload.context, context) ||
    !isState(payload.state) ||
    typeof payload.lastDetectedAt !== "number" ||
    !Number.isFinite(payload.lastDetectedAt) ||
    payload.lastDetectedAt < 0
  ) {
    return {
      ok: false,
      reason: "invalid",
      error: cursorErrorMessage("subscription", "invalid"),
    };
  }
  return {
    ok: true,
    state: payload.state,
    lastDetectedAt: payload.lastDetectedAt,
  };
}
