import { describe, expect, it, vi } from "vitest";
import { watchPendingTransaction } from "./transactionWatcher.js";

describe("watchPendingTransaction", () => {
  it("orders progress monotonically and emits terminal once", async () => {
    const statuses = ["NOT_FOUND", "PENDING", "SUCCESS"];
    const events: string[] = [];
    const result = await watchPendingTransaction({
      fetch: async () => ({ status: statuses.shift() ?? "SUCCESS" }),
      isTerminal: (snapshot) => snapshot.status === "SUCCESS",
      timeoutMs: 100,
      intervalMs: 1,
      sleep: async () => {},
      onProgress: (event) => events.push(`${event.kind}:${event.progress}`),
    });
    expect(result.snapshot.status).toBe("SUCCESS");
    expect(events).toEqual(["progress:1", "progress:2", "terminal:3"]);
  });

  it("releases a subscription on cancellation", async () => {
    const controller = new AbortController();
    const unsubscribe = vi.fn();
    const result = await watchPendingTransaction({
      fetch: async () => ({ status: "PENDING" }),
      isTerminal: () => false,
      timeoutMs: 100,
      intervalMs: 1,
      sleep: async () => controller.abort(),
      signal: controller.signal,
      subscribe: () => unsubscribe,
    });
    expect(result.cancelled).toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
