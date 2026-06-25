import { config } from "../config.js";
import { createTtlCache, type TtlCache } from "./ttlCache.js";

// Idempotency support for publish (issue #114). When a client sends an
// `Idempotency-Key`, the first completed publish is remembered so retries with
// the same key return the original response instead of creating a duplicate.
//
// An entry is either "in progress" (a publish is currently running for this
// key) or a stored result. The in-progress marker lets concurrent retries fail
// fast with 409 rather than racing to insert duplicates.

export interface IdempotentResult {
  status: number;
  body: unknown;
}

export type IdempotencyRecord =
  | { inProgress: true }
  | { inProgress: false; result: IdempotentResult };

// Keys are scoped per publisher so one publisher's key can't collide with or
// read another's result.
export function idempotencyCacheKey(publisherId: string, key: string): string {
  return `${publisherId}:${key}`;
}

const defaultStore = createTtlCache<IdempotencyRecord>({
  defaultTtlMs: config.IDEMPOTENCY_TTL_MS,
});

export function getIdempotencyStore(): TtlCache<IdempotencyRecord> {
  return defaultStore;
}
