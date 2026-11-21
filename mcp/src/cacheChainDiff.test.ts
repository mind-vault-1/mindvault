/**
 * mindvault_cache_chain_diff (#1203): cached catalog records vs on-chain state.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CACHE_CHAIN_DIFF_MAX_RESOURCES,
  collectCachedRecords,
  compareCacheWithChain,
  formatCacheChainDiff,
  toCachedRecord,
  type OnchainLookup,
  type OnchainRecord,
} from "./cacheChainDiff.js";
import {
  _clearCatalogCache,
  configureCatalogCache,
  listCachedRecords,
  recordCatalogSnapshot,
  recordPreviewSnapshot,
} from "./catalogCache.js";
import { CACHE_CHAIN_DIFF_OUTPUT_SCHEMA } from "./outputSchemas.js";
import { checkOutput } from "./outputValidation.js";
import { ToolValidationError, validateToolArgs } from "./validation.js";

const CREATOR = "GCREATORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const CONTEXT = {
  profile: "default",
  network: "testnet",
  contractId: "CCONTRACT",
  apiOrigin: "https://api.example",
  rpcUrl: "https://rpc.example",
};
const T0 = Date.UTC(2026, 10, 21, 10, 0, 0);

function apiResource(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Resource ${id}`,
    price: "5",
    accessUrl: `ipfs://${id}`,
    ownerAddress: CREATOR,
    verificationStatus: "verified",
    tags: ["data", "test"],
    ...overrides,
  };
}

function chainRecord(id: string, overrides: Partial<OnchainRecord> = {}): OnchainRecord {
  return {
    price: 50_000_000n,
    metadata: `ipfs://${id}`,
    listed: true,
    creator: CREATOR,
    tags: ["test", "data"],
    ...overrides,
  };
}

function lookupFrom(records: Record<string, OnchainRecord | "missing" | Error>): OnchainLookup {
  return vi.fn(async (id: string) => {
    const r = records[id];
    if (r === undefined || r === "missing") return { found: false as const };
    if (r instanceof Error) return { error: r.message };
    return { found: true as const, record: r };
  });
}

const snapshotsOf = (...resources: unknown[][]) => ({
  catalog: resources.map((list, i) => ({ key: `k${i}`, snapshot: { resources: list, savedAtMs: T0 + i } })),
  previews: [],
});

describe("toCachedRecord", () => {
  it("normalizes API fields to on-chain vocabulary", () => {
    expect(toCachedRecord(apiResource("a"))).toEqual({
      price: "5.0000000",
      metadata: "ipfs://a",
      listed: true,
      creator: CREATOR,
      tags: ["data", "test"],
    });
  });

  it("keeps a malformed price verbatim and treats unverified as unlisted", () => {
    const r = toCachedRecord(apiResource("a", { price: "five", verificationStatus: "pending" }));
    expect(r.price).toBe("five");
    expect(r.listed).toBe(false);
  });
});

describe("collectCachedRecords", () => {
  it("lets the newest snapshot win and ignores entries without an id", () => {
    const records = collectCachedRecords({
      catalog: [
        { key: "a", snapshot: { resources: [apiResource("x", { price: "1" }), { title: "no id" }], savedAtMs: 1 } },
        { key: "b", snapshot: { resources: [apiResource("x", { price: "2" })], savedAtMs: 3 } },
      ],
      previews: [{ resourceId: "x", snapshot: { meta: apiResource("x", { price: "9" }), savedAtMs: 2 } }],
    });
    expect([...records.keys()]).toEqual(["x"]);
    expect(records.get("x")).toMatchObject({ savedAtMs: 3, record: { price: "2.0000000" } });
  });
});

describe("compareCacheWithChain", () => {
  it("reports in_sync when every field matches, regardless of tag order", async () => {
    const report = await compareCacheWithChain({
      context: CONTEXT,
      snapshots: snapshotsOf([apiResource("a")]),
      lookup: lookupFrom({ a: chainRecord("a") }),
    });
    expect(report.verdict).toBe("in_sync");
    expect(report.results[0]).toMatchObject({ resourceId: "a", status: "in_sync", cachedAt: new Date(T0).toISOString() });
    expect(report.results[0].fields.every((f) => f.status === "match")).toBe(true);
    expect(report.nextSteps).toEqual([]);
    expect(checkOutput(CACHE_CHAIN_DIFF_OUTPUT_SCHEMA as any, report)).toEqual({ valid: true });
  });

  it("reports field-level drift and tells the agent to refresh the cache", async () => {
    const report = await compareCacheWithChain({
      context: CONTEXT,
      snapshots: snapshotsOf([apiResource("a")]),
      lookup: lookupFrom({ a: chainRecord("a", { price: 70_000_000n, listed: false }) }),
    });
    expect(report.verdict).toBe("drift");
    const changed = report.results[0].fields.filter((f) => f.status !== "match");
    expect(changed).toEqual([
      { field: "price", status: "mismatch", cached: "5.0000000", onchain: "7.0000000" },
      { field: "listed", status: "mismatch", cached: true, onchain: false },
    ]);
    expect(report.nextSteps[0]).toContain("mindvault_prewarm_catalog");
  });

  it("separates missing_onchain, missing_in_cache, not_found and lookup_failed", async () => {
    const report = await compareCacheWithChain({
      context: CONTEXT,
      snapshots: snapshotsOf([apiResource("gone"), apiResource("rpcfail")]),
      lookup: lookupFrom({ gone: "missing", fresh: chainRecord("fresh"), rpcfail: new Error("RPC timeout") }),
      resourceIds: ["rpcfail", "gone", "fresh", "nowhere", "gone"],
    });
    expect(report.requested).toEqual(["fresh", "gone", "nowhere", "rpcfail"]);
    expect(report.results.map((r) => [r.resourceId, r.status])).toEqual([
      ["fresh", "missing_in_cache"],
      ["gone", "missing_onchain"],
      ["nowhere", "not_found"],
      ["rpcfail", "lookup_failed"],
    ]);
    expect(report.results[3].error).toBe("RPC timeout");
    expect(report.counts).toMatchObject({ missing_in_cache: 1, missing_onchain: 1, not_found: 1, lookup_failed: 1 });
    expect(report.verdict).toBe("drift");
    expect(report.nextSteps.join("\n")).toMatch(/mindvault_registry_lookup[\s\S]*mindvault_rpc_health/);
  });

  it("is incomplete, not in sync, when only lookups fail", async () => {
    const lookup: OnchainLookup = async () => {
      throw new Error("socket hang up");
    };
    const report = await compareCacheWithChain({ context: CONTEXT, snapshots: snapshotsOf([apiResource("a")]), lookup });
    expect(report.verdict).toBe("incomplete");
    expect(report.results[0]).toMatchObject({ status: "lookup_failed", error: "socket hang up" });
  });

  it("returns no_cache without any on-chain reads when nothing is cached", async () => {
    const lookup = lookupFrom({});
    const report = await compareCacheWithChain({ context: CONTEXT, snapshots: { catalog: [], previews: [] }, lookup });
    expect(report.verdict).toBe("no_cache");
    expect(lookup).not.toHaveBeenCalled();
    expect(report.nextSteps[0]).toContain("mindvault_prewarm_catalog");
    expect(checkOutput(CACHE_CHAIN_DIFF_OUTPUT_SCHEMA as any, report)).toEqual({ valid: true });
  });

  it("compares cached ids in sorted order, honours limit and flags truncation", async () => {
    const lookup = lookupFrom({ a: chainRecord("a"), b: chainRecord("b"), c: chainRecord("c") });
    const report = await compareCacheWithChain({
      context: CONTEXT,
      snapshots: snapshotsOf([apiResource("c"), apiResource("a"), apiResource("b")]),
      lookup,
      limit: 2,
    });
    expect(report.results.map((r) => r.resourceId)).toEqual(["a", "b"]);
    expect(report.truncated).toBe(true);
    expect(report.nextSteps.at(-1)).toContain("Only 2 of 3");
  });

  it("is deterministic for the same cache and chain state", async () => {
    const input = () => ({
      context: CONTEXT,
      snapshots: snapshotsOf([apiResource("b"), apiResource("a", { price: "1" })]),
      lookup: lookupFrom({ a: chainRecord("a"), b: chainRecord("b") }),
    });
    expect(await compareCacheWithChain(input())).toEqual(await compareCacheWithChain(input()));
  });

  it("rejects more ids than one call may compare", async () => {
    const ids = Array.from({ length: CACHE_CHAIN_DIFF_MAX_RESOURCES + 1 }, (_, i) => `r${i}`);
    await expect(
      compareCacheWithChain({ context: CONTEXT, snapshots: snapshotsOf([]), lookup: lookupFrom({}), resourceIds: ids }),
    ).rejects.toThrow(/at most 50/);
  });

  it("renders a readable summary", async () => {
    const report = await compareCacheWithChain({
      context: CONTEXT,
      snapshots: snapshotsOf([apiResource("a")]),
      lookup: lookupFrom({ a: chainRecord("a", { creator: "GOTHER" }) }),
    });
    const text = formatCacheChainDiff(report);
    expect(text).toContain("have drifted");
    expect(text).toContain("- a: drift: creator (mismatch)");
    expect(text).toMatch(/Next steps:\n1\. /);
  });
});

describe("listCachedRecords", () => {
  afterEach(() => _clearCatalogCache());

  it("returns only the active context's unexpired snapshots, sorted by key", () => {
    const other = { ...CONTEXT, network: "mainnet" };
    recordCatalogSnapshot([apiResource("b")], "https://api.example/resources?b", CONTEXT);
    recordCatalogSnapshot([apiResource("a")], "https://api.example/resources", CONTEXT);
    recordCatalogSnapshot([apiResource("z")], "https://api.example/resources", other);
    recordPreviewSnapshot("p", apiResource("p"), CONTEXT);
    const held = listCachedRecords(CONTEXT);
    expect(held.catalog.map((c) => c.key)).toEqual([
      "https://api.example/resources",
      "https://api.example/resources?b",
    ]);
    expect(held.previews.map((p) => p.resourceId)).toEqual(["p"]);
  });

  it("drops snapshots past the configured max age", () => {
    configureCatalogCache({ ttlMs: 10, maxAgeMs: 10 });
    recordCatalogSnapshot([apiResource("a")], "k", CONTEXT);
    expect(listCachedRecords(CONTEXT, Date.now() + 1_000).catalog).toEqual([]);
    expect(listCachedRecords(CONTEXT).catalog).toEqual([]);
  });
});

describe("mindvault_cache_chain_diff argument validation", () => {
  const issues = (args: Record<string, unknown>) => {
    try {
      validateToolArgs("mindvault_cache_chain_diff", args);
      return [];
    } catch (err) {
      expect(err).toBeInstanceOf(ToolValidationError);
      return (err as ToolValidationError).issues.map((i) => `${i.field}:${i.code}`);
    }
  };

  it("accepts no arguments, ids and a limit", () => {
    expect(issues({})).toEqual([]);
    expect(issues({ resourceIds: ["a", "b"], limit: 5 })).toEqual([]);
  });

  it("rejects malformed ids, an out-of-range limit and unknown arguments", () => {
    expect(issues({ resourceIds: ["../etc"] })).toEqual(["resourceIds:invalid_string_array"]);
    expect(issues({ resourceIds: [] })).toEqual(["resourceIds:invalid_string_array"]);
    expect(issues({ limit: 51 })[0]).toMatch(/^limit:/);
    expect(issues({ secret: "x" })).toEqual(["secret:unknown_argument"]);
  });
});
