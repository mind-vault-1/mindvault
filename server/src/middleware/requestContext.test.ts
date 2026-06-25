import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requestContextMiddleware } from "./requestContext.js";
import { getLogger, getRequestId } from "../lib/logger.js";

function createResponse() {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    setHeader: vi.fn(),
    statusCode: 200,
    on: vi.fn((event: string, fn: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(fn);
    }),
    emit: (event: string) => {
      for (const fn of listeners[event] ?? []) fn();
    },
  };
  return res;
}

describe("requestContextMiddleware", () => {
  it("propagates an incoming x-request-id and echoes it on the response", () => {
    const req = {
      method: "GET",
      originalUrl: "/health",
      url: "/health",
      headers: { "x-request-id": "client-req-123" },
    };
    const res = createResponse();
    const next = vi.fn(() => {
      expect(getRequestId()).toBe("client-req-123");
      expect(getLogger().bindings()).toMatchObject({ requestId: "client-req-123" });
    });

    requestContextMiddleware(req as unknown as Request, res as unknown as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith("x-request-id", "client-req-123");
    expect(next).toHaveBeenCalled();
  });

  it("generates a request id when the header is missing", () => {
    const req = {
      method: "POST",
      originalUrl: "/resources",
      url: "/resources",
      headers: {},
    };
    const res = createResponse();
    let generated = "";
    const next = vi.fn(() => {
      generated = String(vi.mocked(res.setHeader).mock.calls[0]?.[1] ?? "");
      expect(getRequestId()).toBe(generated);
    });

    requestContextMiddleware(req as unknown as Request, res as unknown as Response, next);
    expect(typeof generated).toBe("string");
    expect(generated.length).toBeGreaterThan(0);
    expect(next).toHaveBeenCalled();
  });
});
