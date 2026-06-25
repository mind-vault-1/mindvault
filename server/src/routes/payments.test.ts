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

import paymentsRouter from "./payments.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(paymentsRouter);
  return app;
}

describe("GET /payments/:id — payment receipt (#166)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns receipt metadata for a valid payment id", async () => {
    const fakeFrom = vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: "pay-1",
              resourceId: "res-1",
              resourceTitle: "My Resource",
              amount: "0.50",
              currency: "USDC",
              payerAddress: "GPAYER123",
              recipientAddress: "GRECV123",
              paidAt: new Date("2026-06-01T12:00:00Z"),
            },
          ]),
        }),
      }),
    });

    const mockSelect = vi.fn(() => ({ from: fakeFrom }));
    mockDb.select = mockSelect;

    const res = await request(createTestApp()).get("/payments/pay-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("pay-1");
    expect(res.body.resourceId).toBe("res-1");
    expect(res.body.resourceTitle).toBe("My Resource");
    expect(res.body.amount).toBe("0.50");
    expect(res.body.currency).toBe("USDC");
    expect(res.body.payerAddress).toBe("GPAYER123");
    expect(res.body.recipientAddress).toBe("GRECV123");
    expect(res.body.paidAt).toBeDefined();
  });

  it("returns 404 for a missing payment id", async () => {
    const fakeFrom = vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    mockDb.select = vi.fn(() => ({ from: fakeFrom }));

    const res = await request(createTestApp()).get("/payments/missing-id");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Payment receipt not found");
  });

  it("does not expose protected resource content", async () => {
    const fakeFrom = vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: "pay-2",
              resourceId: "res-2",
              resourceTitle: "Test",
              amount: "1.00",
              currency: "USDC",
              payerAddress: "GPAYER",
              recipientAddress: "GRECV",
              paidAt: new Date(),
            },
          ]),
        }),
      }),
    });

    mockDb.select = vi.fn(() => ({ from: fakeFrom }));

    const res = await request(createTestApp()).get("/payments/pay-2");

    expect(res.body.externalUrl).toBeUndefined();
    expect(res.body.storagePath).toBeUndefined();
    expect(res.body.contentHash).toBeUndefined();
  });
});

describe("GET /payments — list payments by payer (#167)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns payments filtered by payer address", async () => {
    const fakeWhere = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue([
        {
          id: "pay-1",
          resourceId: "res-1",
          resourceTitle: "Doc A",
          amount: "0.50",
          currency: "USDC",
          payerAddress: "GBUYER1",
          recipientAddress: "GSELLER1",
          paidAt: new Date("2026-06-01T12:00:00Z"),
        },
        {
          id: "pay-2",
          resourceId: "res-2",
          resourceTitle: "Doc B",
          amount: "1.00",
          currency: "USDC",
          payerAddress: "GBUYER1",
          recipientAddress: "GSELLER2",
          paidAt: new Date("2026-06-02T12:00:00Z"),
        },
      ]),
    });

    const fakeLeftJoin = vi.fn().mockReturnValue({ where: fakeWhere });
    const fakeFrom = vi.fn().mockReturnValue({ leftJoin: fakeLeftJoin });
    mockDb.select = vi.fn(() => ({ from: fakeFrom }));

    const res = await request(createTestApp()).get("/payments?payer=GBUYER1");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].resourceTitle).toBe("Doc A");
    expect(res.body[1].resourceTitle).toBe("Doc B");
  });

  it("returns 400 when payer query param is missing", async () => {
    const res = await request(createTestApp()).get("/payments");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Query parameter 'payer' is required");
  });

  it("returns empty array when payer has no payments", async () => {
    const fakeWhere = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue([]),
    });

    const fakeLeftJoin = vi.fn().mockReturnValue({ where: fakeWhere });
    const fakeFrom = vi.fn().mockReturnValue({ leftJoin: fakeLeftJoin });
    mockDb.select = vi.fn(() => ({ from: fakeFrom }));

    const res = await request(createTestApp()).get("/payments?payer=GNOPAY");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("does not leak protected resource content", async () => {
    const fakeWhere = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue([
        {
          id: "pay-3",
          resourceId: "res-3",
          resourceTitle: "Safe",
          amount: "2.00",
          currency: "USDC",
          payerAddress: "GBUYER2",
          recipientAddress: "GSELLER3",
          paidAt: new Date(),
        },
      ]),
    });

    const fakeLeftJoin = vi.fn().mockReturnValue({ where: fakeWhere });
    const fakeFrom = vi.fn().mockReturnValue({ leftJoin: fakeLeftJoin });
    mockDb.select = vi.fn(() => ({ from: fakeFrom }));

    const res = await request(createTestApp()).get("/payments?payer=GBUYER2");

    expect(res.body[0].externalUrl).toBeUndefined();
    expect(res.body[0].storagePath).toBeUndefined();
  });
});
