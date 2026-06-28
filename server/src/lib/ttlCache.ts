import { cacheHits, cacheMisses } from "./metrics.js";

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
  /**
   * Optional cap on the number of live entries. When a new key would exceed the
   * cap, the oldest inserted key is evicted (FIFO). Bounds memory for caches
   * keyed by high-cardinality inputs (e.g. per-filter catalog responses, #316).
   */
  maxSize?: number;
  /**
   * When set, tracks get() hits/misses via prom-client counters under this
   * label value. The metrics are already registered in metrics.ts as
   * cache_hits_total and cache_misses_total.
   */
  cacheName?: string;
}

// Factory so callers (and tests) hold their own isolated instance rather than
// sharing module-level state.
export function createTtlCache<T>(options: TtlCacheOptions): TtlCache<T> {
  const store = new Map<string, Entry<T>>();
  const now = options.now ?? Date.now;
  const defaultTtlMs = options.defaultTtlMs;
  const maxSize = options.maxSize;
  const cacheName = options.cacheName;

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) {
        if (cacheName) cacheMisses.inc({ cache: cacheName });
        return undefined;
      }
      if (now() >= entry.expiresAt) {
        store.delete(key);
        if (cacheName) cacheMisses.inc({ cache: cacheName });
        return undefined;
      }
      if (cacheName) cacheHits.inc({ cache: cacheName });
      return entry.value;
    },
    set(key, value, ttlMs) {
      // Re-inserting refreshes the value; only enforce the cap when adding a
      // genuinely new key, evicting the oldest (first-inserted) entry.
      if (maxSize !== undefined && !store.has(key) && store.size >= maxSize) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
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
