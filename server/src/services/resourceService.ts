import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { resources, publishers, verifications } from "../db/schema.js";
import { uploadFile, deleteFile } from "../storage/supabaseStorage.js";
import { hashFileResource, hashLinkResource } from "../utils/crypto.js";
import { createTtlCache } from "../lib/ttlCache.js";
import { config } from "../config.js";

export type CatalogFilters = {
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  verificationStatus?: "pending" | "verified" | "rejected" | "skipped";
  resourceType?: "file" | "link";
};

// Short-lived cache for catalog/preview reads (issue #115). These endpoints are
// hit far more often than resources change, so a small TTL cuts repeated DB
// work while keeping newly published/delisted items fresh within seconds.
const CATALOG_KEY = "catalog";
const metaKey = (id: string) => `meta:${id}`;
const readCache = createTtlCache<unknown>({ defaultTtlMs: config.CATALOG_CACHE_TTL_MS });

export interface CatalogFilters {
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  verificationStatus?: "pending" | "verified" | "rejected" | "skipped";
  resourceType?: "file" | "link";
}

function buildCatalogWhereClause(filters?: CatalogFilters) {
  const clauses: any[] = [eq(resources.listed, true)];

  const search = filters?.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    clauses.push(
      sql<boolean>`(${resources.title} ILIKE ${pattern} OR COALESCE(${resources.description}, '') ILIKE ${pattern})`,
    );
  }

  if (filters?.minPrice?.trim()) {
    const minPrice = filters.minPrice.trim();
    clauses.push(sql<boolean>`CAST(${resources.price} AS numeric) >= ${minPrice}`);
  }

  if (filters?.maxPrice?.trim()) {
    const maxPrice = filters.maxPrice.trim();
    clauses.push(sql<boolean>`CAST(${resources.price} AS numeric) <= ${maxPrice}`);
  }

  if (filters?.verificationStatus) {
    clauses.push(eq(resources.verificationStatus, filters.verificationStatus));
  }

  if (filters?.resourceType) {
    clauses.push(eq(resources.resourceType, filters.resourceType));
  }

  return and(...clauses);
}

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
};

function catalogCacheKey(filters?: CatalogListFilters): string {
  if (!filters?.verificationStatus) return CATALOG_KEY;
  return `${CATALOG_KEY}:verificationStatus=${filters.verificationStatus}`;
}

async function queryCatalog(filters?: CatalogListFilters) {
  const conditions = [eq(resources.listed, true)];
  if (filters?.verificationStatus) {
    conditions.push(eq(resources.verificationStatus, filters.verificationStatus));
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
    .where(and(...conditions));
}

export async function listCatalog(
  searchTerm?: string,
): Promise<Awaited<ReturnType<typeof queryCatalog>>> {
  let rows: Awaited<ReturnType<typeof queryCatalog>>;

  const cached = readCache.get(CATALOG_KEY);
  if (cached !== undefined) {
    rows = cached as Awaited<ReturnType<typeof queryCatalog>>;
  } else {
    rows = await queryCatalog();
    readCache.set(CATALOG_KEY, rows);
  }

  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    return rows.filter(
      (r) => r.title?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q),
    );
  }

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
