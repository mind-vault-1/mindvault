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
  x402Client: vi.fn().mockImplementation(() => ({ register: vi.fn() })),
}));

vi.mock("@mindvault/registry-client", () => ({
  networks: { testnet: { contractId: "test", networkPassphrase: "test" } },
}));

import { browse, search, preview } from "./index.js";

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
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ error: "Not found" }, false, 404));
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
