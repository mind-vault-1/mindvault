import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../config.js", () => ({
  config: {
    BASE_URL: "http://localhost:4021",
  },
}));

vi.mock("../db/client.js", () => ({
  db: mockDb,
}));

vi.mock("../lib/logger.js", () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

vi.mock("../middleware/apiKeyAuth.js", () => ({
  apiKeyAuth: (req: any, _res: any, next: () => void) => {
    req.publisher = { id: "pub-1", name: "Test Pub", walletAddress: "GPUB123" };
    next();
  },
}));

vi.mock("../services/publisherService.js", () => ({
  registerPublisher: vi.fn(),
  getPublisherResources: vi.fn(),
}));

vi.mock("../middleware/validate.js", () => ({
  validate: () => (_req: any, _res: any, next: () => void) => next(),
  validateFields: vi.fn(),
}));

vi.mock("../schemas/requests.js", () => ({
  publisherRegisterSchema: {},
}));

import publisherRouter from "./publishers.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(publisherRouter);
  return app;
}

describe("GET /publishers/me/analytics — publisher earnings summary (#165)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns summary with zero earnings when no resources exist", async () => {
    const fakeFrom = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
    mockDb.select = vi.fn(() => ({ from: fakeFrom }));

    const res = await request(createTestApp())
      .get("/publishers/me/analytics")
      .set("x-api-key", "valid-key");

    expect(res.status).toBe(200);
    expect(res.body.summary.totalEarned).toBe("0.0000");
    expect(res.body.summary.totalSales).toBe(0);
    expect(res.body.summary.totalResources).toBe(0);
    expect(res.body.resources).toEqual([]);
  });

  it("aggregates payments per resource correctly", async () => {
    const resources = [
      { id: "res-1", title: "Doc A", price: "0.50", verificationStatus: "verified", listed: true, createdAt: new Date() },
      { id: "res-2", title: "Doc B", price: "1.00", verificationStatus: "verified", listed: true, createdAt: new Date() },
    ];

    const payments = [
      { id: "pay-1", resourceId: "res-1", payerAddress: "GPAY1", amount: "0.50", paidAt: new Date() },
      { id: "pay-2", resourceId: "res-1", payerAddress: "GPAY2", amount: "0.50", paidAt: new Date() },
      { id: "pay-3", resourceId: "res-2", payerAddress: "GPAY3", amount: "1.00", paidAt: new Date() },
    ];

    const selectCalls = [
      { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(resources) }) },
      { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(payments) }) },
    ];

    const selectMock = vi.fn();
    selectMock.mockImplementation(() => selectCalls.shift()!);
    mockDb.select = selectMock;

    const res = await request(createTestApp())
      .get("/publishers/me/analytics")
      .set("x-api-key", "valid-key");

    expect(res.status).toBe(200);
    expect(res.body.summary.totalEarned).toBe("2.0000");
    expect(res.body.summary.totalSales).toBe(3);
    expect(res.body.summary.totalResources).toBe(2);

    // Per-resource stats
    const res1 = res.body.resources.find((r: any) => r.id === "res-1");
    expect(res1.totalEarned).toBe("1.0000");
    expect(res1.totalSales).toBe(2);
    expect(res1.recentPayments).toHaveLength(2);

    const res2 = res.body.resources.find((r: any) => r.id === "res-2");
    expect(res2.totalEarned).toBe("1.0000");
    expect(res2.totalSales).toBe(1);
  });

  it("excludes payments to unrelated wallets (only publisher's own resources)", async () => {
    const resources = [
      { id: "res-1", title: "My Doc", price: "0.50", verificationStatus: "verified", listed: true, createdAt: new Date() },
    ];

    const payments = [
      { id: "pay-1", resourceId: "res-1", payerAddress: "GPAY1", amount: "0.50", paidAt: new Date() },
    ];

    const selectCalls = [
      { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(resources) }) },
      { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(payments) }) },
    ];

    const selectMock = vi.fn();
    selectMock.mockImplementation(() => selectCalls.shift()!);
    mockDb.select = selectMock;

    const res = await request(createTestApp())
      .get("/publishers/me/analytics")
      .set("x-api-key", "valid-key");

    expect(res.status).toBe(200);
    // Only payments for res-1 are counted
    expect(res.body.summary.totalSales).toBe(1);
    expect(res.body.summary.totalEarned).toBe("0.5000");
    // No unrelated wallet payments leak in
    expect(res.body.resources[0].recentPayments[0].payerAddress).toBe("GPAY1");
  });
});
