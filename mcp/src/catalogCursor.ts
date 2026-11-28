import type { CatalogCacheContext } from "./catalogCache.js";
import type { CatalogFilters } from "./catalogFilters.js";
import {
  createCursorToken,
  cursorErrorMessage,
  readCursorToken,
  type CursorFailureReason,
} from "./cursorToken.js";

export interface CatalogCursorPayload {
  version: 1;
  offset: number;
  fingerprint: string;
  context: CatalogCacheContext;
}

export function catalogFilterFingerprint(filters: CatalogFilters): string {
  const { cursor: _cursor, bypassCache: _bypassCache, offset: _offset, ...rest } = filters;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

export function createCatalogCursor(
  offset: number,
  filters: CatalogFilters,
  context: CatalogCacheContext,
  now: () => number = Date.now,
): string {
  return createCursorToken(
    "catalog",
    {
      version: 1,
      offset,
      fingerprint: catalogFilterFingerprint(filters),
      context,
    } satisfies CatalogCursorPayload,
    now,
  );
}

export type CatalogCursorResult =
  | { ok: true; offset: number }
  | { ok: false; reason: CursorFailureReason; error: string };

export function resolveCatalogCursor(
  cursor: string,
  filters: CatalogFilters,
  context: CatalogCacheContext,
  now: () => number = Date.now,
): CatalogCursorResult {
  const token = readCursorToken<Partial<CatalogCursorPayload>>(cursor, "catalog", now);
  if (!token.ok) return token;

  const payload = token.payload;
  const offset = payload.offset;
  if (
    payload.version !== 1 ||
    !Number.isInteger(offset) ||
    offset === undefined ||
    offset < 0 ||
    payload.fingerprint !== catalogFilterFingerprint(filters) ||
    JSON.stringify(payload.context) !== JSON.stringify(context)
  ) {
    return {
      ok: false,
      reason: "invalid",
      error: cursorErrorMessage("catalog", "invalid"),
    };
  }
  return { ok: true, offset: offset as number };
}
