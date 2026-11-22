import { describe, expect, it, vi } from "vitest";
import { runWithRetryBudget, withRetry } from "./retry.js";

const options = { label: "read", policy: { attempts: 3, baseDelayMs: 0, maxDelayMs: 0 } };

describe("tool retry budget", () => {
  it("shares retries between reads, preserves first attempts and isolates concurrent calls", async () => {
    const transient = new Error("fetch failed");
    const request = () =>
      vi.fn<() => Promise<number>>().mockRejectedValueOnce(transient).mockResolvedValueOnce(200);
    const [firstRead, secondRead, otherToolRead] = [request(), request(), request()];
    await Promise.all([
      runWithRetryBudget(1, async () => {
        await expect(withRetry(firstRead, options)).resolves.toBe(200);
        await expect(withRetry(secondRead, options)).rejects.toBe(transient);
      }),
      runWithRetryBudget(1, () => expect(withRetry(otherToolRead, options)).resolves.toBe(200)),
    ]);
    expect([firstRead, secondRead, otherToolRead].map((read) => read.mock.calls.length)).toEqual([
      2, 1, 2,
    ]);
  });

  it("returns the final HTTP result unchanged and keeps the per-request ceiling", async () => {
    const unavailable = { status: 503 };
    const read = vi.fn(async () => unavailable);
    await expect(
      runWithRetryBudget(10, () =>
        withRetry(read, {
          ...options,
          shouldRetryResult: () => true,
        }),
      ),
    ).resolves.toBe(unavailable);
    expect(read).toHaveBeenCalledTimes(3);
    await expect(
      runWithRetryBudget(0, () =>
        withRetry(read, {
          ...options,
          shouldRetryResult: () => true,
        }),
      ),
    ).resolves.toBe(unavailable);
    expect(read).toHaveBeenCalledTimes(4);
  });
});
