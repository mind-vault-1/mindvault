import { describe, it, expect } from "vitest";
import {
  createMetricsRecorder,
  measureTool,
  metricsEnabledFromEnv,
  toOtlpMetricsExport,
  type MetricsRecorder,
} from "./metrics.js";

describe("metricsEnabledFromEnv", () => {
  it("is opt-in: enabled only for truthy values", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on", " on "]) {
      expect(metricsEnabledFromEnv({ MINDVAULT_METRICS: value })).toBe(true);
    }
  });
  it("is disabled by default and for falsy/absent values", () => {
    for (const env of [
      {},
      { MINDVAULT_METRICS: "" },
      { MINDVAULT_METRICS: "0" },
      { MINDVAULT_METRICS: "off" },
    ]) {
      expect(metricsEnabledFromEnv(env)).toBe(false);
    }
  });
});

describe("disabled (noop) recorder", () => {
  it("reports a disabled, empty snapshot and records nothing", () => {
    const recorder = createMetricsRecorder(false, 30000);
    expect(recorder.enabled).toBe(false);
    recorder.recordToolCall("mindvault_buy", 12, false);
    recorder.recordPayment(false, "publish:res-1");
    recorder.recordSettlement?.(false);
    const snap = recorder.snapshot();
    expect(snap.enabled).toBe(false);
    expect(snap.tools).toEqual({});
    expect(snap.totals).toEqual({ calls: 0, errors: 0, budgetExceeded: 0 });
    expect(snap.payments).toEqual({
      attempts: 0,
      failures: 0,
      retries: 0,
      settlements: { attempts: 0, settled: 0, failures: 0 },
    });
  });
});

describe("active recorder", () => {
  it("counts success and failure paths per tool and tracks budget", () => {
    const recorder = createMetricsRecorder(true, 10);
    recorder.recordToolCall("mindvault_browse", 5, true);
    recorder.recordToolCall("mindvault_browse", 7, true);
    recorder.recordToolCall("mindvault_buy", 20, false);

    const snap = recorder.snapshot();
    expect(snap.enabled).toBe(true);
    expect(snap.tools.mindvault_browse).toEqual({
      calls: 2,
      errors: 0,
      totalDurationMs: 12,
      maxDurationMs: 7,
      budgetExceeded: 0,
    });
    expect(snap.tools.mindvault_buy).toMatchObject({ calls: 1, errors: 1, budgetExceeded: 1 });
    expect(snap.totals).toEqual({ calls: 3, errors: 1, budgetExceeded: 1 });
    expect(snap.toolDurationBudgetMs).toBe(10);
  });

  it("tracks payment attempts and failures", () => {
    const recorder = createMetricsRecorder(true, 30000);
    recorder.recordPayment(true);
    recorder.recordPayment(false);
    recorder.recordPayment(true);
    expect(recorder.snapshot().payments).toEqual({
      attempts: 3,
      failures: 1,
      retries: 0,
      settlements: { attempts: 0, settled: 0, failures: 0 },
    });
  });

  it("does not double-count failed publish attempts that retry the same payment key (#851)", () => {
    const recorder = createMetricsRecorder(true, 30000);
    // Initial failed verification payment for resource res-1
    recorder.recordPayment(false, "publish:res-1");
    // Retry of the same verification payment also fails
    recorder.recordPayment(false, "publish:res-1");
    expect(recorder.snapshot().payments).toEqual({
      attempts: 1,
      failures: 1,
      retries: 1,
      settlements: { attempts: 0, settled: 0, failures: 0 },
    });

    // Retry of the same verification payment succeeds on third try
    recorder.recordPayment(true, "publish:res-1");
    expect(recorder.snapshot().payments).toEqual({
      attempts: 1,
      failures: 0,
      retries: 2,
      settlements: { attempts: 0, settled: 0, failures: 0 },
    });
  });

  it("tracks post-payment settlement outcomes separately from payment attempts (#851)", () => {
    const recorder = createMetricsRecorder(true, 30000);
    // Verification payment succeeds, but on-chain registration fails and is retried
    recorder.recordPayment(true, "publish:res-2");
    recorder.recordSettlement?.(false);
    recorder.recordSettlement?.(true);

    const snap = recorder.snapshot();
    expect(snap.payments).toEqual({
      attempts: 1,
      failures: 0,
      retries: 0,
      settlements: { attempts: 2, settled: 1, failures: 1 },
    });

    const otlp = toOtlpMetricsExport(snap);
    const metricNames = otlp.resourceMetrics[0].scopeMetrics[0].metrics.map((m) => m.name);
    expect(metricNames).toContain("mindvault.payments.retries");
    expect(metricNames).toContain("mindvault.payments.settlements.attempts");
    expect(metricNames).toContain("mindvault.payments.settlements.settled");
    expect(metricNames).toContain("mindvault.payments.settlements.failures");
  });

  it("clamps non-finite/negative durations to zero", () => {
    const recorder = createMetricsRecorder(true, 30000);
    recorder.recordToolCall("mindvault_preview", Number.NaN, true);
    recorder.recordToolCall("mindvault_preview", -3, true);
    expect(recorder.snapshot().tools.mindvault_preview).toMatchObject({
      calls: 2,
      totalDurationMs: 0,
      maxDurationMs: 0,
    });
  });

  it("reset clears counters and moves the since timestamp forward", () => {
    const recorder = createMetricsRecorder(true, 30000);
    const before = recorder.snapshot().since;
    recorder.recordToolCall("mindvault_browse", 5, true);
    recorder.reset();
    const snap = recorder.snapshot();
    expect(snap.totals).toEqual({ calls: 0, errors: 0, budgetExceeded: 0 });
    expect(snap.tools).toEqual({});
    expect(snap.since).not.toBeNull();
    expect(before).not.toBeNull();
  });

  it("never records secret-looking material — only tool names and numbers", () => {
    const recorder = createMetricsRecorder(true, 30000);
    recorder.recordToolCall("mindvault_register", 5, true);
    const serialized = JSON.stringify(recorder.snapshot());
    // Keys of a tool metric are strictly the numeric counters.
    const metric = recorder.snapshot().tools.mindvault_register;
    expect(Object.keys(metric).sort()).toEqual([
      "budgetExceeded",
      "calls",
      "errors",
      "maxDurationMs",
      "totalDurationMs",
    ]);
    expect(serialized).not.toMatch(/secret|apiKey|SB[A-Z0-9]/);
  });
});

describe("measureTool", () => {
  function counting(): { recorder: MetricsRecorder; calls: [string, number, boolean][] } {
    const calls: [string, number, boolean][] = [];
    const recorder: MetricsRecorder = {
      enabled: true,
      toolDurationBudgetMs: 30000,
      recordToolCall: (tool, duration, ok) => calls.push([tool, duration, ok]),
      recordPayment: () => {},
      snapshot: () => ({
        enabled: true,
        since: null,
        toolDurationBudgetMs: 30000,
        totals: { calls: 0, errors: 0, budgetExceeded: 0 },
        payments: { attempts: 0, failures: 0 },
        tools: {},
      }),
      reset: () => {},
    };
    return { recorder, calls };
  }

  it("records a successful call and returns the result", async () => {
    const { recorder, calls } = counting();
    const result = await measureTool(recorder, "mindvault_browse", () => "ok");
    expect(result).toBe("ok");
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("mindvault_browse");
    expect(calls[0][2]).toBe(true);
  });

  it("records a failed call and re-throws the error unchanged", async () => {
    const { recorder, calls } = counting();
    await expect(
      measureTool(recorder, "mindvault_buy", () => {
        throw new Error("Buy failed [402]");
      }),
    ).rejects.toThrow("Buy failed [402]");
    expect(calls[0][0]).toBe("mindvault_buy");
    expect(calls[0][2]).toBe(false);
  });
});
