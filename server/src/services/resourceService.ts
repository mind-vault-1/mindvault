import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { resources, publishers, verifications } from "../db/schema.js";
import { uploadFile, deleteFile } from "../storage/supabaseStorage.js";
import { hashFileResource, hashLinkResource } from "../utils/crypto.js";
import { createTtlCache } from "../lib/ttlCache.js";
import { config } from "../config.js";

// Short-lived cache for catalog/preview reads (issue #115). These endpoints are
// hit far more often than resources change, so a small TTL cuts repeated DB
// work while keeping newly published/delisted items fresh within seconds.
const CATALOG_KEY = "catalog";
const metaKey = (id: string) => `meta:${id}`;
const readCache = createTtlCache<unknown>({ defaultTtlMs: config.CATALOG_CACHE_TTL_MS });

// Drop cached reads affected by a write. The catalog (the listed set) is always
// invalidated; the specific resource's preview is dropped too when known.
function invalidateReads(resourceId?: string): void {
  readCache.delete(CATALOG_KEY);
  if (resourceId) readCache.delete(metaKey(resourceId));
}

/** Test helper — clear the read cache between cases. */
export function __resetCatalogCache(): void {
  readCache.clear();
}

export async function createFileResource(data: {
  publisherId: string;
  title: string;
  description?: string;
  price: string;
  walletAddress: string;
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
}) {
  const contentHash = hashFileResource(data.fileBuffer, data.title);

  const [resource] = await db
    .insert(resources)
    .values({
      publisherId: data.publisherId,
      title: data.title,
      description: data.description,
      price: data.price,
      walletAddress: data.walletAddress,
      resourceType: "file",
      mimeType: data.mimeType,
      contentHash,
    })
    .returning();

  const storagePath = await uploadFile(resource.id, data.fileBuffer, data.filename, data.mimeType);

  const [updated] = await db
    .update(resources)
    .set({ storagePath })
    .where(eq(resources.id, resource.id))
    .returning();

  invalidateReads(updated.id);
  return updated;
}

export async function createLinkResource(data: {
  publisherId: string;
  title: string;
  description?: string;
  price: string;
  walletAddress: string;
  externalUrl: string;
}) {
  const [resource] = await db
    .insert(resources)
    .values({
      publisherId: data.publisherId,
      title: data.title,
      description: data.description,
      price: data.price,
      walletAddress: data.walletAddress,
      resourceType: "link",
      externalUrl: data.externalUrl,
      contentHash: hashLinkResource(data.externalUrl, data.title),
    })
    .returning();

  invalidateReads(resource.id);
  return resource;
}

export async function getResourceById(id: string) {
  return db
    .select()
    .from(resources)
    .where(eq(resources.id, id))
    .then((rows) => rows[0] ?? null);
}

export type CatalogSort = "newest" | "price_asc" | "price_desc" | "title";

export type CatalogListFilters = {
  verificationStatus?: "verified" | "pending" | "rejected";
  minPrice?: string;
  maxPrice?: string;
  search?: string;
  resourceType?: "file" | "link";
  sort?: CatalogSort;
  limit?: number;
  offset?: number;
};

export type CatalogPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
};

const CATALOG_DEFAULT_LIMIT = 20;

function sortRows<T extends { price: string; title: string; createdAt: Date | string }>(
  rows: T[],
  sort: CatalogSort,
): T[] {
  const sorted = [...rows];
  switch (sort) {
    case "price_asc":
      sorted.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
      break;
    case "price_desc":
      sorted.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
      break;
    case "title":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "newest":
    default:
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
  }
  return sorted;
}

async function queryCatalog() {
  return db
    .select({
      id: resources.id,
      title: resources.title,
      description: resources.description,
      price: resources.price,
      resourceType: resources.resourceType,
      mimeType: resources.mimeType,
      verificationStatus: resources.verificationStatus,
      publisherName: publishers.name,
      createdAt: resources.createdAt,
    })
    .from(resources)
    .innerJoin(publishers, eq(resources.publisherId, publishers.id))
    .where(eq(resources.listed, true));
}

async function getCachedCatalogRows(): Promise<Awaited<ReturnType<typeof queryCatalog>>> {
  const cached = readCache.get(CATALOG_KEY);
  if (cached !== undefined) {
    return cached as Awaited<ReturnType<typeof queryCatalog>>;
  }
  const rows = await queryCatalog();
  readCache.set(CATALOG_KEY, rows);
  return rows;
}

function applyCatalogFilters<
  T extends {
    title: string;
    description: string | null;
    price: string;
    verificationStatus: string;
    resourceType: string;
  },
>(rows: T[], filters?: CatalogListFilters): T[] {
  if (!filters) return rows;

  const search = filters.search?.toLowerCase();
  // Prices are stored as decimal strings (e.g. "0.50"); compare numerically and
  // inclusively, parsing only at the point of comparison.
  const min = filters.minPrice !== undefined ? parseFloat(filters.minPrice) : undefined;
  const max = filters.maxPrice !== undefined ? parseFloat(filters.maxPrice) : undefined;

  return rows.filter((r) => {
    if (
      search &&
      !(r.title?.toLowerCase().includes(search) || r.description?.toLowerCase().includes(search))
    ) {
      return false;
    }
    if (min !== undefined && parseFloat(r.price) < min) return false;
    if (max !== undefined && parseFloat(r.price) > max) return false;
    if (filters.verificationStatus && r.verificationStatus !== filters.verificationStatus) {
      return false;
    }
    if (filters.resourceType && r.resourceType !== filters.resourceType) return false;
    return true;
  });
}

// The full listed set is cached once under CATALOG_KEY and all filtering happens
// in memory. Price is a continuous value, so a per-filter cache key would blow up
// cardinality; filtering after a single cached read keeps the cache correct and
// mirrors how the search filter already works (issue #159).
//
// `sort` (#163) and `limit`/`offset` (#162) are applied after filtering, in that
// order, so pagination always walks a stable, sorted sequence. Omitting limit/offset
// preserves the historical "return everything" behavior for existing callers.
export async function listCatalog(
  filters?: CatalogListFilters,
): Promise<Awaited<ReturnType<typeof queryCatalog>>> {
  const rows = await getCachedCatalogRows();
  const filtered = applyCatalogFilters(rows, filters);

  if (!filters) return filtered;

  const sorted = filters.sort ? sortRows(filtered, filters.sort) : filtered;

  if (filters.limit === undefined && filters.offset === undefined) return sorted;

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? CATALOG_DEFAULT_LIMIT;
  return sorted.slice(offset, offset + limit);
}

/** Total count of listed resources matching `filters`, ignoring limit/offset (#162). */
export async function countCatalog(filters?: CatalogListFilters): Promise<number> {
  const rows = await getCachedCatalogRows();
  return applyCatalogFilters(rows, filters).length;
}

async function queryResourceMeta(id: string) {
  return db
    .select({
      id: resources.id,
      title: resources.title,
      description: resources.description,
      price: resources.price,
      resourceType: resources.resourceType,
      mimeType: resources.mimeType,
      verificationStatus: resources.verificationStatus,
      publisherName: publishers.name,
      publisherWallet: resources.walletAddress,
      onchainStatus: resources.onchainStatus,
      onchainTxHash: resources.onchainTxHash,
      contentHash: resources.contentHash,
      createdAt: resources.createdAt,
    })
    .from(resources)
    .innerJoin(publishers, eq(resources.publisherId, publishers.id))
    .where(eq(resources.id, id))
    .then((rows) => rows[0] ?? null);
}

export async function getResourceMeta(
  id: string,
): Promise<Awaited<ReturnType<typeof queryResourceMeta>>> {
  const cached = readCache.get(metaKey(id));
  if (cached !== undefined) return cached as Awaited<ReturnType<typeof queryResourceMeta>>;

  const result = await queryResourceMeta(id);
  // Only cache hits; a 404 (null) stays uncached so a freshly created resource
  // becomes visible immediately.
  if (result) readCache.set(metaKey(id), result);
  return result;
}

export async function delistResource(id: string, publisherId: string) {
  const [resource] = await db
    .update(resources)
    .set({ listed: false })
    .where(and(eq(resources.id, id), eq(resources.publisherId, publisherId)))
    .returning();

  if (!resource) return null;

  invalidateReads(resource.id);

  if (resource.storagePath) {
    await deleteFile(resource.storagePath);
  }

  return resource;
}

export async function getVerificationDetails(resourceId: string) {
  const resource = await db
    .select({
      id: resources.id,
      title: resources.title,
      verificationStatus: resources.verificationStatus,
      verificationId: resources.verificationId,
      listed: resources.listed,
      createdAt: resources.createdAt,
    })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .then((rows) => rows[0] ?? null);

  if (!resource) return null;

  let verification = null;
  if (resource.verificationId) {
    verification = await db
      .select()
      .from(verifications)
      .where(eq(verifications.id, resource.verificationId))
      .then((rows) => rows[0] ?? null);
  }

  return {
    resourceId: resource.id,
    title: resource.title,
    status: resource.verificationStatus,
    listed: resource.listed,
    publishedAt: resource.createdAt,
    verification: verification
      ? {
          isOriginal: verification.isOriginal,
          confidence: verification.confidence,
          flags: verification.flags ? JSON.parse(verification.flags) : [],
          checkedAt: verification.checkedAt,
        }
      : null,
  };
}
