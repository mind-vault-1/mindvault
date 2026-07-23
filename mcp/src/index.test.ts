import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: class MockServer {
    setRequestHandler = vi.fn();
    connect = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {
    constructor() {}
  },
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  CallToolRequestSchema: {},
  ListToolsRequestSchema: {},
}));

vi.mock("@x402/stellar", () => ({ createEd25519Signer: vi.fn() }));

vi.mock("@x402/stellar/exact/client", () => ({ ExactStellarScheme: vi.fn() }));

vi.mock("@x402/fetch", () => ({
  wrapFetchWithPayment: vi.fn(),
  x402Client: vi.fn(function () {
    return { register: vi.fn() };
  }),
}));

vi.mock("@mindvault/registry-client", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    networks: {
      ...actual.networks,
      testnet: {
        ...actual.networks.testnet,
        contractId: "test",
        networkPassphrase: "test",
      },
    },
  };
});

import {
  browse,
  search,
  preview,
  txStatus,
  buy,
  registerOnchain,
  _setAgentWallet,
  _setAgentApiKey,
} from "./index.js";

function mockResponse(data: unknown, ok = true, status = 200): Response {
  const body = JSON.stringify(data);
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(data),
    headers: new Headers({ "content-type": "application/json" }),
  } as Response;
}

const sampleResources = [
  {
    id: "res-001",
    title: "Introduction to Stellar",
    description: "A beginner's guide to Stellar blockchain",
    price: "5.00",
    accessUrl: "https://example.com/stellar-intro",
    resourceType: "link",
    verificationStatus: "verified",
  },
  {
    id: "res-002",
    title: "Advanced Soroban",
    description: "Deep dive into Soroban smart contracts",
    price: "15.00",
    accessUrl: "https://example.com/soroban-advanced",
    resourceType: "link",
    verificationStatus: "pending",
  },
];

const singleResourceMeta = {
  id: "res-001",
  title: "Introduction to Stellar",
  description: "A beginner's guide to Stellar blockchain",
  price: "5.00",
  resourceType: "link",
  verificationStatus: "verified",
  accessUrl: "https://example.com/stellar-intro",
};

describe("browse", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(mockResponse(sampleResources)),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns formatted resource list on success", async () => {
    const result = await browse();
    expect(result).toContain("res-001");
    expect(result).toContain("Introduction to Stellar");
    expect(result).toContain("$5.00 USDC");
    expect(result).toContain("https://example.com/stellar-intro");
    expect(result).toContain("res-002");
    expect(result).toContain("Advanced Soroban");
    expect(result).toContain("$15.00 USDC");
  });

  it("returns empty message when catalog is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse([]));
    const result = await browse();
    expect(result).toBe("No resources listed yet.");
  });

  it("throws on server error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ error: "Internal server error" }, false, 500));
    await expect(browse()).rejects.toThrow("Browse failed");
    await expect(browse()).rejects.toThrow("Internal server error");
  });

  it("throws on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    await expect(browse()).rejects.toThrow("Network error");
  });

  it("calls the correct URL", async () => {
    await browse();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/resources"),
      expect.objectContaining({ headers: { "Content-Type": "application/json" } }),
    );
  });
});

describe("search", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(mockResponse(sampleResources)),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns matching resources by title", async () => {
    const result = await search("Stellar");
    expect(result).toContain("res-001");
    expect(result).not.toContain("res-002");
  });

  it("returns matching resources by description", async () => {
    const result = await search("Soroban");
    expect(result).toContain("res-002");
    expect(result).not.toContain("res-001");
  });

  it("is case-insensitive", async () => {
    const result = await search("stellar");
    expect(result).toContain("Introduction to Stellar");
  });

  it("returns message for empty query", async () => {
    const result = await search("");
    expect(result).toBe("Provide a non-empty search query.");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns message for whitespace-only query", async () => {
    const result = await search("   ");
    expect(result).toBe("Provide a non-empty search query.");
  });

  it("returns message when no resources match", async () => {
    const result = await search("NonExistentTerm");
    expect(result).toBe('No resources match "NonExistentTerm".');
  });

  it("returns message when catalog is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse([]));
    const result = await search("anything");
    expect(result).toBe('No resources match "anything".');
  });

  it("preserves the original query in the no-match message", async () => {
    const result = await search("Stellar Soroban");
    expect(result).toBe('No resources match "Stellar Soroban".');
  });

  it("throws on server error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ error: "Server error" }, false, 500));
    await expect(search("test")).rejects.toThrow("Search failed");
  });

  it("throws on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    await expect(search("test")).rejects.toThrow("Network error");
  });

  it("calls the correct URL", async () => {
    await search("test");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/resources"),
      expect.objectContaining({ headers: { "Content-Type": "application/json" } }),
    );
  });
});

describe("preview", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(mockResponse(singleResourceMeta)),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON with expected top-level keys", async () => {
    const result = await preview("res-001");
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      id: "res-001",
      title: "Introduction to Stellar",
      description: "A beginner's guide to Stellar blockchain",
      price: "$5.00 USDC",
      type: "link",
      verificationStatus: "verified",
      accessUrl: "https://example.com/stellar-intro",
    });
  });

  it("includes all critical fields and no extras", async () => {
    const result = await preview("res-001");
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("id");
    expect(parsed).toHaveProperty("title");
    expect(parsed).toHaveProperty("description");
    expect(parsed).toHaveProperty("price");
    expect(parsed).toHaveProperty("type");
    expect(parsed).toHaveProperty("verificationStatus");
    expect(parsed).toHaveProperty("accessUrl");
    expect(Object.keys(parsed)).toHaveLength(7);
  });

  it("formats price with USDC suffix", async () => {
    const result = await preview("res-001");
    const parsed = JSON.parse(result);
    expect(parsed.price).toMatch(/^\$\d+\.\d+ USDC$/);
  });

  it("throws on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse({ error: "Not found" }, false, 404));
    await expect(preview("missing")).rejects.toThrow("Preview failed");
  });

  it("throws on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    await expect(preview("res-001")).rejects.toThrow("Network error");
  });

  it("calls the correct URL for the resource", async () => {
    await preview("res-001");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/resources/res-001/meta"),
      expect.anything(),
    );
  });
});

describe("txStatus", () => {
  const successEnvelope = {
    jsonrpc: "2.0",
    id: 1,
    result: {
      status: "SUCCESS",
      ledger: 123456,
      createdAt: 1700000000,
      applicationOrder: 1,
      feeBump: false,
      envelopeXdr: "AAAA...env",
      resultXdr: "AAAA...res",
      resultMetaXdr: "AAAA...meta",
    },
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a readable SUCCESS response with ledger and close time", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(successEnvelope));
    const result = await txStatus("abc123");
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe("SUCCESS");
    expect(parsed.hash).toBe("abc123");
    expect(parsed.ledger).toBe(123456);
    expect(parsed.ledgerCloseTime).toBe(new Date(1700000000 * 1000).toISOString());
    expect(parsed.resultXdr).toBe("AAAA...res");
  });

  it("returns a readable FAILED response carrying the result XDR", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({ result: { ...successEnvelope.result, status: "FAILED" } }),
    );
    const result = await txStatus("def456");
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe("FAILED");
    expect(parsed.resultXdr).toBe("AAAA...res");
  });

  it("returns an explicit NOT_FOUND message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({ result: { status: "NOT_FOUND", oldestLedger: 1, latestLedger: 999 } }),
    );
    const result = await txStatus("missing");
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe("NOT_FOUND");
    expect(parsed.message).toContain("not found");
  });

  it("returns a message for an empty hash without calling the RPC", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await txStatus("   ");
    expect(result).toBe("Provide a transaction hash to look up.");
    expect(spy).not.toHaveBeenCalled();
  });

  it("throws on a JSON-RPC error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({ error: { code: -32602, message: "invalid hash" } }),
    );
    await expect(txStatus("bad")).rejects.toThrow("RPC error");
  });

  it("throws on a non-ok HTTP response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({}, false, 503));
    await expect(txStatus("abc123")).rejects.toThrow("Soroban RPC error: 503");
  });

  it("posts a getTransaction request to the Soroban RPC", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(successEnvelope));
    await txStatus("abc123");
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("getTransaction"),
      }),
    );
  });
});

// ── mindvault_buy (#313) ────────────────────────────────────────────────────

const testWallet = { publicKey: "GPUB...TEST", secretKey: "SECRET...KEY" };

describe("buy – happy path (402 → sign → retry → success)", () => {
  beforeEach(() => {
    _setAgentWallet(testWallet);
    _setAgentApiKey(null);
  });

  afterEach(() => {
    _setAgentWallet(null);
    _setAgentApiKey(null);
    vi.restoreAllMocks();
  });

  it("returns parsed resource JSON on a successful paid fetch", async () => {
    const resourceData = {
      id: "res-001",
      title: "Introduction to Stellar",
      price: "5.00",
      accessUrl: "https://example.com/stellar-intro",
    };

    // mock: meta fetch (balance check) → balance covers price
    // mock: Horizon balance check → sufficient balance
    // mock: paid fetch → success
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/accounts/")) {
        // Horizon balance: enough USDC
        return Promise.resolve(
          mockResponse({
            balances: [{ asset_type: "credit_alphanum4", asset_code: "USDC", balance: "100.00" }],
          }),
        );
      }
      if (u.includes("/meta")) {
        return Promise.resolve(
          mockResponse({ ...resourceData, price: "5.00", title: "Introduction to Stellar" }),
        );
      }
      // The paid fetch to access the resource
      return Promise.resolve(mockResponse(resourceData));
    });

    // wrapFetchWithPayment should return a fetch that eventually succeeds
    const { wrapFetchWithPayment } = await import("@x402/fetch");
    vi.mocked(wrapFetchWithPayment).mockImplementation(() => {
      return (_url: any, _init?: any) => Promise.resolve(mockResponse(resourceData));
    });

    const result = await buy("res-001");
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("id", "res-001");
    expect(parsed).toHaveProperty("title", "Introduction to Stellar");
  });

  it("returns an insufficient-funds message when wallet balance is too low", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/accounts/")) {
        // Horizon: insufficient balance
        return Promise.resolve(
          mockResponse({
            balances: [{ asset_type: "credit_alphanum4", asset_code: "USDC", balance: "1.00" }],
          }),
        );
      }
      if (u.includes("/meta")) {
        return Promise.resolve(
          mockResponse({ id: "res-001", title: "Intro to Stellar", price: "50.00" }),
        );
      }
      return Promise.resolve(mockResponse({}, false, 402));
    });

    const result = await buy("res-001");
    expect(result).toContain("Insufficient USDC");
    expect(result).toContain("50 USDC");
    expect(result).toContain("1 USDC");
    expect(result.toLowerCase()).toContain("shortfall");
  });

  it("throws when the paid fetch fails (non-ok response)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/accounts/")) {
        return Promise.resolve(
          mockResponse({
            balances: [{ asset_type: "credit_alphanum4", asset_code: "USDC", balance: "999.00" }],
          }),
        );
      }
      if (u.includes("/meta")) {
        return Promise.resolve(mockResponse({ id: "res-001", title: "Doc", price: "5.00" }));
      }
      return Promise.resolve(mockResponse({ error: "payment rejected" }, false, 402));
    });

    const { wrapFetchWithPayment } = await import("@x402/fetch");
    vi.mocked(wrapFetchWithPayment).mockImplementation(() => {
      return (_url: any, _init?: any) =>
        Promise.resolve(mockResponse({ error: "payment rejected" }, false, 402));
    });

    await expect(buy("res-001")).rejects.toThrow("Buy failed");
  });

  it("throws when no wallet is configured", async () => {
    _setAgentWallet(null);
    await expect(buy("res-001")).rejects.toThrow("No wallet");
  });
});

describe("buy – output shape for agent consumption", () => {
  beforeEach(() => {
    _setAgentWallet(testWallet);
  });

  afterEach(() => {
    _setAgentWallet(null);
    vi.restoreAllMocks();
  });

  it("output is valid JSON with the resource fields", async () => {
    const resourcePayload = {
      id: "res-007",
      title: "Zero-knowledge Proofs",
      price: "20.00",
      accessUrl: "https://example.com/zkp",
      contentUrl: "https://paywall.example.com/content/res-007",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/accounts/")) {
        return Promise.resolve(
          mockResponse({
            balances: [{ asset_type: "credit_alphanum4", asset_code: "USDC", balance: "100.00" }],
          }),
        );
      }
      return Promise.resolve(mockResponse(resourcePayload));
    });

    const { wrapFetchWithPayment } = await import("@x402/fetch");
    vi.mocked(wrapFetchWithPayment).mockImplementation(() => {
      return () => Promise.resolve(mockResponse(resourcePayload));
    });

    const result = await buy("res-007");
    // Output must be parseable JSON – agents rely on this.
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("id");
    expect(parsed).toHaveProperty("accessUrl");
  });
});

// ── mindvault_register_onchain (#313) ───────────────────────────────────────

describe("registerOnchain – happy path", () => {
  beforeEach(() => {
    _setAgentWallet(testWallet);
    _setAgentApiKey("test-api-key");
  });

  afterEach(() => {
    _setAgentWallet(null);
    _setAgentApiKey(null);
    vi.restoreAllMocks();
  });

  it("returns a success message with on-chain tx hash", async () => {
    const unsignedXdr = "AAAAAQAAAAD...unsigned";
    const txHash = "abc123txhash";

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const u = String(url);
      if (u.includes("/register/prepare")) {
        return Promise.resolve(
          mockResponse({
            unsignedXdr,
            networkPassphrase: "Test SDF Network ; September 2015",
          }),
        );
      }
      if (u.includes("/register")) {
        return Promise.resolve(mockResponse({ onchainStatus: "registered", txHash }));
      }
      return Promise.resolve(mockResponse({}));
    });

    // Mock stellar-sdk Transaction + Keypair signing
    vi.doMock("@stellar/stellar-sdk", () => ({
      Keypair: {
        fromSecret: vi.fn().mockReturnValue({ sign: vi.fn() }),
      },
      Transaction: vi.fn(function () {
        return {
          sign: vi.fn(),
          toXDR: vi.fn().mockReturnValue("AAAAAQAAAAD...signed"),
        };
      }),
    }));

    const result = await registerOnchain("res-001");
    expect(result).toContain("registered");
    expect(result).toContain("res-001");
  });

  it("throws when no wallet is configured", async () => {
    _setAgentWallet(null);
    await expect(registerOnchain("res-001")).rejects.toThrow("No wallet");
  });

  it("throws when no API key is configured", async () => {
    _setAgentApiKey(null);
    await expect(registerOnchain("res-001")).rejects.toThrow("Not registered");
  });

  it("throws when resourceId is empty", async () => {
    await expect(registerOnchain("")).rejects.toThrow("resourceId is required");
  });
});

describe("registerOnchain – error and retry messaging", () => {
  beforeEach(() => {
    _setAgentWallet(testWallet);
    _setAgentApiKey("test-api-key");
  });

  afterEach(() => {
    _setAgentWallet(null);
    _setAgentApiKey(null);
    vi.restoreAllMocks();
  });

  it("throws with actionable message when resource is not verified (400)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url).includes("/register/prepare")) {
        return Promise.resolve(
          mockResponse({ error: "Resource must be verified first" }, false, 400),
        );
      }
      return Promise.resolve(mockResponse({}));
    });

    const err = await registerOnchain("res-unverified").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("400");
    expect(err.message).toContain("verified");
  });

  it("throws with actionable message when resource is already registered (409)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url).includes("/register/prepare")) {
        return Promise.resolve(mockResponse({ error: "Already registered" }, false, 409));
      }
      return Promise.resolve(mockResponse({}));
    });

    const err = await registerOnchain("res-already").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("already registered");
  });

  it("throws with actionable message when prepare lacks unsignedXdr", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url).includes("/register/prepare")) {
        return Promise.resolve(mockResponse({ networkPassphrase: "Test" }));
      }
      return Promise.resolve(mockResponse({}));
    });

    const err = await registerOnchain("res-001").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("unsigned transaction");
  });

  it("throws with tx hash hint when submission fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/register/prepare")) {
        return Promise.resolve(
          mockResponse({
            unsignedXdr: "AAAAAQ...xdr",
            networkPassphrase: "Test SDF Network ; September 2015",
          }),
        );
      }
      if (u.includes("/register")) {
        return Promise.resolve(
          mockResponse({ detail: "node timeout", txHash: "failhash123" }, false, 504),
        );
      }
      return Promise.resolve(mockResponse({}));
    });

    vi.doMock("@stellar/stellar-sdk", () => ({
      Keypair: {
        fromSecret: vi.fn().mockReturnValue({ sign: vi.fn() }),
      },
      Transaction: vi.fn(function () {
        return {
          sign: vi.fn(),
          toXDR: vi.fn().mockReturnValue("AAAAAQ...signed"),
        };
      }),
    }));

    const err = await registerOnchain("res-timeout").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("504");
    expect(err.message).toContain("remains listed");
  });

  it("throws with ownership error message (403)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url).includes("/register/prepare")) {
        return Promise.resolve(mockResponse({ error: "Not the owner" }, false, 403));
      }
      return Promise.resolve(mockResponse({}));
    });

    const err = await registerOnchain("res-other").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("different publisher");
  });

  it("output shape is valid for agent consumption on success", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = String(url);
      if (u.includes("/register/prepare")) {
        return Promise.resolve(
          mockResponse({
            unsignedXdr: "AAAAAQ...xdr",
            networkPassphrase: "Test SDF Network ; September 2015",
          }),
        );
      }
      if (u.includes("/register")) {
        return Promise.resolve(
          mockResponse({ onchainStatus: "registered", txHash: "goodhash456" }),
        );
      }
      return Promise.resolve(mockResponse({}));
    });

    vi.doMock("@stellar/stellar-sdk", () => ({
      Keypair: { fromSecret: vi.fn().mockReturnValue({ sign: vi.fn() }) },
      Transaction: vi.fn(function () {
        return {
          sign: vi.fn(),
          toXDR: vi.fn().mockReturnValue("AAAAAQ...signed"),
        };
      }),
    }));

    const result = await registerOnchain("res-success");
    // Output is a multi-line human-readable string (not JSON) that the agent
    // can parse to determine next steps.
    expect(typeof result).toBe("string");
    expect(result).toContain("registered");
    expect(result).toContain("res-success");
  });
});
