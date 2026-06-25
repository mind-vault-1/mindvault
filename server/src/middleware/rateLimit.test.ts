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

function mockRequest(headers: Record<string, string>): Request {
  return { headers } as Request;
}

describe("extractPayerFromPaymentHeader", () => {
  it("returns undefined when the header is missing", () => {
    expect(extractPayerFromPaymentHeader(mockRequest({}))).toBeUndefined();
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
    expect(extractPayerFromPaymentHeader(mockRequest({ "x-payment": header }))).toBe(
      "GABC123EXAMPLEADDRESS",
    );
  });

  it("falls back to clientAddress when authorization is absent", () => {
    const payload = { clientAddress: "GCLIENT123EXAMPLEADDRESS" };
    const header = Buffer.from(JSON.stringify(payload)).toString("base64");
    expect(extractPayerFromPaymentHeader(mockRequest({ "x-payment": header }))).toBe(
      "GCLIENT123EXAMPLEADDRESS",
    );
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
