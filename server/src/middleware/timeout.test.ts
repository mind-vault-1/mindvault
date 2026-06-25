import type { Request, Response } from "express";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestTimeout } from "./timeout.js";

// Minimal res mock that records status/json and lets us fire lifecycle events.
function createResponse(headersSent = false) {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    headersSent,
    statusCode: 200,
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, fn: () => void) => {
      (listeners[event] ??= []).push(fn);
      return res;
    }),
    emit: (event: string) => {
      for (const fn of listeners[event] ?? []) fn();
    },
  };
  return res as unknown as Response & { emit: (e: string) => void };
}

const req = { method: "GET", originalUrl: "/slow", url: "/slow" } as Request;

describe("requestTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("responds 503 when the request exceeds the timeout", () => {
    const res = createResponse();
    const next = vi.fn();

    requestTimeout(1000)(req, res, next);
    expect(next).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(1000);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: "Request timeout" });
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "1");
  });

  it("does not fire after the response finishes", () => {
    const res = createResponse();
    const next = vi.fn();

    requestTimeout(1000)(req, res, next);
    res.emit("finish"); // request completed before the timeout
    vi.advanceTimersByTime(2000);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("does not rewrite a response whose headers were already sent", () => {
    const res = createResponse(true);
    const next = vi.fn();

    requestTimeout(1000)(req, res, next);
    vi.advanceTimersByTime(1000);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
