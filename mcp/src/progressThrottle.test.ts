import { describe, expect, it, vi } from "vitest";
import {
  createProgressEmitter,
  DEFAULT_PROGRESS_MIN_INTERVAL_MS,
  PROGRESS_MIN_INTERVAL_ENV,
  progressEventOf,
  resolveProgressMinIntervalMs,
  scopeProgressToRequest,
  sequenceProgressNotifications,
  throttleProgressEmitter,
  type SendNotification,
} from "./progress.js";

describe("resolveProgressMinIntervalMs", () => {
  it("returns default when env var is unset or empty", () => {
    expect(resolveProgressMinIntervalMs({})).toBe(DEFAULT_PROGRESS_MIN_INTERVAL_MS);
    expect(resolveProgressMinIntervalMs({ [PROGRESS_MIN_INTERVAL_ENV]: "  " })).toBe(
      DEFAULT_PROGRESS_MIN_INTERVAL_MS,
    );
  });

  it("parses valid non-negative integers including 0 to disable throttling", () => {
    expect(resolveProgressMinIntervalMs({ [PROGRESS_MIN_INTERVAL_ENV]: "0" })).toBe(0);
    expect(resolveProgressMinIntervalMs({ [PROGRESS_MIN_INTERVAL_ENV]: "100" })).toBe(100);
    expect(resolveProgressMinIntervalMs({ [PROGRESS_MIN_INTERVAL_ENV]: "500.9" })).toBe(500);
  });

  it("falls back to default for negative or non-numeric values", () => {
    expect(resolveProgressMinIntervalMs({ [PROGRESS_MIN_INTERVAL_ENV]: "-10" })).toBe(
      DEFAULT_PROGRESS_MIN_INTERVAL_MS,
    );
    expect(resolveProgressMinIntervalMs({ [PROGRESS_MIN_INTERVAL_ENV]: "fast" })).toBe(
      DEFAULT_PROGRESS_MIN_INTERVAL_MS,
    );
  });
});

describe("throttleProgressEmitter", () => {
  it("coalesces rapid non-terminal updates within minIntervalMs and preserves ordering", async () => {
    let clock = 1000;
    const sent: Array<{ progress: number; total?: number; message?: string }> = [];
    const throttled = throttleProgressEmitter(
      async (progress, total, message) => {
        sent.push({ progress, total, message });
      },
      { minIntervalMs: 250, now: () => clock },
    );

    await throttled.emit(1, 10, "poll 1"); // t=1000 -> sent (leading edge)
    clock = 1050;
    await throttled.emit(2, 10, "poll 2"); // t=1050 -> coalesced
    clock = 1100;
    await throttled.emit(3, 10, "poll 3"); // t=1100 -> coalesced (replaces 2)
    clock = 1249;
    await throttled.emit(4, 10, "poll 4"); // t=1249 -> coalesced (replaces 3)

    expect(sent).toEqual([{ progress: 1, total: 10, message: "poll 1" }]);

    clock = 1250;
    await throttled.emit(5, 10, "poll 5"); // t=1250 -> sent (interval elapsed)

    expect(sent).toEqual([
      { progress: 1, total: 10, message: "poll 1" },
      { progress: 5, total: 10, message: "poll 5" },
    ]);
  });

  it("always delivers terminal updates (progress >= total) immediately even within minIntervalMs", async () => {
    let clock = 0;
    const sent: Array<{ progress: number; total?: number; message?: string }> = [];
    const throttled = throttleProgressEmitter(
      async (progress, total, message) => {
        sent.push({ progress, total, message });
      },
      { minIntervalMs: 250, now: () => clock },
    );

    await throttled.emit(1, 5, "start");
    clock = 10;
    await throttled.emit(2, 5, "step 2");
    clock = 20;
    await throttled.emit(3, 5, "step 3");
    clock = 30;
    await throttled.emit(5, 5, "complete");

    expect(sent).toEqual([
      { progress: 1, total: 5, message: "start" },
      { progress: 5, total: 5, message: "complete" },
    ]);

    // Flushing after a terminal update does not replay any stale pending update.
    await throttled.flush();
    expect(sent).toHaveLength(2);
  });

  it("flushes the latest coalesced update on settle when no explicit terminal update was sent", async () => {
    let clock = 0;
    const sent: Array<{ progress: number; total?: number; message?: string }> = [];
    const throttled = throttleProgressEmitter(
      async (progress, total, message) => {
        sent.push({ progress, total, message });
      },
      { minIntervalMs: 250, now: () => clock },
    );
    const scoped = scopeProgressToRequest(throttled.emit, { flush: throttled.flush });

    await scoped.emit(1, undefined, "poll 1");
    clock = 15;
    await scoped.emit(2, undefined, "poll 2");
    clock = 30;
    await scoped.emit(3, undefined, "poll 3");

    expect(sent).toEqual([{ progress: 1, total: undefined, message: "poll 1" }]);

    await scoped.settle();

    expect(sent).toEqual([
      { progress: 1, total: undefined, message: "poll 1" },
      { progress: 3, total: undefined, message: "poll 3" },
    ]);

    // Post-settle emits are still dropped.
    clock = 500;
    await scoped.emit(4, undefined, "late");
    expect(sent).toHaveLength(2);
  });

  it("produces gap-free, strictly increasing sequences when composed with sequenceProgressNotifications", async () => {
    let clock = 0;
    const notifications: Array<{ method: string; params: Record<string, unknown> }> = [];
    const send: SendNotification = vi.fn(async (n) => {
      notifications.push(n as { method: string; params: Record<string, unknown> });
    });

    const throttled = throttleProgressEmitter(
      createProgressEmitter({
        token: "fast-poll",
        send: sequenceProgressNotifications(send, "stream-fast"),
      }),
      { minIntervalMs: 200, now: () => clock },
    );

    for (let i = 1; i <= 10; i += 1) {
      clock = (i - 1) * 20; // 0ms .. 180ms total
      await throttled.emit(i, 10, `step ${i}`);
    }

    // Only leading (1) and terminal (10) should be sent within 180ms (< 200ms).
    expect(notifications.map((n) => n.params.progress)).toEqual([1, 10]);
    expect(notifications.map((n) => progressEventOf(n.params)?.sequence)).toEqual([1, 2]);
  });

  it("disables throttling when minIntervalMs is 0", async () => {
    const sent: number[] = [];
    const throttled = throttleProgressEmitter(
      async (progress) => {
        sent.push(progress);
      },
      { minIntervalMs: 0, now: () => 0 },
    );

    await throttled.emit(1, 3);
    await throttled.emit(2, 3);
    await throttled.emit(3, 3);

    expect(sent).toEqual([1, 2, 3]);
  });
});
