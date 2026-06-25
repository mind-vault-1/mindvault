import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseAllowedOrigins, X402_ALLOWED_HEADERS, X402_EXPOSED_HEADERS } from "./cors.js";

vi.mock("./config.js", () => ({
  config: {
    NODE_ENV: "production",
    WEB_APP_URL: "https://app.example.com",
    ALLOWED_ORIGINS: undefined,
  },
}));

describe("parseAllowedOrigins", () => {
  it("splits a comma-separated list", () => {
    expect(
      parseAllowedOrigins("https://app.example.com, http://localhost:5173", "fallback"),
    ).toEqual(["https://app.example.com", "http://localhost:5173"]);
  });

  it("falls back when unset or blank", () => {
    expect(parseAllowedOrigins(undefined, "https://app.example.com")).toEqual([
      "https://app.example.com",
    ]);
    expect(parseAllowedOrigins("  ", "https://app.example.com")).toEqual([
      "https://app.example.com",
    ]);
  });
});

describe("createCorsOptions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses explicit x402 headers in production", async () => {
    const { createCorsOptions } = await import("./cors.js");
    const options = createCorsOptions();
    expect(options.allowedHeaders).toEqual([...X402_ALLOWED_HEADERS]);
    expect(options.exposedHeaders).toEqual([...X402_EXPOSED_HEADERS]);
  });

  it("rejects unlisted origins in production", async () => {
    const { createCorsOptions } = await import("./cors.js");
    const options = createCorsOptions();
    const origin = options.origin as (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => void;

    await new Promise<void>((resolve) => {
      origin("https://app.example.com", (err, allow) => {
        expect(err).toBeNull();
        expect(allow).toBe(true);
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      origin("https://evil.example.com", (err) => {
        expect(err).toBeInstanceOf(Error);
        resolve();
      });
    });
  });
});
