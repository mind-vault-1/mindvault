import { describe, it, expect } from "vitest";
import { truncateResponse, DEFAULT_RESPONSE_BUDGET_BYTES } from "./truncation.js";

describe("truncateResponse", () => {
  it("returns text unchanged when under budget", () => {
    const text = "Hello, world!";
    expect(truncateResponse(text)).toBe(text);
  });

  it("truncates text exceeding the budget", () => {
    const text = "A".repeat(1000);
    const result = truncateResponse(text, 200);

    expect(result.length).toBeLessThan(text.length);
    expect(result).toContain("[Truncated");
  });

  it("never splits a multi-byte character", () => {
    // Each emoji is 4 bytes in UTF-8
    const emoji = "🎉";
    const text = emoji.repeat(100); // 400 bytes
    const result = truncateResponse(text, 100);

    // Should not contain any replacement characters
    expect(result).not.toContain("�");
    expect(result).toContain("[Truncated");
  });

  it("handles CJK characters without splitting", () => {
    // Each CJK char is 3 bytes
    const text = "你好世界".repeat(100); // 1200 bytes
    const result = truncateResponse(text, 100);

    expect(result).not.toContain("�");
    expect(result).toContain("[Truncated");
  });

  it("returns original text when exactly at budget", () => {
    const text = "A".repeat(100);
    const result = truncateResponse(text, 100);
    expect(result).toBe(text);
  });

  it("uses default budget of 32 KiB", () => {
    expect(DEFAULT_RESPONSE_BUDGET_BYTES).toBe(32 * 1024);
  });

  it("handles empty string", () => {
    expect(truncateResponse("")).toBe("");
  });

  it("appends notice explaining how to fetch rest", () => {
    const text = "X".repeat(1000);
    const result = truncateResponse(text, 200);
    expect(result).toContain("Use limit/offset pagination");
  });
});
