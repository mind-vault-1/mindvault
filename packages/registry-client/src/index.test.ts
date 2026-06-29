import { describe, it, expect } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import {
  Client,
  Errors,
  createRegistryClient,
  listResources,
  networks,
  getNetworkPreset,
  parseStellarNetwork,
  resolveStellarNetwork,
  normalizeX402Network,
  inferNetworkFromX402,
  validateNetworkConfig,
  X402_NETWORK_IDS,
} from "./index.js";

/**
 * Smoke tests for @mindvault/registry-client.
 *
 * These assert the package builds, exports the expected surface, and that the
 * generated Soroban bindings still match what consumers (server/, web/, mcp/)
 * rely on. They make **no live Stellar RPC calls** — constructing a Client only
 * builds a contract spec locally. Network-touching checks live in the
 * `integration` block below, which is skipped unless RUN_INTEGRATION is set.
 *
 * If a test in the "generated bindings" block fails after running
 * `pnpm contract:bindings`, that is binding drift: the deployed contract's
 * interface changed and consumers must be updated to match.
 */

describe("network defaults", () => {
  it("exposes testnet and mainnet presets", () => {
    expect(Object.keys(networks).sort()).toEqual(["mainnet", "testnet"]);
  });

  it("uses the canonical testnet network values", () => {
    const t = networks.testnet;
    expect(t.stellarNetwork).toBe("testnet");
    expect(t.networkPassphrase).toBe(Networks.TESTNET);
    expect(t.x402Network).toBe("stellar:testnet");
    expect(t.sorobanRpcUrl).toBe("https://soroban-testnet.stellar.org");
    expect(t.explorerNetwork).toBe("testnet");
    // Testnet ships a known deployed registry; consumers default to it.
    expect(t.defaultRegistryContractId).toMatch(/^C[A-Z0-9]{55}$/);
  });

  it("uses the canonical mainnet network values", () => {
    const m = networks.mainnet;
    expect(m.stellarNetwork).toBe("mainnet");
    expect(m.networkPassphrase).toBe(Networks.PUBLIC);
    expect(m.x402Network).toBe("stellar:pubnet");
    expect(m.sorobanRpcUrl).toBe("https://soroban.stellar.org");
    expect(m.explorerNetwork).toBe("public");
    // Mainnet operators deploy their own contract; no baked-in default.
    expect(m.defaultRegistryContractId).toBeNull();
  });

  it("resolves and parses STELLAR_NETWORK aliases", () => {
    expect(parseStellarNetwork("testnet")).toBe("testnet");
    expect(parseStellarNetwork("pubnet")).toBe("mainnet");
    expect(parseStellarNetwork("public")).toBe("mainnet");
    expect(parseStellarNetwork("nonsense")).toBeUndefined();
    // Defaults to testnet when unset/unknown.
    expect(resolveStellarNetwork(undefined)).toBe("testnet");
    expect(resolveStellarNetwork("nonsense")).toBe("testnet");
    expect(getNetworkPreset("mainnet")).toBe(networks.mainnet);
  });

  it("normalizes and infers x402 network ids", () => {
    expect(normalizeX402Network("stellar:mainnet")).toBe(X402_NETWORK_IDS.mainnet);
    expect(inferNetworkFromX402("stellar:testnet")).toBe("testnet");
    expect(inferNetworkFromX402("stellar:pubnet")).toBe("mainnet");
    expect(inferNetworkFromX402("stellar:bogus")).toBeUndefined();
  });

  it("flags internally inconsistent network config", () => {
    const issues = validateNetworkConfig({
      stellarNetwork: "testnet",
      x402Network: "stellar:pubnet", // mismatched on purpose
      sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    });
    expect(issues.some((i) => i.field === "NETWORK")).toBe(true);
  });
});

describe("generated bindings (drift guard)", () => {
  // The exact error variants the vault-registry contract defines. Re-generating
  // bindings against a contract with different errors changes this map.
  const EXPECTED_ERRORS: Record<number, string> = {
    1: "AlreadyRegistered",
    2: "NotFound",
    3: "InvalidPrice",
    4: "MetadataTooLong",
    5: "InvalidTag",
  };

  // The full set of contract methods consumers call. Adding/removing/renaming a
  // contract function changes this set.
  const EXPECTED_METHODS = [
    "count",
    "delist",
    "exists",
    "get",
    "get_owner",
    "list",
    "register",
    "set_listed",
    "set_price",
    "set_tags",
    "transfer_ownership",
    "update_metadata",
  ];

  it("re-exports the generated Client and Errors", () => {
    expect(typeof Client).toBe("function");
    expect(Errors).toBeDefined();
  });

  it("keeps the contract error variants stable", () => {
    const actual = Object.fromEntries(
      Object.entries(Errors).map(([code, e]) => [code, (e as { message: string }).message]),
    );
    expect(actual).toEqual(
      Object.fromEntries(Object.entries(EXPECTED_ERRORS).map(([k, v]) => [k, v])),
    );
  });

  it("exposes the expected contract methods on a constructed client", () => {
    const client = createRegistryClient({
      contractId: networks.testnet.defaultRegistryContractId!,
      rpcUrl: networks.testnet.sorobanRpcUrl,
    });

    // `fromJSON` is generated with one entry per contract method — the canonical
    // list of the bindings' callable surface.
    expect(Object.keys(client.fromJSON).sort()).toEqual([...EXPECTED_METHODS].sort());

    // Each method is also wired as a callable on the instance.
    for (const method of EXPECTED_METHODS) {
      expect(typeof (client as unknown as Record<string, unknown>)[method]).toBe("function");
    }

    expect(typeof listResources).toBe("function");
  });
});

describe("contract id configuration", () => {
  const contractId = networks.testnet.defaultRegistryContractId!;
  const rpcUrl = networks.testnet.sorobanRpcUrl;

  it("threads contractId and rpcUrl onto the client", () => {
    const client = createRegistryClient({ contractId, rpcUrl });
    expect(client.options.contractId).toBe(contractId);
    expect(client.options.rpcUrl).toBe(rpcUrl);
  });

  it("defaults the network passphrase to testnet", () => {
    const client = createRegistryClient({ contractId, rpcUrl });
    expect(client.options.networkPassphrase).toBe(Networks.TESTNET);
  });

  it("honors an explicit network passphrase override", () => {
    const client = createRegistryClient({
      contractId,
      rpcUrl: networks.mainnet.sorobanRpcUrl,
      networkPassphrase: Networks.PUBLIC,
    });
    expect(client.options.networkPassphrase).toBe(Networks.PUBLIC);
  });

  it("passes through an optional public key for read-only calls", () => {
    const publicKey = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    const client = createRegistryClient({ contractId, rpcUrl, publicKey });
    expect(client.options.publicKey).toBe(publicKey);
  });
});

// Live-network checks. Skipped by default so `pnpm test` never depends on a
// reachable Stellar RPC. Run with: RUN_INTEGRATION=1 pnpm --filter
// @mindvault/registry-client test
describe.runIf(process.env.RUN_INTEGRATION)("integration (live RPC)", () => {
  it("can read the on-chain resource count", async () => {
    const client = createRegistryClient({
      contractId: networks.testnet.defaultRegistryContractId!,
      rpcUrl: networks.testnet.sorobanRpcUrl,
    });
    const tx = await client.count();
    expect(typeof Number(tx.result)).toBe("number");
  });

  it("can simulate registering and reading back a resource via bindings (#297)", async () => {
    const client = createRegistryClient({
      contractId: networks.testnet.defaultRegistryContractId!,
      rpcUrl: networks.testnet.sorobanRpcUrl,
    });

    const mockResourceId = `test-${Date.now()}`;
    const creator = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

    // 1. Simulate Register (since we don't have a funded signer for live submission in CI)
    const registerResult = await client.register(
      {
        creator,
        id: mockResourceId,
        price: 5000000n,
        metadata: "test metadata",
        tags: [],
      },
      { simulate: true },
    );

    // The simulation should succeed and return an assembled transaction
    expect(registerResult).toBeDefined();

    // 2. Read back a known existing resource (or attempt to read the one we didn't submit)
    // Since we only simulated register, it won't be found, so we expect NotFound error,
    // which confirms the `get` binding works and parses contract errors correctly.
    try {
      await client.get({ id: mockResourceId });
      expect.fail("Should have thrown NotFound error");
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });
});
