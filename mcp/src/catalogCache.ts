/**
 * Offline read-only cache for catalog tools (#556).
 *
 * `browse`, `search`, and `preview` normally depend on the MindVault catalog
 * API. When that service is unreachable (a transport-level failure — DNS,
 * refused connection, or timeout), these tools fall back to the last snapshot
 * captured from a successful read, clearly labelled with the age of the
 * snapshot. Mutating and payment tools never consult this cache.
 *
 * The cache is held in memory for the lifetime of the MCP server process — the
 * same scope as the profile state — so it is available for later offline calls
 * without persisting data to disk. There is deliberately no filesystem use:
 * that keeps the failure "no cache present" deterministic and independent of
 * anything left behind by an earlier run.
 */

export interface CatalogSnapshot {
  resources: unknown[];
  savedAtMs: number;
}

export interface PreviewSnapshot {
  meta: unknown;
  savedAtMs: number;
}

/** Snapshots at or older than this are labelled "stale" rather than "fresh". */
export const CATALOG_CACHE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

let catalog: CatalogSnapshot | null = null;
let previews: Record<string, PreviewSnapshot> = {};

/** Record a successful catalog read. The raw resource array is snapshotted. */
export function recordCatalogSnapshot(resources: unknown[]): void {
  catalog = { resources, savedAtMs: Date.now() };
}

/** The latest catalog snapshot, or null when none has ever been captured. */
export function getCatalogSnapshot(): CatalogSnapshot | null {
  return catalog ? { savedAtMs: catalog.savedAtMs, resources: [...catalog.resources] } : null;
}

/** Record a successful preview read for a resource id. */
export function recordPreviewSnapshot(resourceId: string, meta: unknown): void {
  previews[resourceId] = { meta, savedAtMs: Date.now() };
}

/** The latest preview snapshot for a resource id, or null when absent. */
export function getPreviewSnapshot(resourceId: string): PreviewSnapshot | null {
  const snap = previews[resourceId];
  return snap ? { meta: snap.meta, savedAtMs: snap.savedAtMs } : null;
}

function describeAge(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr`;
  const days = Math.round(hours / 24);
  return `${days} day`;
}

/**
 * Agent-facing label describing the served snapshot and its age. "Fresh"
 * snapshots are served normally; "stale" ones carry a warning to re-check
 * on-chain when freshness matters, mirroring the cacheStaleness guidance.
 */
export function catalogCacheLabel(savedAtMs: number, nowMs: number = Date.now()): string {
  const ageMs = Math.max(0, nowMs - savedAtMs);
  const age = describeAge(ageMs);
  if (ageMs <= CATALOG_CACHE_STALE_AFTER_MS) {
    return `Offline catalog snapshot served (cached ${age} ago) — catalog API unreachable.`;
  }
  return (
    `⚠ Offline catalog snapshot served (cached ${age} ago) — stale; results may be outdated. ` +
    `Confirm a specific resource on-chain with mindvault_registry_lookup when freshness matters.`
  );
}

/** Test-only: clear the in-memory snapshots so the "no cache" path is testable. */
export function _clearCatalogCache(): void {
  catalog = null;
  previews = {};
}
