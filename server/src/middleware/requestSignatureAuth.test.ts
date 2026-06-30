import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../config.js", () => ({
  config: {
    REQUIRE_REQUEST_SIGNATURE: true,
    SIGNATURE_MAX_SKEW_MS: 300_000,
  },
}));

import { requestSignatureAuth } from "./requestSignatureAuth.js";
import {
  EMPTY_BODY_HASH,
  hashRequestBody,
  signPublisherRequest,
} from "../utils/requestSignature.js";

function mockResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe("requestSignatureAuth", () => {
  const secret = "mv_test_secret";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = "/resources/res-1/register";
  const rawBody = JSON.stringify({ signedXdr: "AAAA" });
  const bodyHash = hashRequestBody(rawBody);
  const signature = signPublisherRequest({
    secret,
    method: "POST",
    path,
    timestamp,
    bodyHash,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Number(timestamp) * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a valid signed request", () => {
    const req = {
      method: "POST",
      originalUrl: path,
      headers: {
        "x-api-key": secret,
        "x-timestamp": timestamp,
        "x-signature": signature,
      },
      rawBody: Buffer.from(rawBody, "utf8"),
    } as unknown as Request;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    requestSignatureAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a stale timestamp", () => {
    vi.setSystemTime(new Date(Number(timestamp) * 1000 + 600_000));
    const req = {
      method: "POST",
      originalUrl: path,
      headers: {
        "x-api-key": secret,
        "x-timestamp": timestamp,
        "x-signature": signature,
      },
      rawBody: Buffer.from(rawBody, "utf8"),
    } as unknown as Request;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    requestSignatureAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Request timestamp outside allowed window" });
  });

  it("rejects a tampered body", () => {
    const req = {
      method: "POST",
      originalUrl: path,
      headers: {
        "x-api-key": secret,
        "x-timestamp": timestamp,
        "x-signature": signature,
      },
      rawBody: Buffer.from(JSON.stringify({ signedXdr: "BBBB" }), "utf8"),
    } as unknown as Request;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    requestSignatureAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid request signature" });
  });

  it("accepts DELETE with empty body hash", () => {
    const deletePath = "/resources/res-1";
    const deleteSignature = signPublisherRequest({
      secret,
      method: "DELETE",
      path: deletePath,
      timestamp,
      bodyHash: EMPTY_BODY_HASH,
    });
    const req = {
      method: "DELETE",
      originalUrl: deletePath,
      headers: {
        "x-api-key": secret,
        "x-timestamp": timestamp,
        "x-signature": deleteSignature,
      },
    } as unknown as Request;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    requestSignatureAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("requestSignatureAuth disabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("is a no-op when REQUIRE_REQUEST_SIGNATURE is false", async () => {
    vi.doMock("../config.js", () => ({
      config: {
        REQUIRE_REQUEST_SIGNATURE: false,
        SIGNATURE_MAX_SKEW_MS: 300_000,
      },
    }));
    const { requestSignatureAuth: disabledAuth } = await import("./requestSignatureAuth.js");
    const req = { method: "POST", originalUrl: "/resources", headers: {} } as unknown as Request;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    disabledAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
