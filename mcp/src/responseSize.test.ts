import { describe, expect, it } from "vitest";
import {
  MAX_MAX_RESPONSE_BYTES,
  MIN_MAX_RESPONSE_BYTES,
  ResponseSizeLimitError,
  readBoundedResponse,
  resolveMaxResponseBytes,
} from "./responseSize.js";

describe("response size limits", () => {
  it("accepts both configured boundaries", () => {
    expect(resolveMaxResponseBytes(String(MIN_MAX_RESPONSE_BYTES))).toBe(MIN_MAX_RESPONSE_BYTES);
    expect(resolveMaxResponseBytes(String(MAX_MAX_RESPONSE_BYTES))).toBe(MAX_MAX_RESPONSE_BYTES);
  });

  it("rejects unsafe configuration", () => {
    expect(() => resolveMaxResponseBytes("100")).toThrow("must be an integer");
    expect(() => resolveMaxResponseBytes(String(MAX_MAX_RESPONSE_BYTES + 1))).toThrow(
      "must be an integer",
    );
  });

  it("throws a typed error for declared and actual oversized bodies", async () => {
    await expect(
      readBoundedResponse(new Response("small", { headers: { "content-length": "99" } }), 5),
    ).rejects.toBeInstanceOf(ResponseSizeLimitError);
    await expect(readBoundedResponse(new Response("six!!!"), 5)).rejects.toMatchObject({
      code: "RESPONSE_SIZE_LIMIT_EXCEEDED",
      actualBytes: 6,
      maxBytes: 5,
    });
  });

  it("measures UTF-8 bytes instead of JavaScript characters", async () => {
    await expect(readBoundedResponse(new Response("é"), 2)).resolves.toBe("é");
    await expect(readBoundedResponse(new Response("é"), 1)).rejects.toBeInstanceOf(
      ResponseSizeLimitError,
    );
  });
});
