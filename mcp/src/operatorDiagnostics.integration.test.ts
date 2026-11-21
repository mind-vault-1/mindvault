/**
 * End-to-end coverage for mindvault_upstream_health (#1205) and
 * mindvault_cache_chain_diff (#1203) through the real MCP call path, so the
 * advertised output schema, argument validation and dispatch are exercised
 * together. Network reads go through `globalThis.fetch`, replaced per test.
 */
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { IntegrationHarness } from "./integrationHarness.js";

process.env.STELLAR_NETWORK = "testnet";
const harnessHome = mkdtempSync(join(tmpdir(), "mindvault-mcp-operator-"));
process.env.HOME = harnessHome;
process.env.USERPROFILE = harnessHome;

const { server } = await import("./index.js");
const { _clearCatalogCache } = await import("./catalogCache.js");
const { startIntegrationHarness } = await import("./integrationHarness.js");

const TESTNET = "Test SDF Network ; September 2015";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

describe("operator diagnostics tools", () => {
  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await startIntegrationHarness(server);
  });

  afterAll(async () => {
    await harness?.close();
    rmSync(harnessHome, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _clearCatalogCache();
  });

  it("advertises both tools as read-only with an output schema", async () => {
    const { tools } = await harness.listTools();
    for (const name of ["mindvault_upstream_health", "mindvault_cache_chain_diff"]) {
      const tool = tools.find((t) => t.name === name) as
        | { annotations?: { readOnlyHint?: boolean }; outputSchema?: unknown }
        | undefined;
      expect(tool, name).toBeDefined();
      expect(tool!.annotations?.readOnlyHint).toBe(true);
      expect(tool!.outputSchema).toBeDefined();
    }
  });

  describe("mindvault_upstream_health", () => {
    it("probes every upstream once and returns schema-valid structured output", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        if (init?.method === "POST") return jsonResponse({ jsonrpc: "2.0", id: 1, result: { passphrase: TESTNET } });
        if (url.includes("horizon")) return jsonResponse({ network_passphrase: TESTNET });
        return jsonResponse([]);
      });
      const result = await harness.callTool("mindvault_upstream_health", {});
      expect(result.isError).toBeUndefined();
      const s = result.structuredContent as any;
      expect(s.upstreams.map((u: any) => u.id)).toEqual(["api", "horizon", "soroban_rpc", "sponsored_account"]);
      expect(s.upstreams.find((u: any) => u.id === "horizon")).toMatchObject({ status: "ok", networkMatch: true });
      expect(s.verdict).toBe("healthy");
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it("reports a down upstream instead of failing the call", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
      const result = await harness.callTool("mindvault_upstream_health", { upstreams: ["api"], timeoutMs: 500 });
      expect(result.isError).toBeUndefined();
      const s = result.structuredContent as any;
      expect(s.verdict).toBe("unhealthy");
      expect(s.upstreams[0]).toMatchObject({ id: "api", status: "down" });
      expect(s.counts.skipped).toBe(3);
    });

    it("rejects an unknown upstream before any request is made", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const result = await harness.callTool("mindvault_upstream_health", { upstreams: ["database"] });
      expect(result.isError).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("mindvault_cache_chain_diff", () => {
    it("returns no_cache with a next step when nothing has been cached", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const result = await harness.callTool("mindvault_cache_chain_diff", {});
      expect(result.isError).toBeUndefined();
      const s = result.structuredContent as any;
      expect(s.verdict).toBe("no_cache");
      expect(s.cache.cachedResourceCount).toBe(0);
      expect(s.context.network).toBe("testnet");
      expect(s.nextSteps[0]).toContain("mindvault_prewarm_catalog");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects malformed resource ids", async () => {
      const result = await harness.callTool("mindvault_cache_chain_diff", { resourceIds: ["a/b"] });
      expect(result.isError).toBe(true);
    });
  });
});
