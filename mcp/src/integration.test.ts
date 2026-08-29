/**
 * Integration tests for the MindVault MCP server surface.
 *
 * These go through the SDK Client request interface (listTools / callTool) via
 * the in-memory harness — not the exported helper functions exercised by
 * index.test.ts. Mock mode supplies deterministic fetch + registry fixtures.
 *
 * See docs/mcp-integration-harness.md for the error-handling contract.
 */

import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  harnessIsToolError,
  harnessResultText,
  startIntegrationHarness,
  type IntegrationHarness,
} from "./integrationHarness.js";

// Activate mock fixtures and isolate state before the server module loads.
process.env.MINDVAULT_MOCK = "1";
process.env.STELLAR_NETWORK = "testnet";
const harnessHome = mkdtempSync(join(tmpdir(), "mindvault-mcp-integration-"));
process.env.HOME = harnessHome;
process.env.USERPROFILE = harnessHome;

const { server, _resetProfiles } = await import("./index.js");

describe("MCP integration harness", () => {
  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await startIntegrationHarness(server);
  });

  afterAll(async () => {
    await harness?.close();
    rmSync(harnessHome, { recursive: true, force: true });
  });

  beforeEach(() => {
    _resetProfiles();
  });

  it("lists tools through the SDK request interface", async () => {
    const { tools } = await harness.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toContain("mindvault_browse");
    expect(names).toContain("mindvault_search");
    expect(names).toContain("mindvault_preview");
    expect(names).toContain("mindvault_registry_info");
    expect(names).toContain("mindvault_registry_lookup");
    expect(names).toContain("mindvault_registry_list");
    expect(names).toContain("mindvault_setup_wallet");
    expect(names.length).toBeGreaterThanOrEqual(15);

    for (const tool of tools) {
      expect(tool.name).toMatch(/^mindvault_/);
      expect(typeof tool.description).toBe("string");
      expect((tool.description ?? "").length).toBeGreaterThan(0);
    }
  });

  it("calls mindvault_browse with mocked catalog fixtures", async () => {
    const result = await harness.callTool("mindvault_browse");
    expect(harnessIsToolError(result)).toBe(false);
    const text = harnessResultText(result);
    expect(text).toContain("mock-1");
    expect(text).toContain("Intro to Stellar");
    expect(text).toContain("mock-2");
  });

  it("calls mindvault_search and mindvault_preview with mocked fetch", async () => {
    const search = await harness.callTool("mindvault_search", { query: "Stellar" });
    expect(harnessIsToolError(search)).toBe(false);
    expect(harnessResultText(search)).toContain("mock-1");

    const preview = await harness.callTool("mindvault_preview", { resourceId: "mock-1" });
    expect(harnessIsToolError(preview)).toBe(false);
    const previewText = harnessResultText(preview);
    expect(previewText).toContain("mock-1");
    expect(previewText).toMatch(/1\.5|1\.50/);
  });

  it("calls mindvault_registry_lookup with mocked registry dependency", async () => {
    const hit = await harness.callTool("mindvault_registry_lookup", { resourceId: "mock-1" });
    expect(harnessIsToolError(hit)).toBe(false);
    const hitText = harnessResultText(hit);
    expect(hitText).toContain('"found": true');
    expect(hitText).toContain("on-chain (mock)");

    const miss = await harness.callTool("mindvault_registry_lookup", {
      resourceId: "does-not-exist",
    });
    expect(harnessIsToolError(miss)).toBe(false);
    expect(harnessResultText(miss)).toContain('"found": false');
  });

  it("calls mindvault_registry_list with mocked on-chain pagination", async () => {
    const page = await harness.callTool("mindvault_registry_list", { start: 0, limit: 20 });
    expect(harnessIsToolError(page)).toBe(false);
    const text = harnessResultText(page);
    expect(text).toContain("mock-1");
    expect(text).toContain("mock-2");
    expect(text).toContain('"count": 2');

    const empty = await harness.callTool("mindvault_registry_list", { start: 99, limit: 20 });
    expect(harnessIsToolError(empty)).toBe(false);
    expect(harnessResultText(empty)).toContain('"count": 0');
    expect(harnessResultText(empty)).toMatch(/No on-chain resources in range/);
  });

  it("calls mindvault_recover_catalog_cache and returns guidance", async () => {
    const result = await harness.callTool("mindvault_recover_catalog_cache");
    expect(harnessIsToolError(result)).toBe(false);
    const text = harnessResultText(result);
    expect(text.toLowerCase()).toContain("catalog");
    expect(text.toLowerCase()).toContain("recover");
  });

  it("browses the catalog sorted by price through callTool", async () => {
    const sorted = await harness.callTool("mindvault_browse", { sort: "price_asc", limit: 10 });
    expect(harnessIsToolError(sorted)).toBe(false);
    const text = harnessResultText(sorted);
    // mock-2 is $0.5 and mock-1 is $1.5, so ascending price puts mock-2 first.
    expect(text.indexOf("mock-2")).toBeLessThan(text.indexOf("mock-1"));

    const descending = await harness.callTool("mindvault_browse", { sort: "price_desc" });
    const descendingText = harnessResultText(descending);
    expect(descendingText.indexOf("mock-1")).toBeLessThan(descendingText.indexOf("mock-2"));
  });

  it("rejects a sort value the catalog does not support", async () => {
    const result = await harness.callTool("mindvault_browse", { sort: "cheapest" });
    expect(harnessResultText(result)).toContain("newest, price_asc, price_desc, title");
  });

  it("exports receipts as a structured document with an advertised schema", async () => {
    const { tools } = await harness.listTools();
    const exportTool = tools.find((t) => t.name === "mindvault_export_receipts");
    expect(exportTool).toBeDefined();
    expect((exportTool as { outputSchema?: unknown }).outputSchema).toBeDefined();

    const result = await harness.callTool("mindvault_export_receipts", { format: "csv" });
    expect(harnessIsToolError(result)).toBe(false);
    const parsed = JSON.parse(harnessResultText(result));
    expect(parsed.schema).toBe("mindvault.receipt-export/v1");
    expect(parsed.currency).toBe("USDC");
    expect(typeof parsed.csv).toBe("string");
    expect(parsed.csv.split("\r\n")[0]).toContain("resourceId,title,amount");
  });

  it("returns deterministic Error: results for unknown tools and missing wallet", async () => {
    const unknown = await harness.callTool("mindvault_not_a_real_tool");
    expect(unknown.isError).toBe(true);
    // The message continues with the list of available tools, so anchor on the
    // name rather than the end of the line.
    expect(harnessResultText(unknown)).toMatch(/^Error: Unknown tool: mindvault_not_a_real_tool\b/);

    const walletInfo = await harness.callTool("mindvault_wallet_info");
    expect(walletInfo.isError).toBe(true);
    const walletText = harnessResultText(walletInfo);
    expect(walletText).toMatch(/^Error:/);
    expect(walletText).toContain("mindvault_setup_wallet");
    expect(walletText).not.toMatch(/S[A-Z0-9]{50,}/); // no secret keys
  });

  it("sets up a wallet through callTool using the mock sponsored-account route", async () => {
    const setup = await harness.callTool("mindvault_setup_wallet");
    expect(harnessIsToolError(setup)).toBe(false);
    const text = harnessResultText(setup);
    expect(text).toContain("Address:");
    expect(text).toMatch(/G[A-Z0-9]{55}/);
  });
});
