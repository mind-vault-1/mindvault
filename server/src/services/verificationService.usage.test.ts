import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mockCreate } };
  },
}));

vi.mock("../config.js", () => ({
  config: {
    OPENROUTER_API_KEY: "test-key",
    OPENROUTER_MODEL: "anthropic/claude-sonnet-4",
    VERIFICATION_PROMPT_COST_PER_1M: 3,
    VERIFICATION_COMPLETION_COST_PER_1M: 15,
  },
}));

const { checkOriginality, estimateCostUsd } = await import("./verificationService.js");

describe("estimateCostUsd", () => {
  it("prices prompt and completion tokens independently", () => {
    // 1M prompt @ $3 + 1M completion @ $15 = $18
    expect(estimateCostUsd(1_000_000, 1_000_000)).toBe(18);
  });

  it("is zero when no tokens were used", () => {
    expect(estimateCostUsd(0, 0)).toBe(0);
  });
});

describe("checkOriginality token usage", () => {
  beforeEach(() => mockCreate.mockReset());

  it("returns token usage and estimated cost from the model response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"is_original":true,"confidence":0.9,"flags":[]}' } }],
      usage: { prompt_tokens: 500_000, completion_tokens: 100_000, total_tokens: 600_000 },
    });

    const result = await checkOriginality("a real dataset listing", "text");

    expect(result.isOriginal).toBe(true);
    expect(result.usage.promptTokens).toBe(500_000);
    expect(result.usage.completionTokens).toBe(100_000);
    expect(result.usage.totalTokens).toBe(600_000);
    // 0.5M @ $3 + 0.1M @ $15 = $1.5 + $1.5 = $3
    expect(result.usage.estimatedCostUsd).toBe(3);
  });

  it("still reports usage when the response is unparseable", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "not json" } }],
      usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
    });

    const result = await checkOriginality("x", "text");

    expect(result.isOriginal).toBe(false);
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.totalTokens).toBe(10);
  });

  it("defaults usage to zero when the model omits usage data", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"is_original":true,"confidence":1,"flags":[]}' } }],
    });

    const result = await checkOriginality("x", "text");

    expect(result.usage.totalTokens).toBe(0);
    expect(result.usage.estimatedCostUsd).toBe(0);
  });
});
