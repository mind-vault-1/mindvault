import { useState } from "react";
import { useAsync } from "./useAsync.js";
import { fetchCatalogWithCache } from "../lib/catalogCache.js";
import type { CatalogFilters } from "../api/resources.js";

export function useCatalog<T>(filters: CatalogFilters) {
  const [stale, setStale] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);

  const asyncState = useAsync<T[]>(
    async (_signal) => {
      const result = await fetchCatalogWithCache(filters);
      setStale(result.stale);
      setSyncedAt(result.syncedAt);
      return result.data as T[];
    },
    [filters],
  );

  return { ...asyncState, stale, syncedAt };
}
