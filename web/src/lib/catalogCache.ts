import type { CatalogFilters } from "../api/resources.js";
import { fetchCatalog } from "../api/resources.js";

const CACHE_PREFIX = "mindvault-catalog:";

export interface CatalogFetchResult {
  data: unknown[];
  stale: boolean;
  syncedAt: Date | null;
}

function cacheKey(filters?: CatalogFilters): string {
  return `${CACHE_PREFIX}${JSON.stringify(filters ?? {})}`;
}

/**
 * Fetches the public catalog, persisting the last successful response in
 * sessionStorage so offline / flaky-network views can show cached data with a
 * stale indicator.
 */
export async function fetchCatalogWithCache(filters?: CatalogFilters): Promise<CatalogFetchResult> {
  const key = cacheKey(filters);
  try {
    const data = await fetchCatalog(filters);
    sessionStorage.setItem(key, JSON.stringify({ data, at: Date.now() }));
    return { data, stale: false, syncedAt: new Date() };
  } catch (err) {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const { data, at } = JSON.parse(raw) as { data: unknown[]; at: number };
      return { data, stale: true, syncedAt: new Date(at) };
    }
    throw err;
  }
}
