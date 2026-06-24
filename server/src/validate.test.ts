import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod/v4";
import { validate } from "./middleware/validate.js";
import { publisherRegisterSchema, verifyContentSchema, catalogQuerySchema } from "./schemas/requests.js";

function mockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe("validate middleware", () => {
  it("passes parsed body to the next handler", () => {
    const schema = z.object({ name: z.string() }).strict();
    const req = { body: { name: "MindVault" } } as Request;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: "MindVault" });
  });

  it("returns field-level 400 errors for invalid input", () => {
    const req = { body: { name: "", email: "not-an-email" } } as Request;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    validate(publisherRegisterSchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          _errors: expect.any(Array),
        }),
      }),
    );
  });

  it("rejects unknown fields with strict schemas", () => {
    const req = {
      body: { content: "hello", resourceId: "abc", extra: true },
    } as Request;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    validate(verifyContentSchema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("request schemas", () => {
  it("accepts verify-content payloads", () => {
    expect(verifyContentSchema.safeParse({ content: "sample text" }).success).toBe(true);
  });

  it("rejects empty verify-content payloads", () => {
    expect(verifyContentSchema.safeParse({ content: "" }).success).toBe(false);
  });

  it("accepts supported catalog query params and rejects unsupported ones", () => {
    expect(
      catalogQuerySchema.safeParse({
        search: "alpha",
        minPrice: "0.10",
        maxPrice: "1.00",
        verificationStatus: "verified",
        resourceType: "file",
      }).success,
    ).toBe(true);

    expect(catalogQuerySchema.safeParse({ sort: "newest" } as Record<string, string>).success).toBe(false);
  });
});
