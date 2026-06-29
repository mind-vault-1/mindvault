import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockCheckOriginality } = vi.hoisted(() => ({
  mockCheckOriginality: vi.fn(),
}));

vi.mock("../config.js", () => ({
  config: {
    BASE_URL: "http://localhost:4021",
    PAY_TO: "GTEST123456789",
    NETWORK: "testnet",
    VERIFICATION_PRICE: "0.10",
  },
}));

vi.mock("../services/verificationService.js", () => ({
  checkOriginality: mockCheckOriginality,
}));

vi.mock("../db/client.js", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "v1" }])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve([])),
        where: vi.fn(() => ({
          then: vi.fn((cb) => cb([{ title: "Test Resource" }])),
        })),
      })),
    })),
  },
}));

vi.mock("../db/schema.js", () => ({
  resources: {},
  verifications: {},
}));

vi.mock("../lib/x402.js", () => ({
  network: "testnet",
  sharedX402ResourceServer: {},
}));

vi.mock("@x402/express", () => ({
  paymentMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../middleware/rateLimiters.js", () => ({
  verifyIpRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  verifyWalletRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../middleware/validate.js", () => ({
  validate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import verifyRouter from "./verify.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(verifyRouter);
  return app;
}

describe("POST /verify-content — AI content verification endpoint", () => {
  beforeEach(() => {
    mockCheckOriginality.mockReset();
  });

  it("returns verification result for approved content", async () => {
    mockCheckOriginality.mockResolvedValue({
      isOriginal: true,
      confidence: 0.95,
      flags: ["Content appears to be a legitimate resource listing"],
    });

    const res = await request(createTestApp())
      .post("/verify-content")
      .send({ content: "A comprehensive dataset for machine learning" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      isOriginal: true,
      confidence: 0.95,
      flags: ["Content appears to be a legitimate resource listing"],
    });
    expect(mockCheckOriginality).toHaveBeenCalledWith(
      "A comprehensive dataset for machine learning",
      "text",
    );
  });

  it("returns verification result for rejected content", async () => {
    mockCheckOriginality.mockResolvedValue({
      isOriginal: false,
      confidence: 0.15,
      flags: ["Content appears to be spam or gibberish"],
    });

    const res = await request(createTestApp())
      .post("/verify-content")
      .send({ content: "test123 asdf" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      isOriginal: false,
      confidence: 0.15,
      flags: ["Content appears to be spam or gibberish"],
    });
  });

  it("saves verification result when resourceId is provided (approved)", async () => {
    mockCheckOriginality.mockResolvedValue({
      isOriginal: true,
      confidence: 0.88,
      flags: ["Genuine resource"],
    });

    const res = await request(createTestApp()).post("/verify-content").send({
      content: "High-quality API documentation",
      resourceId: "res-123",
    });

    expect(res.status).toBe(200);
    expect(res.body.isOriginal).toBe(true);
  });

  it("saves verification result when resourceId is provided (rejected)", async () => {
    mockCheckOriginality.mockResolvedValue({
      isOriginal: false,
      confidence: 0.22,
      flags: ["Low effort listing"],
    });

    const res = await request(createTestApp()).post("/verify-content").send({
      content: "test",
      resourceId: "res-456",
    });

    expect(res.status).toBe(200);
    expect(res.body.isOriginal).toBe(false);
  });

  it("handles verification service errors gracefully", async () => {
    mockCheckOriginality.mockResolvedValue({
      isOriginal: false,
      confidence: 0,
      flags: ["No response from verification model"],
    });

    const res = await request(createTestApp())
      .post("/verify-content")
      .send({ content: "test content" });

    expect(res.status).toBe(200);
    expect(res.body.isOriginal).toBe(false);
    expect(res.body.confidence).toBe(0);
  });
});

describe("GET /agent/status — public agent stats endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns agent status with correct shape", async () => {
    const res = await request(createTestApp()).get("/agent/status");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("agent");
    expect(res.body).toHaveProperty("stats");
    expect(res.body).toHaveProperty("recentActivity");

    expect(res.body.agent).toMatchObject({
      name: "MindVault Verification Agent",
      walletAddress: "GTEST123456789",
      network: "testnet",
      endpoint: "http://localhost:4021/verify-content",
      pricePerVerification: "0.10",
      currency: "USDC",
      status: "active",
    });

    expect(res.body.stats).toMatchObject({
      totalVerifications: expect.any(Number),
      verified: expect.any(Number),
      rejected: expect.any(Number),
      totalEarned: expect.any(String),
      avgConfidence: expect.any(String),
    });

    expect(Array.isArray(res.body.recentActivity)).toBe(true);
  });

  it("returns stats with zero values when no verifications exist", async () => {
    const res = await request(createTestApp()).get("/agent/status");

    expect(res.status).toBe(200);
    expect(res.body.stats.totalVerifications).toBe(0);
    expect(res.body.stats.verified).toBe(0);
    expect(res.body.stats.rejected).toBe(0);
    expect(res.body.stats.totalEarned).toBe("0.0000");
    expect(res.body.stats.avgConfidence).toBe("0.00");
  });

  it("returns recent activity array with correct structure", async () => {
    const res = await request(createTestApp()).get("/agent/status");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recentActivity)).toBe(true);
  });
});
