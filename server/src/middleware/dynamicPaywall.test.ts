import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPaymentMiddleware = vi.fn(() => (req: any, res: any, next: any) => next());
const mockGetOnChainPrice = vi.fn();
const mockNormalizeUsdcPrice = vi.fn((value: string) => value);

vi.mock("@x402/express", () => ({
    paymentMiddleware: mockPaymentMiddleware,
    x402ResourceServer: class { register() { return this; } },
}));
vi.mock("@x402/core/server", () => ({ HTTPFacilitatorClient: class { constructor() { } } }));
vi.mock("@x402/stellar/exact/server", () => ({ ExactStellarScheme: class { constructor() { } } }));
vi.mock("../config.ts", () => ({
    config: {
        NETWORK: "stellar:testnet",
        FACILITATOR_URL: "https://www.x402.org/facilitator",
        PAY_TO: "GTEST",
        OPENROUTER_API_KEY: "dummy",
        VAULT_REGISTRY_CONTRACT_ID: "GREGISTRY",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_KEY: "supabase-service-key",
        REGISTRY_CONTRACT_ID: "GREGISTRYID",
        REGISTRY_SECRET_KEY: "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        VERIFICATION_PRICE: "0.10",
    },
}));
vi.mock("../services/registryClient.js", () => ({
    getResource: vi.fn(),
}));
vi.mock("../lib/stellarRegistry.js", () => ({
    getOnChainPrice: mockGetOnChainPrice,
    normalizeUsdcPrice: mockNormalizeUsdcPrice,
    OnChainLookupError: class OnChainLookupError extends Error { },
}));
vi.mock("../db/client.js", () => ({
    db: {
        select: vi.fn(),
    },
}));

function makeDbSelect(resource: unknown) {
    const then = vi.fn(async (callback: (rows: unknown[]) => unknown) => callback(resource ? [resource] : []));
    const where = vi.fn(() => ({ then }));
    const from = vi.fn(() => ({ where }));
    return {
        select: vi.fn(() => ({ from })),
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
        const dbMock = makeDbSelect({ id: "r1", listed: false, price: "1.00", walletAddress: "GABC", onchainStatus: "none" });
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

    it("returns 503 when on-chain price lookup fails", async () => {
        const dbMock = makeDbSelect({ id: "r2", listed: true, price: "1.00", walletAddress: "GABC", onchainStatus: "none" });
        const { db } = await import("../db/client.js");
        const { dynamicPaywall } = await import("./dynamicPaywall.js");
        (db as any).select = dbMock.select;
        mockGetOnChainPrice.mockRejectedValue(new Error("chain unavailable"));

        const req = createRequest("r2");
        const res = createResponse();
        const next = createNext();

        await dynamicPaywall(req, res, next);

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "chain_unavailable" }));
        expect(next).not.toHaveBeenCalled();
    });

    it("returns 409 when on-chain and DB prices mismatch", async () => {
        const dbMock = makeDbSelect({ id: "r3", listed: true, price: "1.00", walletAddress: "GABC", onchainStatus: "none" });
        const { db } = await import("../db/client.js");
        const { dynamicPaywall } = await import("./dynamicPaywall.js");
        (db as any).select = dbMock.select;
        mockGetOnChainPrice.mockResolvedValue({ price: "1.50", creator: "GABC" });
        mockNormalizeUsdcPrice.mockReturnValue("1.00");

        const req = createRequest("r3");
        const res = createResponse();
        const next = createNext();

        await dynamicPaywall(req, res, next);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "price_mismatch" }));
        expect(next).not.toHaveBeenCalled();
    });

    it("delegates to payment middleware when prices match and resource is listed", async () => {
        const dbMock = makeDbSelect({ id: "r4", listed: true, price: "1.00", walletAddress: "GABC", onchainStatus: "none" });
        const { db } = await import("../db/client.js");
        const { dynamicPaywall } = await import("./dynamicPaywall.js");
        (db as any).select = dbMock.select;
        mockGetOnChainPrice.mockResolvedValue({ price: "1.00", creator: "GABC" });
        mockNormalizeUsdcPrice.mockReturnValue("1.00");
        mockPaymentMiddleware.mockReturnValue((req: any, res: any, next: any) => next());

        const req = createRequest("r4");
        const res = createResponse();
        const next = createNext();

        await dynamicPaywall(req, res, next);

        expect(mockPaymentMiddleware).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });
});
