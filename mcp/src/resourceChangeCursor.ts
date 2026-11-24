import type { CatalogCacheContext } from "./catalogCache.js";

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

function encode(value: ResourceChangeCursorPayload): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
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
  return encode({
    version: 1,
    resourceId,
    context,
    state,
    lastDetectedAt: now(),
  } satisfies ResourceChangeCursorPayload);
}

export type ResolvedResourceChangeCursor =
  | { ok: true; state: ResourceChangeCursorState; lastDetectedAt: number }
  | { ok: false; error: string };

export function resolveResourceChangeCursor(
  cursor: string | undefined,
  resourceId: string,
  context: CatalogCacheContext,
): ResolvedResourceChangeCursor {
  if (cursor === undefined) {
    return {
      ok: true,
      state: { price: null, verificationStatus: null, listed: null },
      lastDetectedAt: 0,
    };
  }

  try {
    const payload = decode(cursor) as Partial<ResourceChangeCursorPayload>;
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
        error:
          "Invalid or stale resource subscription cursor. Start a new subscription for this resource, profile, network, and API.",
      };
    }
    return { ok: true, state: payload.state, lastDetectedAt: payload.lastDetectedAt };
  } catch {
    return {
      ok: false,
      error:
        "Invalid resource subscription cursor. Pass the cursor from the previous mindvault_subscribe_resource call, or omit it to start a new subscription.",
    };
  }
}
