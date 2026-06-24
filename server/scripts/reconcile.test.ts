import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted — use vi.hoisted() to share mocks across factories
const { mockDbSelect, mockGetResource, mockResourceCount } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockGetResource: vi.fn(),
  mockResourceCount: vi.fn(),
}));

vi.mock("../src/db/client.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockDbSelect,
      }),
    }),
  },
}));

vi.mock("../src/services/registryClient.js", () => ({
  getResource: mockGetResource,
  resourceCount: mockResourceCount,
}));

import { reconcile, printSummary, type ReconciliationSummary } from "./reconcile.js";

// Helpers ------------------------------------------------------------------

function dbRow(overrides: Partial<{
  id: string; price: string; walletAddress: string; listed: boolean; onchainStatus: string;
}> = {}) {
  return { id: "res-001", price: "1", walletAddress: "GCREATOR", listed: true, onchainStatus: "registered", ...overrides };
}

function onChainRow(overrides: Partial<{ price: bigint; creator: string }> = {}) {
  return { price: 10_000_000n, creator: "GCREATOR", ...overrides };
}

/** First call = registered rows, second call = listedNotRegistered rows. */
function setDbRows(registered: object[], listedNotRegistered: object[] = []) {
  mockDbSelect.mockResolvedValueOnce(registered).mockResolvedValueOnce(listedNotRegistered);
}

// --------------------------------------------------------------------------

describe("reconcile()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResourceCount.mockResolvedValue(0);
  });

  it("reports missing on-chain entry", async () => {
    setDbRows([dbRow()]);
    mockGetResource.mockResolvedValue(null);

    const summary = await reconcile();

    expect(summary.totalChecked).toBe(1);
    expect(summary.missingOnChain).toHaveLength(1);
    expect(summary.missingOnChain[0].resourceId).toBe("res-001");
    expect(summary.inSync).toBe(0);
    expect(summary.mismatches).toHaveLength(0);
  });

  it("reports price mismatch", async () => {
    setDbRows([dbRow({ price: "1" })]);
    mockGetResource.mockResolvedValue(onChainRow({ price: 20_000_000n })); // chain says 2 USDC
    mockResourceCount.mockResolvedValue(1);

    const summary = await reconcile();

    expect(summary.mismatches).toHaveLength(1);
    expect(summary.mismatches[0]).toMatchObject({ resourceId: "res-001", dbPrice: "1", chainPrice: "2" });
    expect(summary.inSync).toBe(0);
  });

  it("reports missing DB count delta (orphan on-chain entries)", async () => {
    setDbRows([dbRow()]);
    mockGetResource.mockResolvedValue(onChainRow());
    mockResourceCount.mockResolvedValue(3); // chain has 3, DB has 1 → delta 2

    const summary = await reconcile();

    expect(summary.missingInDb).toHaveLength(1);
    expect(summary.missingInDb[0].resourceId).toMatch(/2 entr/);
  });

  it("handles RPC failure gracefully — no crash, orphan check skipped", async () => {
    setDbRows([dbRow()]);
    mockGetResource.mockResolvedValue(onChainRow());
    mockResourceCount.mockRejectedValue(new Error("RPC timeout"));

    const summary = await reconcile();

    expect(summary.missingInDb).toHaveLength(0);
    expect(summary.inSync).toBe(1);
  });

  it("all-clear when DB and chain fully agree", async () => {
    setDbRows([dbRow(), dbRow({ id: "res-002", price: "0.5" })]);
    mockGetResource
      .mockResolvedValueOnce(onChainRow())
      .mockResolvedValueOnce(onChainRow({ price: 5_000_000n }));
    mockResourceCount.mockResolvedValue(2);

    const summary = await reconcile();

    expect(summary.totalChecked).toBe(2);
    expect(summary.inSync).toBe(2);
    expect(summary.mismatches).toHaveLength(0);
    expect(summary.missingOnChain).toHaveLength(0);
    expect(summary.missingInDb).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------

describe("printSummary()", () => {
  function base(): ReconciliationSummary {
    return {
      checkedAt: "2025-01-01T00:00:00.000Z",
      totalChecked: 3,
      inSync: 3,
      mismatches: [],
      ownerMismatches: [],
      missingOnChain: [],
      missingInDb: [],
      listingDrift: [],
    };
  }

  it("returns 0 and prints ALL CLEAR when no issues", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { writes.push(s as string); return true; });
    expect(printSummary(base())).toBe(0);
    expect(writes.join("")).toContain("ALL CLEAR");
    vi.restoreAllMocks();
  });

  it("returns 1 and prints NEEDS ATTENTION with correct counts", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { writes.push(s as string); return true; });
    const code = printSummary({
      ...base(),
      inSync: 2,
      missingOnChain: [{ resourceId: "res-001", dbPrice: "1", publisherWallet: "GCREATOR" }],
    });
    const out = writes.join("");
    expect(code).toBe(1);
    expect(out).toContain("NEEDS ATTENTION");
    expect(out).toContain("Missing on-chain:       1");
    vi.restoreAllMocks();
  });

  it("includes price mismatch details in output", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => { writes.push(s as string); return true; });
    printSummary({
      ...base(),
      inSync: 0,
      mismatches: [{ resourceId: "res-001", dbPrice: "1", chainPrice: "2", publisherWallet: "GCREATOR" }],
    });
    const out = writes.join("");
    expect(out).toContain("PRICE MISMATCHES");
    expect(out).toContain("res-001");
    vi.restoreAllMocks();
  });
});
