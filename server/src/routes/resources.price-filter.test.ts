import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockListCatalog } = vi.hoisted(() => ({
  mockListCatalog: vi.fn(),
}));

vi.mock("../config.js", () => ({
  config: {
    BASE_URL: "http://localhost:4021",
    MAX_FILE_SIZE_MB: 50,
  },
}));

vi.mock("../services/resourceService.js", () => ({
  listCatalog: mockListCatalog,
  createFileResource: vi.fn(),
  createLinkResource: vi.fn(),
  getResourceMeta: vi.fn(),
  getVerificationDetails: vi.fn(),
  delistResource: vi.fn(),
  getResourceById: vi.fn(),
}));

vi.mock("../storage/supabaseStorage.js", () => ({
  downloadFile: vi.fn(),
}));

vi.mock("../db/client.js", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../middleware/rateLimiters.js", () => ({
  publishIpRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  publishWalletRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/idempotency.js", () => ({
  getIdempotencyStore: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  idempotencyCacheKey: vi.fn(),
}));

vi.mock("../services/registryClient.js", () => ({
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  registryClient: {},
  setPrice: vi.fn(),
  transferOwnership: vi.fn(),
  buildRegisterTx: vi.fn(),
  submitSignedTx: vi.fn(),
  registryKeypair: { publicKey: () => "GTEST" },
}));

vi.mock("../middleware/dynamicPaywall.js", () => ({
  dynamicPaywall: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/logger.js", () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

import resourceRouter from "./resources.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(resourceRouter);
  return app;
}

describe("GET /resources catalog API — price-range query params (#159)", () => {
  beforeEach(() => {
    mockListCatalog.mockReset();
    mockListCatalog.mockResolvedValue([]);
  });

  it("passes minPrice/maxPrice through to listCatalog and maps accessUrl", async () => {
    mockListCatalog.mockResolvedValue([{ id: "in-range", title: "Doc", price: "1.00" }]);

    const res = await request(createTestApp())
      .get("/resources")
      .query({ minPrice: "0.50", maxPrice: "5.00" });

    expect(res.status).toBe(200);
    expect(mockListCatalog).toHaveBeenCalledWith({ minPrice: "0.50", maxPrice: "5.00" });
    expect(res.body[0].accessUrl).toBe("http://localhost:4021/resources/in-range");
  });

  it("passes only minPrice when only minPrice is supplied", async () => {
    await request(createTestApp()).get("/resources").query({ minPrice: "0.50" });
    expect(mockListCatalog).toHaveBeenCalledWith({ minPrice: "0.50" });
  });

  it("passes only maxPrice when only maxPrice is supplied", async () => {
    await request(createTestApp()).get("/resources").query({ maxPrice: "5.00" });
    expect(mockListCatalog).toHaveBeenCalledWith({ maxPrice: "5.00" });
  });

  it("returns 400 for a negative minPrice", async () => {
    const res = await request(createTestApp()).get("/resources").query({ minPrice: "-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(mockListCatalog).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-numeric maxPrice", async () => {
    const res = await request(createTestApp()).get("/resources").query({ maxPrice: "abc" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(mockListCatalog).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty price value", async () => {
    const res = await request(createTestApp()).get("/resources").query({ minPrice: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(mockListCatalog).not.toHaveBeenCalled();
  });

  it("returns 400 when minPrice is greater than maxPrice", async () => {
    const res = await request(createTestApp())
      .get("/resources")
      .query({ minPrice: "5.00", maxPrice: "0.50" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(mockListCatalog).not.toHaveBeenCalled();
  });
});
