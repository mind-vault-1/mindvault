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

export type CatalogListFilters = {
  verificationStatus?: "verified" | "pending" | "rejected";
  minPrice?: string;
  maxPrice?: string;
  search?: string;
  resourceType?: "file" | "link";
};

function catalogCacheKey(filters?: CatalogListFilters): string {
  if (!filters) return CATALOG_KEY;
  const parts: string[] = [];
  if (filters.verificationStatus) parts.push(`verificationStatus=${filters.verificationStatus}`);
  if (filters.minPrice) parts.push(`minPrice=${filters.minPrice}`);
  if (filters.maxPrice) parts.push(`maxPrice=${filters.maxPrice}`);
  if (filters.search) parts.push(`search=${filters.search}`);
  if (filters.resourceType) parts.push(`resourceType=${filters.resourceType}`);
  return parts.length ? `${CATALOG_KEY}:${parts.join(":")}` : CATALOG_KEY;
}

async function queryCatalog(filters?: CatalogListFilters) {
  const conditions = [eq(resources.listed, true)];
  if (filters?.verificationStatus) {
    conditions.push(eq(resources.verificationStatus, filters.verificationStatus));
  }
  if (filters?.minPrice?.trim()) {
    conditions.push(sql<boolean>`CAST(${resources.price} AS numeric) >= ${filters.minPrice.trim()}`);
  }
  if (filters?.maxPrice?.trim()) {
    conditions.push(sql<boolean>`CAST(${resources.price} AS numeric) <= ${filters.maxPrice.trim()}`);
  }
  if (filters?.search?.trim()) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(
      sql<boolean>`(${resources.title} ILIKE ${pattern} OR COALESCE(${resources.description}, '') ILIKE ${pattern})`,
    );
  }
  if (filters?.resourceType) {
    conditions.push(eq(resources.resourceType, filters.resourceType));
  }

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

// The full listed set is cached once under CATALOG_KEY and all filtering happens
// in memory. Price is a continuous value, so a per-filter cache key would blow up
// cardinality; filtering after a single cached read keeps the cache correct and
// mirrors how the search filter already works (issue #159).
export async function listCatalog(
  filters?: CatalogListFilters,
): Promise<Awaited<ReturnType<typeof queryCatalog>>> {
  const cacheKey = catalogCacheKey(filters);
  const cached = readCache.get(cacheKey);
  if (cached !== undefined) {
    return cached as Awaited<ReturnType<typeof queryCatalog>>;
  }

  const rows = await queryCatalog(filters);
  readCache.set(cacheKey, rows);
  return rows;
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
