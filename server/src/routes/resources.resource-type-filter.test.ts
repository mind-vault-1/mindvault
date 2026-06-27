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

vi.mock("../storage/supabaseStorage.js", () => ({ downloadFile: vi.fn() }));

vi.mock("../db/client.js", () => ({
  db: { insert: vi.fn(), select: vi.fn(), update: vi.fn() },
}));

vi.mock("../middleware/rateLimiters.js", () => ({
  publishIpRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  publishWalletRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/idempotency.js", () => ({
  getIdempotencyStore: () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
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
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import resourceRouter from "./resources.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(resourceRouter);
  return app;
}

describe("GET /resources catalog API — resourceType filter (#161)", () => {
  beforeEach(() => {
    mockListCatalog.mockReset();
    mockListCatalog.mockResolvedValue([]);
    mockCountCatalog.mockReset();
    mockCountCatalog.mockResolvedValue(0);
  });

  it("passes resourceType=link through to listCatalog and returns links", async () => {
    mockListCatalog.mockResolvedValue([
      { id: "l1", title: "Link", price: "1.00", resourceType: "link" },
    ]);

    const res = await request(createTestApp()).get("/resources").query({ resourceType: "link" });

    expect(res.status).toBe(200);
    expect(mockListCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: "link", limit: 20, offset: 0 }),
    );
    expect(res.body).toHaveLength(1);
    expect(res.body[0].resourceType).toBe("link");
  });

  it("supports resourceType=file", async () => {
    mockListCatalog.mockResolvedValue([
      { id: "f1", title: "File", price: "1.00", resourceType: "file" },
    ]);
    const res = await request(createTestApp()).get("/resources").query({ resourceType: "file" });
    expect(res.status).toBe(200);
    expect(mockListCatalog).toHaveBeenCalledWith(expect.objectContaining({ resourceType: "file" }));
  });

  it("returns 400 for an unknown resourceType and does not query the catalog", async () => {
    const res = await request(createTestApp()).get("/resources").query({ resourceType: "video" });
    expect(res.status).toBe(400);
    expect(mockListCatalog).not.toHaveBeenCalled();
  });

  it("leaves unfiltered behavior unchanged (no resourceType applied)", async () => {
    await request(createTestApp()).get("/resources");
    expect(mockListCatalog).toHaveBeenCalledTimes(1);
    expect(mockListCatalog.mock.calls[0][0].resourceType).toBeUndefined();
  });
});
