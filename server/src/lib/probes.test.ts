import { describe, it, expect } from "vitest";
import { overallReadinessStatus } from "./readiness.js";

describe("overallReadinessStatus", () => {
  it("returns ok when every dependency is healthy", () => {
    expect(
      overallReadinessStatus({
        database: { status: "ok", latencyMs: 1 },
        sorobanRpc: { status: "ok", latencyMs: 2 },
      }),
    ).toBe("ok");
  });

  it("returns error when any dependency fails", () => {
    expect(
      overallReadinessStatus({
        database: { status: "ok", latencyMs: 1 },
        sorobanRpc: {
          status: "error",
          latencyMs: 2,
          error: "timeout",
        },
      }),
    ).toBe("error");
  });
});
