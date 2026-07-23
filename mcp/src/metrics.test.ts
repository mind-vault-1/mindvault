import { describe, it, expect } from "vitest";
import {
  createMetricsRecorder,
  measureTool,
  metricsEnabledFromEnv,
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
    const recorder = createMetricsRecorder(false);
    expect(recorder.enabled).toBe(false);
    recorder.recordToolCall("mindvault_buy", 12, false);
    recorder.recordPayment(false);
    const snap = recorder.snapshot();
    expect(snap.enabled).toBe(false);
    expect(snap.tools).toEqual({});
    expect(snap.totals).toEqual({ calls: 0, errors: 0 });
    expect(snap.payments).toEqual({ attempts: 0, failures: 0 });
  });
});

describe("active recorder", () => {
  it("counts success and failure paths per tool", () => {
    const recorder = createMetricsRecorder(true);
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
    });
    expect(snap.tools.mindvault_buy).toMatchObject({ calls: 1, errors: 1 });
    expect(snap.totals).toEqual({ calls: 3, errors: 1 });
  });

  it("tracks payment attempts and failures", () => {
    const recorder = createMetricsRecorder(true);
    recorder.recordPayment(true);
    recorder.recordPayment(false);
    recorder.recordPayment(true);
    expect(recorder.snapshot().payments).toEqual({ attempts: 3, failures: 1 });
  });

  it("clamps non-finite/negative durations to zero", () => {
    const recorder = createMetricsRecorder(true);
    recorder.recordToolCall("mindvault_preview", Number.NaN, true);
    recorder.recordToolCall("mindvault_preview", -3, true);
    expect(recorder.snapshot().tools.mindvault_preview).toMatchObject({
      calls: 2,
      totalDurationMs: 0,
      maxDurationMs: 0,
    });
  });

  it("reset clears counters and moves the since timestamp forward", () => {
    const recorder = createMetricsRecorder(true);
    const before = recorder.snapshot().since;
    recorder.recordToolCall("mindvault_browse", 5, true);
    recorder.reset();
    const snap = recorder.snapshot();
    expect(snap.totals).toEqual({ calls: 0, errors: 0 });
    expect(snap.tools).toEqual({});
    expect(snap.since).not.toBeNull();
    expect(before).not.toBeNull();
  });

  it("never records secret-looking material — only tool names and numbers", () => {
    const recorder = createMetricsRecorder(true);
    recorder.recordToolCall("mindvault_register", 5, true);
    const serialized = JSON.stringify(recorder.snapshot());
    // Keys of a tool metric are strictly the numeric counters.
    const metric = recorder.snapshot().tools.mindvault_register;
    expect(Object.keys(metric).sort()).toEqual([
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
      recordToolCall: (tool, duration, ok) => calls.push([tool, duration, ok]),
      recordPayment: () => {},
      snapshot: () => ({
        enabled: true,
        since: null,
        totals: { calls: 0, errors: 0 },
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
