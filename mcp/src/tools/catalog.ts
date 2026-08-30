import { BASE_URL, jsonFetch } from "../runtime.js";
import {
  applyCatalogSort,
  applyClientCatalogFilters,
  buildCatalogQueryString,
  describeCatalogFilters,
  type CatalogFilters,
} from "../catalogFilters.js";
import {
  catalogCacheLabel,
  getCatalogSnapshot,
  getPreviewSnapshot,
  recordCatalogSnapshot,
  recordPreviewSnapshot,
} from "../catalogCache.js";
import { cacheStalenessNotice } from "../cacheStaleness.js";
import { mapHttpError, mcpError, throwHttpError } from "../errorMapping.js";
import { truncateResponse } from "../truncation.js";
import { applyPreviewLimits, serializePreview } from "../previewLimits.js";
import { formatResource } from "./registry.js";

interface CatalogLoad {
  items: any[];
  notice: string | null;
  fromCache: boolean;
}

async function loadCatalog(url: string, operation: string): Promise<CatalogLoad> {
  let res;
  try {
    res = await jsonFetch(url);
  } catch (err) {
    const snapshot = getCatalogSnapshot();
    if (!snapshot) throw err;
    return {
      items: Array.isArray(snapshot.resources) ? (snapshot.resources as any[]) : [],
      notice: catalogCacheLabel(snapshot.savedAtMs),
      fromCache: true,
    };
  }
  if (!res.ok) {
    throw mcpError(mapHttpError({ operation, source: "api", status: res.status, data: res.data }));
  }
  const items = Array.isArray(res.data) ? res.data : [];
  recordCatalogSnapshot(items);
  return { items, notice: cacheStalenessNotice(res.headers), fromCache: false };
}

export async function browse(filters: CatalogFilters = {}): Promise<string> {
  const qs = buildCatalogQueryString(filters);
  const url = qs ? `${BASE_URL}/resources?${qs}` : `${BASE_URL}/resources`;
  const { items: raw, notice } = await loadCatalog(url, "Browse failed");
  const items = applyCatalogSort(applyClientCatalogFilters(raw, filters), filters.sort);
  const body =
    items.length === 0
      ? filters.query ||
        filters.minPrice ||
        filters.maxPrice ||
        filters.verificationStatus ||
        filters.resourceType ||
        filters.owner ||
        filters.tags?.length ||
        filters.listed !== undefined
        ? `No resources match ${describeCatalogFilters(filters)}.`
        : "No resources listed yet."
      : items.map(formatResource).join("\n\n");
  const full = notice ? `${body}\n\n${notice}` : body;
  return truncateResponse(full);
}

export async function search(filtersOrQuery: string | CatalogFilters): Promise<string> {
  const filters: CatalogFilters =
    typeof filtersOrQuery === "string" ? { query: filtersOrQuery } : filtersOrQuery;

  const hasCriteria = Boolean(
    filters.query?.trim() ||
    filters.minPrice ||
    filters.maxPrice ||
    filters.verificationStatus ||
    filters.resourceType ||
    filters.owner ||
    filters.sort ||
    filters.limit !== undefined ||
    filters.offset !== undefined ||
    (filters.tags && filters.tags.length > 0) ||
    filters.listed !== undefined,
  );
  if (!hasCriteria) return "Provide a search query or at least one catalog filter.";

  const qs = buildCatalogQueryString(filters);
  const url = qs ? `${BASE_URL}/resources?${qs}` : `${BASE_URL}/resources`;
  const { items: raw, notice, fromCache } = await loadCatalog(url, "Search failed");
  const items = applyCatalogSort(applyClientCatalogFilters(raw, filters), filters.sort);

  if (items.length === 0) return `No resources match ${describeCatalogFilters(filters)}.`;
  const body = items.map(formatResource).join("\n\n");
  const full = fromCache && notice ? `${body}\n\n${notice}` : body;
  return truncateResponse(full);
}

async function previewData(resourceId: string): Promise<{ r: any; label: string | null }> {
  try {
    const res = await jsonFetch(`${BASE_URL}/resources/${resourceId}/meta`);
    if (!res.ok)
      throwHttpError({
        operation: "Preview failed",
        source: "api",
        status: res.status,
        data: res.data,
      });
    recordPreviewSnapshot(resourceId, res.data);
    return { r: res.data, label: null };
  } catch (err) {
    const snap = getPreviewSnapshot(resourceId);
    if (!snap) throw err;
    return { r: snap.meta as any, label: catalogCacheLabel(snap.savedAtMs) };
  }
}

export async function preview(resourceId: string): Promise<string> {
  const { r, label } = await previewData(resourceId);
  const out: Record<string, unknown> = {
    id: r.id,
    title: r.title,
    description: r.description,
    price: `$${r.price} USDC`,
    type: r.resourceType,
    verificationStatus: r.verificationStatus,
    accessUrl: r.accessUrl,
  };
  if (label) out.offlineCache = label;
  // Publisher-supplied title/description are unbounded at the source, so cap
  // them before serializing rather than truncating the JSON afterwards (#582).
  return serializePreview(applyPreviewLimits(out));
}
