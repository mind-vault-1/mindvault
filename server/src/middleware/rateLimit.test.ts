import { describe, it, expect } from "vitest";
import type { Request } from "express";
import express from "express";
import request from "supertest";
import {
  extractPayerFromPaymentHeader,
  createIpRateLimiter,
  createWalletRateLimiter,
  RATE_LIMITED,
} from "../middleware/rateLimit.js";

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    headers: {},
    publisher: undefined,
    ...overrides,
  } as Request;
}

function mockResponse() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    headers,
  };
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
  };
}

describe("extractPayerFromPaymentHeader", () => {
  it("returns undefined when the header is missing", () => {
    expect(extractPayerFromPaymentHeader(mockRequest())).toBeUndefined();
  });

  it("extracts the payer address from a base64 x-payment payload", () => {
    const payload = {
      payload: {
        authorization: {
          address: "GABC123EXAMPLEADDRESS",
        },
      },
    };
    const header = Buffer.from(JSON.stringify(payload)).toString("base64");
    expect(
      extractPayerFromPaymentHeader(mockRequest({ headers: { "x-payment": header } })),
    ).toBe("GABC123EXAMPLEADDRESS");
  });

  it("falls back to clientAddress when authorization is absent", () => {
    const payload = { clientAddress: "GCLIENT123EXAMPLEADDRESS" };
    const header = Buffer.from(JSON.stringify(payload)).toString("base64");
    expect(
      extractPayerFromPaymentHeader(mockRequest({ headers: { "x-payment": header } })),
    ).toBe("GCLIENT123EXAMPLEADDRESS");
  });
});

describe("createIpRateLimiter", () => {
  let now: number;
  let store: MemorySlidingWindowStore;

  beforeEach(() => {
    now = 0;
    store = new MemorySlidingWindowStore(() => now);
  });

  async function runLimiter(
    limiter: ReturnType<typeof createIpRateLimiter>,
    req: Request,
  ): Promise<Response & { statusCode: number; body: unknown; headers: Record<string, string> }> {
    const res = mockResponse();
    const next = vi.fn() as NextFunction;
    await limiter(req, res, next);
    return res;
  }

  it("allows requests under the limit and sets RateLimit headers", async () => {
    const limiter = createIpRateLimiter(store, "test", 2, 60_000);
    const res = await runLimiter(limiter, mockRequest());

    expect(res.statusCode).toBe(200);
    expect(res.headers["RateLimit-Limit"]).toBe("2");
    expect(res.headers["RateLimit-Remaining"]).toBe("1");
  });

  it("returns 429 when the sliding window is full", async () => {
    const limiter = createIpRateLimiter(store, "test", 1, 60_000);
    await runLimiter(limiter, mockRequest());
    const res = await runLimiter(limiter, mockRequest());

    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ error: "Too many requests" });
    expect(res.headers["Retry-After"]).toBeDefined();
  });
});

describe("createWalletRateLimiter", () => {
  it("skips when no wallet is present", async () => {
    const store = new MemorySlidingWindowStore();
    const limiter = createWalletRateLimiter(store, "test", 1, 60_000, () => undefined);
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    await limiter(mockRequest(), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("limits by wallet address", async () => {
    const store = new MemorySlidingWindowStore();
    const limiter = createWalletRateLimiter(
      store,
      "test",
      1,
      60_000,
      (req) => req.publisher?.walletAddress,
    );
    const req = mockRequest({
      publisher: { walletAddress: "GWALLET123" } as Request["publisher"],
    });
    const next = vi.fn() as NextFunction;

    await limiter(req, mockResponse(), next);
    expect(next).toHaveBeenCalledOnce();

    const blocked = mockResponse();
    await limiter(req, blocked, vi.fn() as NextFunction);
    expect(blocked.statusCode).toBe(429);
  });
});

describe("rate limiters", () => {
  it("IP limiter returns 429 with canonical shape", async () => {
    const app = express();
    app.use(createIpRateLimiter(1, 1000));
    app.get("/", (req, res) => {
      res.send("ok");
    });

    // First request works
    await request(app).get("/").expect(200);

    // Second request is rate limited
    const res = await request(app).get("/").expect(429);

    expect(res.headers["retry-after"]).toBe("1");
    expect(res.body).toEqual({
      error: "Too many requests",
      code: RATE_LIMITED,
      retryAfterSeconds: 1,
    });
  });

  it("Wallet limiter returns 429 with canonical shape for existing wallet", async () => {
    const app = express();
    const getWallet = (req: Request) => req.headers["x-wallet"] as string | undefined;
    app.use(createWalletRateLimiter(1, 1000, getWallet));
    app.get("/", (req, res) => {
      res.send("ok");
    });

    // Requests without wallet are skipped
    await request(app).get("/").expect(200);
    await request(app).get("/").expect(200);

    // First request with wallet1 works
    await request(app).get("/").set("x-wallet", "wallet1").expect(200);

    // Second request with wallet1 is rate limited
    const res = await request(app).get("/").set("x-wallet", "wallet1").expect(429);
    expect(res.headers["retry-after"]).toBe("1");
    expect(res.body).toEqual({
      error: "Too many requests",
      code: RATE_LIMITED,
      retryAfterSeconds: 1,
    });

    // Request with different wallet is not rate limited
    await request(app).get("/").set("x-wallet", "wallet2").expect(200);
  });
});
