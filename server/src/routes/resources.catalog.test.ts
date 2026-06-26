import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockListCatalog, mockCountCatalog } = vi.hoisted(() => ({
  mockListCatalog: vi.fn(),
  mockCountCatalog: vi.fn(),
}));

vi.mock("../config.js", () => ({
  config: {
    BASE_URL: "http://localhost:4021",
    MAX_FILE_SIZE_MB: 50,
  },
}));

vi.mock("../services/resourceService.js", () => ({
  listCatalog: mockListCatalog,
  countCatalog: mockCountCatalog,
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

describe("GET /resources catalog API — verificationStatus query param (#204)", () => {
  beforeEach(() => {
    mockListCatalog.mockReset();
    mockListCatalog.mockResolvedValue([]);
    mockCountCatalog.mockReset();
    mockCountCatalog.mockResolvedValue(0);
  });

  it("passes verificationStatus=verified to listCatalog", async () => {
    mockListCatalog.mockResolvedValue([
      { id: "verified-1", title: "Doc", verificationStatus: "verified" },
    ]);

    const res = await request(createTestApp())
      .get("/resources")
      .query({ verificationStatus: "verified" });

    expect(res.status).toBe(200);
    expect(mockListCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ verificationStatus: "verified", limit: 20, offset: 0 }),
    );
    expect(res.body[0].accessUrl).toBe("http://localhost:4021/resources/verified-1");
  });

  it("passes verificationStatus=pending to listCatalog", async () => {
    await request(createTestApp()).get("/resources").query({ verificationStatus: "pending" });

    expect(mockListCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ verificationStatus: "pending" }),
    );
  });

  it("passes verificationStatus=rejected to listCatalog", async () => {
    await request(createTestApp()).get("/resources").query({ verificationStatus: "rejected" });

    expect(mockListCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ verificationStatus: "rejected" }),
    );
  });

  it("calls listCatalog with default pagination when verificationStatus is omitted", async () => {
    await request(createTestApp()).get("/resources");

    expect(mockListCatalog).toHaveBeenCalledWith({
      verificationStatus: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      search: undefined,
      resourceType: undefined,
      sort: undefined,
      limit: 20,
      offset: 0,
    });
  });

  it("returns 400 for an unsupported verificationStatus value", async () => {
    const res = await request(createTestApp())
      .get("/resources")
      .query({ verificationStatus: "skipped" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(mockListCatalog).not.toHaveBeenCalled();
  });
});

describe("GET /resources catalog API — price filters (#203)", () => {
  beforeEach(() => {
    mockListCatalog.mockReset();
    mockListCatalog.mockResolvedValue([]);
    mockCountCatalog.mockReset();
    mockCountCatalog.mockResolvedValue(0);
  });

  it("passes minPrice to listCatalog", async () => {
    await request(createTestApp()).get("/resources").query({ minPrice: "1.00" });

    expect(mockListCatalog).toHaveBeenCalledWith(expect.objectContaining({ minPrice: "1.00" }));
  });

  it("passes maxPrice to listCatalog", async () => {
    await request(createTestApp()).get("/resources").query({ maxPrice: "5.00" });

    expect(mockListCatalog).toHaveBeenCalledWith(expect.objectContaining({ maxPrice: "5.00" }));
  });

  it("passes combined minPrice and maxPrice to listCatalog", async () => {
    await request(createTestApp()).get("/resources").query({ minPrice: "1.00", maxPrice: "3.00" });

    expect(mockListCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ minPrice: "1.00", maxPrice: "3.00" }),
    );
  });

  it("passes price filters alongside verificationStatus", async () => {
    await request(createTestApp())
      .get("/resources")
      .query({ minPrice: "0.50", verificationStatus: "verified" });

    expect(mockListCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        minPrice: "0.50",
        verificationStatus: "verified",
      }),
    );
  });

  it("returns 400 for a non-numeric minPrice", async () => {
    const res = await request(createTestApp()).get("/resources").query({ minPrice: "free" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(mockListCatalog).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-numeric maxPrice", async () => {
    const res = await request(createTestApp()).get("/resources").query({ maxPrice: "expensive" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(mockListCatalog).not.toHaveBeenCalled();
  });

  it("accepts boundary value minPrice=0", async () => {
    await request(createTestApp()).get("/resources").query({ minPrice: "0" });

    expect(mockListCatalog).toHaveBeenCalledWith(expect.objectContaining({ minPrice: "0" }));
  });

  it("accepts decimal boundary values", async () => {
    await request(createTestApp()).get("/resources").query({ minPrice: "0.01", maxPrice: "9999.99" });

    expect(mockListCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ minPrice: "0.01", maxPrice: "9999.99" }),
    );
  });
});

describe("GET /resources catalog API — pagination (#162)", () => {
  beforeEach(() => {
    mockListCatalog.mockReset();
    mockListCatalog.mockResolvedValue([]);
    mockCountCatalog.mockReset();
    mockCountCatalog.mockResolvedValue(0);
  });

  it("defaults to limit=20 and offset=0", async () => {
    const res = await request(createTestApp()).get("/resources");

    expect(mockListCatalog).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }));
    expect(res.headers["x-limit"]).toBe("20");
    expect(res.headers["x-offset"]).toBe("0");
  });

  it("passes a custom limit and offset through to listCatalog", async () => {
    await request(createTestApp()).get("/resources").query({ limit: "5", offset: "10" });

    expect(mockListCatalog).toHaveBeenCalledWith(expect.objectContaining({ limit: 5, offset: 10 }));
  });

  it("returns X-Total-Count and X-Next-Offset headers when more pages remain", async () => {
    mockListCatalog.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);
    mockCountCatalog.mockResolvedValue(5);

    const res = await request(createTestApp()).get("/resources").query({ limit: "2", offset: "0" });

    expect(res.headers["x-total-count"]).toBe("5");
    expect(res.headers["x-next-offset"]).toBe("2");
  });

  it("omits X-Next-Offset on the last page", async () => {
    mockListCatalog.mockResolvedValue([{ id: "r1" }]);
    mockCountCatalog.mockResolvedValue(1);

    const res = await request(createTestApp())
      .get("/resources")
      .query({ limit: "20", offset: "0" });

    expect(res.headers["x-next-offset"]).toBeUndefined();
  });

  it("returns 400 for a limit above the max", async () => {
    const res = await request(createTestApp()).get("/resources").query({ limit: "1000" });

    expect(res.status).toBe(400);
    expect(mockListCatalog).not.toHaveBeenCalled();
  });

  it("returns 400 for a negative offset", async () => {
    const res = await request(createTestApp()).get("/resources").query({ offset: "-1" });

    expect(res.status).toBe(400);
    expect(mockListCatalog).not.toHaveBeenCalled();
  });
});

describe("GET /resources catalog API — sorting (#163)", () => {
  beforeEach(() => {
    mockListCatalog.mockReset();
    mockListCatalog.mockResolvedValue([]);
    mockCountCatalog.mockReset();
    mockCountCatalog.mockResolvedValue(0);
  });

  it.each(["newest", "price_asc", "price_desc", "title"])(
    "passes sort=%s through to listCatalog",
    async (sort) => {
      await request(createTestApp()).get("/resources").query({ sort });

      expect(mockListCatalog).toHaveBeenCalledWith(expect.objectContaining({ sort }));
    },
  );

  it("returns 400 for an unsupported sort value", async () => {
    const res = await request(createTestApp()).get("/resources").query({ sort: "popularity" });

    expect(res.status).toBe(400);
    expect(mockListCatalog).not.toHaveBeenCalled();
  });
});
