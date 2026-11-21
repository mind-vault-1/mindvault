/**
 * Compare cached catalog records with on-chain registry state (#1203).
 *
 * The offline catalog cache (catalogCache.ts) serves snapshots when the API is
 * unreachable, so a snapshot that has drifted from the contract can lead an
 * agent to act on outdated pricing, listing state or ownership. This module
 * reports that drift resource by resource. It answers a different question
 * from mindvault_metadata_diff: that tool compares the *live* API with the
 * chain, while this one compares what the server would *serve from cache* with
 * the chain, and needs no API access.
 *
 * The module is pure. The on-chain read is injected as `lookup`, so it can be
 * tested without a Soroban RPC, and the report depends only on its inputs:
 * resources are compared in sorted id order, one lookup at a time, and no
 * wall-clock value is read.
 */

import type { CatalogSnapshot, PreviewSnapshot } from "./catalogCache.js";
import { stroopsToUsdc, usdcToStroops } from "./usdcAmount.js";

/** Upper bound on resources compared in one call; each costs one RPC read. */
export const CACHE_CHAIN_DIFF_MAX_RESOURCES = 50;
/** Default number of cached resources compared when no ids are given. */
export const CACHE_CHAIN_DIFF_DEFAULT_LIMIT = 20;

/** The cached fields compared, normalized to on-chain vocabulary. */
export interface CachedRecord {
  price: string | null;
  metadata: string | null;
  listed: boolean | null;
  creator: string | null;
  tags: string[];
}

/** The on-chain fields compared. `price` is in stroops. */
export interface OnchainRecord {
  price: bigint | number | string;
  metadata: string | null;
  listed: boolean;
  creator: string | null;
  tags: string[];
}

export type OnchainLookupResult =
  | { found: true; record: OnchainRecord }
  | { found: false }
  | { error: string };

export type OnchainLookup = (resourceId: string) => Promise<OnchainLookupResult>;

export type FieldStatus = "match" | "mismatch" | "missing_cache" | "missing_onchain";

export interface CacheFieldDiff {
  field: "price" | "metadata" | "listed" | "creator" | "tags";
  status: FieldStatus;
  cached: unknown;
  onchain: unknown;
}

export type ResourceDiffStatus =
  | "in_sync"
  | "drift"
  | "missing_onchain"
  | "missing_in_cache"
  | "not_found"
  | "lookup_failed";

export interface ResourceDiff {
  resourceId: string;
  status: ResourceDiffStatus;
  cachedAt: string | null;
  fields: CacheFieldDiff[];
  error: string | null;
}

export type CacheChainVerdict = "in_sync" | "drift" | "incomplete" | "no_cache";

export interface CacheChainDiffContext {
  profile: string;
  network: string;
  contractId: string;
  apiOrigin: string;
  rpcUrl: string;
}

export interface CacheChainDiffReport {
  context: CacheChainDiffContext;
  cache: {
    snapshotCount: number;
    cachedResourceCount: number;
    oldestSnapshotAt: string | null;
    newestSnapshotAt: string | null;
  };
  requested: string[] | null;
  compared: number;
  truncated: boolean;
  counts: Record<ResourceDiffStatus, number>;
  verdict: CacheChainVerdict;
  results: ResourceDiff[];
  nextSteps: string[];
}

export interface CachedSnapshots {
  catalog: Array<{ key: string; snapshot: CatalogSnapshot }>;
  previews: Array<{ resourceId: string; snapshot: PreviewSnapshot }>;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Normalize one API catalog record (as cached) to the compared fields. */
export function toCachedRecord(raw: Record<string, unknown>): CachedRecord {
  const priceText =
    typeof raw.price === "number" ? String(raw.price) : typeof raw.price === "string" ? raw.price : null;
  const stroops = priceText === null ? null : usdcToStroops(priceText);
  return {
    // A price that is not a USDC decimal is kept verbatim so the diff shows it.
    price: stroops === null ? priceText : stroopsToUsdc(stroops),
    metadata: str(raw.accessUrl) ?? str(raw.metadata),
    listed:
      typeof raw.verificationStatus === "string"
        ? raw.verificationStatus === "verified"
        : typeof raw.listed === "boolean"
          ? raw.listed
          : null,
    creator: str(raw.ownerAddress) ?? str(raw.creator),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [],
  };
}

/**
 * Fold every snapshot into one record per resource id. When a resource appears
 * in several snapshots the newest wins; on a tie the later key wins, which is
 * stable because snapshots arrive sorted by key.
 */
export function collectCachedRecords(
  snapshots: CachedSnapshots,
): Map<string, { record: CachedRecord; savedAtMs: number }> {
  const out = new Map<string, { record: CachedRecord; savedAtMs: number }>();
  const offer = (raw: unknown, savedAtMs: number) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const id = str((raw as Record<string, unknown>).id);
    if (!id) return;
    const held = out.get(id);
    if (held && held.savedAtMs > savedAtMs) return;
    out.set(id, { record: toCachedRecord(raw as Record<string, unknown>), savedAtMs });
  };
  for (const { snapshot } of snapshots.catalog) {
    for (const raw of snapshot.resources) offer(raw, snapshot.savedAtMs);
  }
  for (const { resourceId, snapshot } of snapshots.previews) {
    const meta = snapshot.meta;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      offer({ id: resourceId, ...(meta as Record<string, unknown>) }, snapshot.savedAtMs);
    }
  }
  return out;
}

function onchainPrice(price: OnchainRecord["price"]): string | null {
  try {
    return stroopsToUsdc(BigInt(price));
  } catch {
    return null;
  }
}

function compareField(
  field: CacheFieldDiff["field"],
  cached: unknown,
  onchain: unknown,
): CacheFieldDiff {
  if (cached === null && onchain === null) return { field, status: "match", cached, onchain };
  if (cached === null) return { field, status: "missing_cache", cached, onchain };
  if (onchain === null) return { field, status: "missing_onchain", cached, onchain };
  const same =
    Array.isArray(cached) && Array.isArray(onchain)
      ? JSON.stringify([...cached].sort()) === JSON.stringify([...onchain].sort())
      : cached === onchain;
  return { field, status: same ? "match" : "mismatch", cached, onchain };
}

/** Field-level comparison of one cached record with its on-chain record. */
export function diffRecord(cached: CachedRecord, onchain: OnchainRecord): CacheFieldDiff[] {
  return [
    compareField("price", cached.price, onchainPrice(onchain.price)),
    compareField("metadata", cached.metadata, str(onchain.metadata)),
    compareField("listed", cached.listed, typeof onchain.listed === "boolean" ? onchain.listed : null),
    compareField("creator", cached.creator, str(onchain.creator)),
    compareField("tags", cached.tags, Array.isArray(onchain.tags) ? onchain.tags : []),
  ];
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

function emptyCounts(): Record<ResourceDiffStatus, number> {
  return {
    in_sync: 0,
    drift: 0,
    missing_onchain: 0,
    missing_in_cache: 0,
    not_found: 0,
    lookup_failed: 0,
  };
}

function verdictOf(
  counts: Record<ResourceDiffStatus, number>,
  compared: number,
): CacheChainVerdict {
  if (compared === 0) return "no_cache";
  if (counts.drift + counts.missing_onchain + counts.missing_in_cache > 0) return "drift";
  if (counts.lookup_failed > 0) return "incomplete";
  return "in_sync";
}

function stepsFor(report: Omit<CacheChainDiffReport, "nextSteps">): string[] {
  const steps: string[] = [];
  const c = report.counts;
  if (report.verdict === "no_cache") {
    steps.push(
      "No catalog snapshot is cached for this profile, network and contract. Run mindvault_prewarm_catalog (or mindvault_browse) while the API is reachable, then compare again.",
    );
    return steps;
  }
  if (c.drift > 0 || c.missing_onchain > 0) {
    steps.push(
      "The cache holds outdated records. Refresh it with mindvault_prewarm_catalog while the API is reachable; if the API itself disagrees with the chain, run mindvault_metadata_diff on the affected ids.",
    );
  }
  if (c.missing_onchain > 0) {
    steps.push(
      "Some cached resources are not registered on-chain. Do not purchase them from the cached listing; confirm with mindvault_registry_lookup.",
    );
  }
  if (c.missing_in_cache > 0) {
    steps.push(
      "Some requested resources are registered on-chain but absent from the cache; browse or preview them to cache them.",
    );
  }
  if (c.lookup_failed > 0) {
    steps.push(
      "Some on-chain reads failed, so the comparison is incomplete. Check the Soroban RPC with mindvault_rpc_health and run this tool again.",
    );
  }
  if (report.truncated) {
    steps.push(
      `Only ${report.compared} of ${report.cache.cachedResourceCount} cached resources were compared. Raise limit (max ${CACHE_CHAIN_DIFF_MAX_RESOURCES}) or pass resourceIds to compare the rest.`,
    );
  }
  return steps;
}

export interface CompareCacheWithChainInput {
  context: CacheChainDiffContext;
  snapshots: CachedSnapshots;
  lookup: OnchainLookup;
  /** Compare exactly these ids (deduplicated, sorted). Default: cached ids. */
  resourceIds?: string[];
  /** How many cached ids to compare when `resourceIds` is absent. */
  limit?: number;
}

/** Build the cache-versus-chain report. Never throws for a lookup failure. */
export async function compareCacheWithChain(
  input: CompareCacheWithChainInput,
): Promise<CacheChainDiffReport> {
  const records = collectCachedRecords(input.snapshots);
  const savedTimes = [
    ...input.snapshots.catalog.map((s) => s.snapshot.savedAtMs),
    ...input.snapshots.previews.map((s) => s.snapshot.savedAtMs),
  ];
  const requested = input.resourceIds ? [...new Set(input.resourceIds)].sort() : null;
  const cachedIds = [...records.keys()].sort();
  const limit = Math.min(
    Math.max(1, input.limit ?? CACHE_CHAIN_DIFF_DEFAULT_LIMIT),
    CACHE_CHAIN_DIFF_MAX_RESOURCES,
  );
  if (requested && requested.length > CACHE_CHAIN_DIFF_MAX_RESOURCES) {
    throw new Error(
      `resourceIds lists ${requested.length} ids; at most ${CACHE_CHAIN_DIFF_MAX_RESOURCES} can be compared in one call.`,
    );
  }
  const ids = requested ?? cachedIds.slice(0, limit);

  const counts = emptyCounts();
  const results: ResourceDiff[] = [];
  for (const resourceId of ids) {
    const held = records.get(resourceId) ?? null;
    const cachedAt = held ? iso(held.savedAtMs) : null;
    let looked: OnchainLookupResult;
    try {
      looked = await input.lookup(resourceId);
    } catch (err) {
      looked = { error: err instanceof Error ? err.message : String(err) };
    }
    let entry: ResourceDiff;
    if ("error" in looked) {
      entry = { resourceId, status: "lookup_failed", cachedAt, fields: [], error: looked.error };
    } else if (!looked.found) {
      entry = { resourceId, status: held ? "missing_onchain" : "not_found", cachedAt, fields: [], error: null };
    } else if (!held) {
      entry = { resourceId, status: "missing_in_cache", cachedAt, fields: [], error: null };
    } else {
      const fields = diffRecord(held.record, looked.record);
      const drift = fields.some((f) => f.status !== "match");
      entry = { resourceId, status: drift ? "drift" : "in_sync", cachedAt, fields, error: null };
    }
    counts[entry.status]++;
    results.push(entry);
  }

  const partial: Omit<CacheChainDiffReport, "nextSteps"> = {
    context: input.context,
    cache: {
      snapshotCount: savedTimes.length,
      cachedResourceCount: records.size,
      oldestSnapshotAt: iso(savedTimes.length ? Math.min(...savedTimes) : null),
      newestSnapshotAt: iso(savedTimes.length ? Math.max(...savedTimes) : null),
    },
    requested,
    compared: results.length,
    truncated: requested === null && cachedIds.length > ids.length,
    counts,
    verdict: verdictOf(counts, results.length),
    results,
  };
  return { ...partial, nextSteps: stepsFor(partial) };
}

const VERDICT_TEXT: Record<CacheChainVerdict, string> = {
  in_sync: "Cached catalog records match the on-chain registry.",
  drift: "Cached catalog records have drifted from the on-chain registry.",
  incomplete: "Comparison incomplete: some on-chain reads failed.",
  no_cache: "No cached catalog records to compare.",
};

/** Human-readable rendering of a report. */
export function formatCacheChainDiff(report: CacheChainDiffReport): string {
  const lines = [
    VERDICT_TEXT[report.verdict],
    `Profile: ${report.context.profile} · network: ${report.context.network} · contract: ${report.context.contractId || "(unset)"}`,
    `Cache: ${report.cache.cachedResourceCount} resource(s) across ${report.cache.snapshotCount} snapshot(s)` +
      (report.cache.newestSnapshotAt ? `, newest ${report.cache.newestSnapshotAt}` : ""),
  ];
  if (report.results.length > 0) {
    lines.push("");
    for (const r of report.results) {
      const changed = r.fields.filter((f) => f.status !== "match").map((f) => `${f.field} (${f.status})`);
      const detail = changed.length ? `: ${changed.join(", ")}` : r.error ? `: ${r.error}` : "";
      lines.push(`- ${r.resourceId}: ${r.status}${detail}`);
    }
  }
  if (report.nextSteps.length > 0) {
    lines.push("", "Next steps:", ...report.nextSteps.map((s, i) => `${i + 1}. ${s}`));
  }
  return lines.join("\n");
}
