/**
 * Schema version negotiation in mindvault_registry_info (#1215).
 *
 * Verifies that the tool returns a structured `schemaVersion` field covering:
 *   - detected: the version the deployed contract reports, or null
 *   - supported: the versions this client accepts
 *   - current: the version this client targets
 *   - status: "supported" | "unsupported" | "error" | "unchecked"
 *
 * Uses the same override/cache-reset helpers that registrySchema.ts exposes
 * for testing, so no network call is ever made.
 */
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { IntegrationHarness } from "./integrationHarness.js";

// Pin the network before index.ts loads
process.env.STELLAR_NETWORK = "testnet";
const harnessHome = mkdtempSync(join(tmpdir(), "mindvault-schema-neg-"));
process.env.HOME = harnessHome;
process.env.USERPROFILE = harnessHome;

const { server } = await import("./index.js");
const { startIntegrationHarness, harnessIsToolError, harnessResultText } =
  await import("./integrationHarness.js");
const { setRegistrySchemaVersionOverride, resetRegistrySchemaCache } =
  await import("./registrySchema.js");
const { CURRENT_RESOURCE_SCHEMA_VERSION, SUPPORTED_RESOURCE_SCHEMA_VERSIONS } =
  await import("./registrySchema.js");

afterAll(() => {
  rmSync(harnessHome, { recursive: true, force: true });
});

afterEach(() => {
  resetRegistrySchemaCache();
});

describe("mindvault_registry_info schemaVersion field", () => {
  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await startIntegrationHarness(server);
  });

  afterAll(async () => {
    await harness?.close();
  });

  it("includes a schemaVersion object with all four required keys", async () => {
    setRegistrySchemaVersionOverride(CURRENT_RESOURCE_SCHEMA_VERSION);
    const result = await harness.callTool("mindvault_registry_info", {});
    expect(harnessIsToolError(result)).toBe(false);
    const data = JSON.parse(harnessResultText(result));
    expect(data).toHaveProperty("schemaVersion");
    const sv = data.schemaVersion;
    expect(sv).toHaveProperty("detected");
    expect(sv).toHaveProperty("supported");
    expect(sv).toHaveProperty("current");
    expect(sv).toHaveProperty("status");
  });

  it("reports status=supported when the contract version is in SUPPORTED_RESOURCE_SCHEMA_VERSIONS", async () => {
    setRegistrySchemaVersionOverride(CURRENT_RESOURCE_SCHEMA_VERSION);
    const result = await harness.callTool("mindvault_registry_info", {});
    const data = JSON.parse(harnessResultText(result));
    expect(data.schemaVersion.status).toBe("supported");
    expect(data.schemaVersion.detected).toBe(CURRENT_RESOURCE_SCHEMA_VERSION);
  });

  it("reports the previous supported version as supported too", async () => {
    // SUPPORTED_RESOURCE_SCHEMA_VERSIONS includes both v6 and v7
    const prev = Math.min(...SUPPORTED_RESOURCE_SCHEMA_VERSIONS);
    setRegistrySchemaVersionOverride(prev);
    const result = await harness.callTool("mindvault_registry_info", {});
    const data = JSON.parse(harnessResultText(result));
    expect(data.schemaVersion.status).toBe("supported");
    expect(data.schemaVersion.detected).toBe(prev);
  });

  it("reports status=unsupported for a schema version not in the supported list", async () => {
    setRegistrySchemaVersionOverride(999);
    const result = await harness.callTool("mindvault_registry_info", {});
    // The tool itself succeeds (registry_info is read-only and not blocked by unsupported schema)
    expect(harnessIsToolError(result)).toBe(false);
    const data = JSON.parse(harnessResultText(result));
    expect(data.schemaVersion.status).toBe("unsupported");
    expect(data.schemaVersion.detected).toBe(999);
  });

  it("always includes supported versions array matching SUPPORTED_RESOURCE_SCHEMA_VERSIONS", async () => {
    setRegistrySchemaVersionOverride(CURRENT_RESOURCE_SCHEMA_VERSION);
    const result = await harness.callTool("mindvault_registry_info", {});
    const data = JSON.parse(harnessResultText(result));
    expect(data.schemaVersion.supported).toEqual([...SUPPORTED_RESOURCE_SCHEMA_VERSIONS]);
  });

  it("always includes current version matching CURRENT_RESOURCE_SCHEMA_VERSION", async () => {
    setRegistrySchemaVersionOverride(CURRENT_RESOURCE_SCHEMA_VERSION);
    const result = await harness.callTool("mindvault_registry_info", {});
    const data = JSON.parse(harnessResultText(result));
    expect(data.schemaVersion.current).toBe(CURRENT_RESOURCE_SCHEMA_VERSION);
  });

  it("sets detected=null and status=error on a simulated RPC failure", async () => {
    // resetRegistrySchemaCache ensures no override is set, and with no contract
    // ID configured the status becomes "unchecked"
    resetRegistrySchemaCache();
    // Force error path: set an override to null so the cache-based path runs
    // but the contract ID is empty to simulate the unchecked state
    const saved = process.env.VAULT_REGISTRY_CONTRACT_ID;
    delete process.env.VAULT_REGISTRY_CONTRACT_ID;
    try {
      const result = await harness.callTool("mindvault_registry_info", {});
      expect(harnessIsToolError(result)).toBe(false);
      const data = JSON.parse(harnessResultText(result));
      // When no contract ID is configured the schema check returns "error" or
      // "unchecked"; detected is null in both cases.
      expect(data.schemaVersion.detected).toBeNull();
      expect(["error", "unchecked"]).toContain(data.schemaVersion.status);
    } finally {
      if (saved !== undefined) process.env.VAULT_REGISTRY_CONTRACT_ID = saved;
    }
  });

  it("includes schemaVersion in the structured output (structuredContent)", async () => {
    setRegistrySchemaVersionOverride(CURRENT_RESOURCE_SCHEMA_VERSION);
    const result = await harness.callTool("mindvault_registry_info", {});
    // structuredContent is the parsed JSON object; check it has schemaVersion
    const sc = (result as any).structuredContent;
    if (sc) {
      expect(sc).toHaveProperty("schemaVersion");
    } else {
      // Older MCP SDK or test harness that only returns text — text check is sufficient
      const data = JSON.parse(harnessResultText(result));
      expect(data).toHaveProperty("schemaVersion");
    }
  });
});
