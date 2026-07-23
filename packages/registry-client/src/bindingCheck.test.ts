import { describe, it, expect } from "vitest";
import {
  REGISTRY_CLIENT_VERSION,
  checkContractBindings,
  compareMethodSets,
  formatBindingCheck,
  getBindingMethodNames,
} from "./bindingCheck.js";

describe("getBindingMethodNames", () => {
  it("returns the installed bindings' method set (sorted)", () => {
    const methods = getBindingMethodNames();
    // Core methods the MCP server and registry depend on.
    for (const m of ["get", "list", "count", "register", "exists"]) {
      expect(methods).toContain(m);
    }
    expect([...methods]).toEqual([...methods].sort());
  });
});

describe("compareMethodSets", () => {
  it("is compatible when the sets are equal", () => {
    const cmp = compareMethodSets(["get", "list"], ["list", "get"]);
    expect(cmp).toEqual({ compatible: true, missingFromContract: [], missingFromBindings: [] });
  });

  it("reports methods the deployed contract is missing", () => {
    const cmp = compareMethodSets(["get", "list", "set_tags"], ["get", "list"]);
    expect(cmp.compatible).toBe(false);
    expect(cmp.missingFromContract).toEqual(["set_tags"]);
    expect(cmp.missingFromBindings).toEqual([]);
  });

  it("reports methods the bindings are missing", () => {
    const cmp = compareMethodSets(["get"], ["get", "new_thing"]);
    expect(cmp.compatible).toBe(false);
    expect(cmp.missingFromContract).toEqual([]);
    expect(cmp.missingFromBindings).toEqual(["new_thing"]);
  });
});

describe("formatBindingCheck", () => {
  const base = {
    contractId: "CDQK...TEST",
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    clientVersion: REGISTRY_CLIENT_VERSION,
  };

  it("renders a concise match message with contract, network, and version", () => {
    const msg = formatBindingCheck({
      ...base,
      comparison: { compatible: true, missingFromContract: [], missingFromBindings: [] },
    });
    expect(msg).toContain("match the deployed contract interface");
    expect(msg).toContain("CDQK...TEST");
    expect(msg).toContain("testnet");
    expect(msg).toContain(REGISTRY_CLIENT_VERSION);
  });

  it("renders a mismatch warning with contract, network, version, and a recommended fix", () => {
    const msg = formatBindingCheck({
      ...base,
      comparison: {
        compatible: false,
        missingFromContract: ["set_tags"],
        missingFromBindings: ["new_thing"],
      },
    });
    expect(msg).toContain("WARNING");
    expect(msg).toContain("CDQK...TEST");
    expect(msg).toContain("testnet");
    expect(msg).toContain(REGISTRY_CLIENT_VERSION);
    // Both drift directions surface a recommended fix.
    expect(msg).toContain("set_tags");
    expect(msg).toContain("Redeploy vault-registry");
    expect(msg).toContain("new_thing");
    expect(msg).toContain("pnpm contract:bindings");
  });
});

describe("checkContractBindings", () => {
  const opts = {
    contractId: "CDQK...TEST",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    network: "testnet",
  };

  it("returns status 'match' when the deployed methods equal the bindings", async () => {
    const result = await checkContractBindings({
      ...opts,
      bindingMethods: ["get", "list"],
      fetchContractMethods: async () => ["list", "get"],
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("match");
    expect(result.message).toContain("match the deployed contract interface");
  });

  it("returns status 'mismatch' with a clear warning when interfaces drift", async () => {
    const result = await checkContractBindings({
      ...opts,
      bindingMethods: ["get", "list", "set_tags"],
      fetchContractMethods: async () => ["get", "list"],
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("mismatch");
    expect(result.message).toContain("WARNING");
    expect(result.message).toContain("set_tags");
    expect(result.comparison?.missingFromContract).toEqual(["set_tags"]);
  });

  it("returns status 'error' with a deterministic, safe message when the fetch fails", async () => {
    const result = await checkContractBindings({
      ...opts,
      bindingMethods: ["get"],
      fetchContractMethods: async () => {
        throw new Error("RPC unreachable");
      },
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("error");
    expect(result.message).toContain("Could not verify registry-client bindings");
    expect(result.message).toContain("RPC unreachable");
    expect(result.message).toContain(opts.contractId);
  });
});
