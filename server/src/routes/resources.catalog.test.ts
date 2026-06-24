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

describe("GET /resources catalog API — verificationStatus query param (#204)", () => {
  beforeEach(() => {
    mockListCatalog.mockReset();
    mockListCatalog.mockResolvedValue([]);
  });

  it("passes verificationStatus=verified to listCatalog", async () => {
    mockListCatalog.mockResolvedValue([
      { id: "verified-1", title: "Doc", verificationStatus: "verified" },
    ]);

    const res = await request(createTestApp())
      .get("/resources")
      .query({ verificationStatus: "verified" });

    expect(res.status).toBe(200);
    expect(mockListCatalog).toHaveBeenCalledWith({ verificationStatus: "verified" });
    expect(res.body[0].accessUrl).toBe("http://localhost:4021/resources/verified-1");
  });

  it("passes verificationStatus=pending to listCatalog", async () => {
    await request(createTestApp()).get("/resources").query({ verificationStatus: "pending" });

    expect(mockListCatalog).toHaveBeenCalledWith({ verificationStatus: "pending" });
  });

  it("passes verificationStatus=rejected to listCatalog", async () => {
    await request(createTestApp()).get("/resources").query({ verificationStatus: "rejected" });

    expect(mockListCatalog).toHaveBeenCalledWith({ verificationStatus: "rejected" });
  });

  it("calls listCatalog without a filter when verificationStatus is omitted", async () => {
    await request(createTestApp()).get("/resources");

    expect(mockListCatalog).toHaveBeenCalledWith(undefined);
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
