import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPaymentMiddleware = vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next());
const mockGetOnChainPrice = vi.fn();
const mockNormalizeUsdcPrice = vi.fn((value: string) => value);

class MockOnChainLookupError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "OnChainLookupError";
    this.cause = cause;
  }
}

vi.mock("@x402/express", () => ({
  paymentMiddleware: mockPaymentMiddleware,
}));
vi.mock("../lib/x402.js", () => ({
  network: "stellar:testnet",
  sharedX402ResourceServer: {},
}));
vi.mock("../lib/logger.js", () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));
vi.mock("../services/registryClient.js", () => ({
  getResource: vi.fn(),
}));
vi.mock("../lib/stellarRegistry.js", () => ({
  getOnChainPrice: mockGetOnChainPrice,
  normalizeUsdcPrice: mockNormalizeUsdcPrice,
  OnChainLookupError: MockOnChainLookupError,
}));
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

function makeDbSelect(resource: unknown) {
  const then = vi.fn(async (callback: (rows: unknown[]) => unknown) =>
    callback(resource ? [resource] : []),
  );
  const where = vi.fn(() => ({ then }));
  const from = vi.fn(() => ({ where }));
  return {
    select: vi.fn(() => ({ from })),
  };
}

function listedResource(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    listed: true,
    price: "1.00",
    walletAddress: "GABC",
    title: "Test resource",
    onchainStatus: "registered",
    ...overrides,
  };
}

function createResponse() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

function createRequest(resourceId: string) {
  return {
    params: { id: resourceId },
    headers: {},
  } as any;
}

function createNext() {
  return vi.fn();
}

describe("dynamicPaywall middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaymentMiddleware.mockReset();
    mockGetOnChainPrice.mockReset();
    mockNormalizeUsdcPrice.mockReset();
  });

  it("returns 404 when the resource is missing", async () => {
    const dbMock = makeDbSelect(null);
    const { db } = await import("../db/client.js");
    const { dynamicPaywall } = await import("./dynamicPaywall.js");
    (db as any).select = dbMock.select;

    const req = createRequest("missing");
    const res = createResponse();
    const next = createNext();

    await dynamicPaywall(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Resource not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when a listed resource is not active", async () => {
    const dbMock = makeDbSelect({
      id: "r1",
      listed: false,
      price: "1.00",
      walletAddress: "GABC",
      title: "Test resource",
      onchainStatus: "none",
    });
    const { db } = await import("../db/client.js");
    const { dynamicPaywall } = await import("./dynamicPaywall.js");
    (db as any).select = dbMock.select;

    const req = createRequest("r1");
    const res = createResponse();
    const next = createNext();

    await dynamicPaywall(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Resource not listed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 503 when Soroban RPC lookup fails", async () => {
    const dbMock = makeDbSelect(listedResource({ id: "r2", onchainStatus: "none" }));
    const { db } = await import("../db/client.js");
    const { dynamicPaywall } = await import("./dynamicPaywall.js");
    (db as any).select = dbMock.select;

    const rpcError = new Error("Soroban RPC unavailable");
    mockGetOnChainPrice.mockRejectedValue(
      new MockOnChainLookupError("Failed to read on-chain record for resource r2", rpcError),
    );

    const req = createRequest("r2");
    const res = createResponse();
    const next = createNext();

    await dynamicPaywall(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: "chain_unavailable",
      message: "Unable to verify resource price. Please try again later.",
      resourceId: "r2",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 503 when the registry has no on-chain record", async () => {
    const dbMock = makeDbSelect(listedResource({ id: "r-missing" }));
    const { db } = await import("../db/client.js");
    const { dynamicPaywall } = await import("./dynamicPaywall.js");
    (db as any).select = dbMock.select;

    mockGetOnChainPrice.mockRejectedValue(
      new MockOnChainLookupError("Resource r-missing not found on-chain"),
    );

    const req = createRequest("r-missing");
    const res = createResponse();
    const next = createNext();

    await dynamicPaywall(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "chain_unavailable", resourceId: "r-missing" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 409 when DB and on-chain prices mismatch", async () => {
    const dbMock = makeDbSelect(listedResource({ id: "r3", price: "1.00" }));
    const { db } = await import("../db/client.js");
    const { dynamicPaywall } = await import("./dynamicPaywall.js");
    (db as any).select = dbMock.select;

    mockGetOnChainPrice.mockResolvedValue({ price: "1.5000000", creator: "GABC" });
    mockNormalizeUsdcPrice.mockReturnValue("1.0000000");

    const req = createRequest("r3");
    const res = createResponse();
    const next = createNext();

    await dynamicPaywall(req, res, next);

    expect(mockNormalizeUsdcPrice).toHaveBeenCalledWith("1.00");
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: "price_mismatch",
      message:
        "Resource price is temporarily unavailable due to a configuration issue. Please try again later.",
      resourceId: "r3",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("delegates to payment middleware when prices match", async () => {
    const resource = listedResource({ id: "r4", price: "0.50", onchainStatus: "none" });
    const dbMock = makeDbSelect(resource);
    const { db } = await import("../db/client.js");
    const { dynamicPaywall } = await import("./dynamicPaywall.js");
    (db as any).select = dbMock.select;

    mockGetOnChainPrice.mockResolvedValue({ price: "0.5000000", creator: "GABC" });
    mockNormalizeUsdcPrice.mockReturnValue("0.5000000");
    mockPaymentMiddleware.mockReturnValue((_req, _res, next) => next());

    const req = createRequest("r4");
    const res = createResponse();
    const next = createNext();

    await dynamicPaywall(req, res, next);

    expect(mockPaymentMiddleware).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
