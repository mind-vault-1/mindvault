/**
 * Tests for the explicit tool allowlist (#1199).
 *
 * Two layers, mirroring `readOnlyMode.test.ts`: pure parsing/classification and
 * the wiring that actually enforces the boundary. A ListTools filter alone is
 * only a convenience — the dispatcher gate is what stops a client holding a
 * cached tool list or guessing a name.
 */

import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  TOOL_ALLOWLIST_ENV_VAR,
  assertToolAllowedInAllowlist,
  filterToolsForAllowlist,
  formatToolAllowlistDiagnostics,
  isToolAllowed,
  parseToolAllowlist,
  resolveToolAllowlist,
} from "./toolAllowlist.js";
import {
  harnessIsToolError,
  harnessResultText,
  startIntegrationHarness,
} from "./integrationHarness.js";
import type { IntegrationHarness } from "./integrationHarness.js";

process.env.MINDVAULT_MOCK = "1";
process.env.STELLAR_NETWORK = "testnet";
const home = mkdtempSync(join(tmpdir(), "mindvault-mcp-allowlist-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const { server, dispatchTool } = await import("./index.js");

// ── Pure decisions ───────────────────────────────────────────────────────────

describe("parseToolAllowlist", () => {
  it.each([undefined, null, "", "   ", ","])("is unrestricted for %j", (raw) => {
    expect(parseToolAllowlist(raw).isEmpty).toBe(true);
  });

  it("trims, drops blanks and deduplicates names", () => {
    const parsed = parseToolAllowlist(" mindvault_browse , ,mindvault_preview,mindvault_browse ");
    expect([...parsed.names].sort()).toEqual(["mindvault_browse", "mindvault_preview"]);
    expect(parsed.isEmpty).toBe(false);
  });

  it("reads the value from the environment", () => {
    expect(resolveToolAllowlist({}).isEmpty).toBe(true);
    expect([
      ...resolveToolAllowlist({ [TOOL_ALLOWLIST_ENV_VAR]: "mindvault_browse" }).names,
    ]).toContain("mindvault_browse");
  });
});

describe("allowlist decisions", () => {
  const restricted = parseToolAllowlist("mindvault_browse, mindvault_preview");

  it("allows everything when unrestricted", () => {
    expect(isToolAllowed("mindvault_reset", parseToolAllowlist(undefined))).toBe(true);
  });

  it("allows only exact names when restricted", () => {
    expect(isToolAllowed("mindvault_browse", restricted)).toBe(true);
    expect(isToolAllowed("mindvault_browse_extra", restricted)).toBe(false);
    expect(isToolAllowed("MINDVAULT_BROWSE", restricted)).toBe(false);
  });

  it("refuses a tool with a deterministic, actionable error", () => {
    expect(() => assertToolAllowedInAllowlist("mindvault_buy", {})).not.toThrow();
    let error: Error | undefined;
    try {
      assertToolAllowedInAllowlist("mindvault_buy", {
        [TOOL_ALLOWLIST_ENV_VAR]: "mindvault_preview, mindvault_browse",
      });
    } catch (caught) {
      error = caught as Error;
    }
    expect(error?.message).toContain("mindvault_buy");
    expect(error?.message).toContain(TOOL_ALLOWLIST_ENV_VAR);
    expect(error?.message).toContain("mindvault_browse, mindvault_preview");
    expect(error?.message).toContain("no tool argument can override it");
  });

  it("filters a tool list without mutating the input", () => {
    const tools = [{ name: "mindvault_browse" }, { name: "mindvault_buy" }];
    const filtered = filterToolsForAllowlist(tools, {
      [TOOL_ALLOWLIST_ENV_VAR]: "mindvault_browse",
    });
    expect(filtered.map((tool) => tool.name)).toEqual(["mindvault_browse"]);
    expect(tools).toHaveLength(2);
    expect(filterToolsForAllowlist(tools, {})).not.toBe(tools);
  });

  it("formats compact operator diagnostics", () => {
    expect(formatToolAllowlistDiagnostics({})).toContain("off");
    expect(
      formatToolAllowlistDiagnostics({ [TOOL_ALLOWLIST_ENV_VAR]: "mindvault_browse" }),
    ).toContain("ON");
  });
});

// ── Wiring ───────────────────────────────────────────────────────────────────

describe("tool allowlist through the MCP server", () => {
  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await startIntegrationHarness(server);
  });

  afterAll(async () => {
    delete process.env[TOOL_ALLOWLIST_ENV_VAR];
    await harness?.close();
    rmSync(home, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env[TOOL_ALLOWLIST_ENV_VAR];
    delete process.env.MINDVAULT_READ_ONLY;
  });

  it("advertises the full surface when unset", async () => {
    const { tools } = await harness.listTools();
    expect(tools.some((tool) => tool.name === "mindvault_buy")).toBe(true);
    expect(tools.some((tool) => tool.name === "mindvault_browse")).toBe(true);
  });

  it("advertises only listed tools", async () => {
    process.env[TOOL_ALLOWLIST_ENV_VAR] = "mindvault_browse,mindvault_preview";
    const { tools } = await harness.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "mindvault_browse",
      "mindvault_preview",
    ]);
  });

  it("re-reads the environment on every ListTools call", async () => {
    const before = (await harness.listTools()).tools.length;
    process.env[TOOL_ALLOWLIST_ENV_VAR] = "mindvault_browse";
    const during = (await harness.listTools()).tools.length;
    delete process.env[TOOL_ALLOWLIST_ENV_VAR];
    const after = (await harness.listTools()).tools.length;
    expect(during).toBeLessThan(before);
    expect(after).toBe(before);
  });

  it("refuses a tool a client calls anyway", async () => {
    process.env[TOOL_ALLOWLIST_ENV_VAR] = "mindvault_browse";
    const result = await harness.callTool("mindvault_buy", { resourceId: "mock-1" });
    expect(harnessIsToolError(result)).toBe(true);
    expect(harnessResultText(result)).toContain("Tool allowlist");
  });

  it("refuses before validating arguments", async () => {
    process.env[TOOL_ALLOWLIST_ENV_VAR] = "mindvault_browse";
    await expect(dispatchTool("mindvault_buy", { resourceId: "" })).rejects.toThrow(
      /Tool allowlist/,
    );
  });

  it("intersects with read-only mode", async () => {
    process.env[TOOL_ALLOWLIST_ENV_VAR] = "mindvault_browse,mindvault_buy";
    process.env.MINDVAULT_READ_ONLY = "1";
    await expect(dispatchTool("mindvault_buy", { resourceId: "mock-1" })).rejects.toThrow(
      /Read-only mode/,
    );
    await expect(dispatchTool("mindvault_browse", {})).resolves.toBeTypeOf("string");
  });

  it("restores the full surface once the variable is cleared", async () => {
    process.env[TOOL_ALLOWLIST_ENV_VAR] = "mindvault_browse";
    await expect(dispatchTool("mindvault_reset", {})).rejects.toThrow(/Tool allowlist/);
    delete process.env[TOOL_ALLOWLIST_ENV_VAR];
    await expect(dispatchTool("mindvault_reset", {})).resolves.toBeTypeOf("string");
  });
});
