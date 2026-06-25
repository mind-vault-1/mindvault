// Generic in-memory cache with per-entry expiry. Generalizes the bespoke
// price cache in stellarRegistry.ts so other short-lived caches (catalog reads,
// idempotency records) share one well-tested implementation.
//
// Single-process only: state lives in a Map and is not shared across replicas
// or preserved across restarts. That is sufficient for the cut-DB-load and
// retry-dedupe use cases it backs.

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface TtlCache<T> {
  /** Returns the value if present and unexpired; evicts and returns undefined otherwise. */
  get(key: string): T | undefined;
  /** Stores a value, expiring after ttlMs (falls back to the cache's default TTL). */
  set(key: string, value: T, ttlMs?: number): void;
  delete(key: string): void;
  clear(): void;
}

export interface TtlCacheOptions {
  defaultTtlMs: number;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

// Factory so callers (and tests) hold their own isolated instance rather than
// sharing module-level state.
export function createTtlCache<T>(options: TtlCacheOptions): TtlCache<T> {
  const store = new Map<string, Entry<T>>();
  const now = options.now ?? Date.now;
  const defaultTtlMs = options.defaultTtlMs;

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value, ttlMs) {
      store.set(key, { value, expiresAt: now() + (ttlMs ?? defaultTtlMs) });
    },
    delete(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}
