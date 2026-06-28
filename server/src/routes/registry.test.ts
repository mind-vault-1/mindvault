import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockRegistryCount } = vi.hoisted(() => ({
  mockRegistryCount: vi.fn(),
}));

vi.mock("../config.js", () => ({
  config: {
    NETWORK: "testnet",
    REGISTRY_CONTRACT_ID: "CDLZFC3SYJYDLZ5UJHAEFFK4F55WD5FE2OQCTCNJNFBKG2MRNGLA",
  },
}));

vi.mock("../services/registryClient.js", () => ({
  registryClient: {
    count: mockRegistryCount,
  },
}));

vi.mock("../lib/logger.js", () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

import registryRouter from "./registry.js";

function createTestApp() {
  const app = express();
  app.use(registryRouter);
  return app;
}

describe("GET /registry/status — public registry metadata endpoint", () => {
  beforeEach(() => {
    mockRegistryCount.mockReset();
  });

  it("returns registry status with correct shape on success", async () => {
    mockRegistryCount.mockResolvedValue({
      result: 42,
    });

    const res = await request(createTestApp()).get("/registry/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      contractId: "CDLZFC3SYJYDLZ5UJHAEFFK4F55WD5FE2OQCTCNJNFBKG2MRNGLA",
      network: "testnet",
      resourceCount: 42,
    });
  });

  it("sets Cache-Control header with 30 second max-age", async () => {
    mockRegistryCount.mockResolvedValue({
      result: 10,
    });

    const res = await request(createTestApp()).get("/registry/status");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=30");
  });

  it("handles network name with colon separator correctly", async () => {
    vi.doMock("../config.js", () => ({
      config: {
        NETWORK: "public:testnet",
        REGISTRY_CONTRACT_ID: "CDLZFC3SYJYDLZ5UJHAEFFK4F55WD5FE2OQCTCNJNFBKG2MRNGLA",
      },
    }));

    mockRegistryCount.mockResolvedValue({
      result: 5,
    });

    const res = await request(createTestApp()).get("/registry/status");

    expect(res.status).toBe(200);
    expect(res.body.network).toBe("testnet");
  });

  it("returns 503 when registry client fails", async () => {
    mockRegistryCount.mockRejectedValue(new Error("RPC connection failed"));

    const res = await request(createTestApp()).get("/registry/status");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: "registry_unavailable",
      message: "Unable to fetch registry status. Please try again later.",
    });
  });

  it("returns 503 when registry count returns error", async () => {
    mockRegistryCount.mockRejectedValue(new Error("Contract error"));

    const res = await request(createTestApp()).get("/registry/status");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("registry_unavailable");
  });

  it("converts resource count from number to number correctly", async () => {
    mockRegistryCount.mockResolvedValue({
      result: "100",
    });

    const res = await request(createTestApp()).get("/registry/status");

    expect(res.status).toBe(200);
    expect(res.body.resourceCount).toBe(100);
  });

  it("handles zero resource count", async () => {
    mockRegistryCount.mockResolvedValue({
      result: 0,
    });

    const res = await request(createTestApp()).get("/registry/status");

    expect(res.status).toBe(200);
    expect(res.body.resourceCount).toBe(0);
  });
});
