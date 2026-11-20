/**
 * Shared per-origin rate-limit coordination (#1069).
 *
 * The coordinator is pure and injectable (`now`, `sleep`), so shared backoff is
 * exercised without real waiting. The tests pin the properties that keep
 * coordination safe: a bounded wait, independence between origins, forward-only
 * deadlines, and prompt cancellation.
 */
import { describe, it, expect } from "vitest";

import {
  DEFAULT_RATE_LIMIT_MAX_DELAY_MS,
  RateLimitCoordinator,
  createRateLimitCoordinator,
  requestOrigin,
} from "./rateLimitCoordinator.js";

/** A coordinator whose clock only advances when `sleep` is called. */
function fakeCoordinator(options: { maxDelayMs?: number } = {}) {
  let clock = 0;
  const sleeps: number[] = [];
  const coordinator = new RateLimitCoordinator({
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    ...options,
  });
  return {
    coordinator,
    sleeps,
    now: () => clock,
  };
}

describe("requestOrigin", () => {
  it("returns the scheme, host, and port", () => {
    expect(requestOrigin("https://api.example.com/resources?x=1")).toBe("https://api.example.com");
    expect(requestOrigin("http://localhost:4021/x")).toBe("http://localhost:4021");
    expect(requestOrigin(new URL("https://api.example.com/a/b"))).toBe("https://api.example.com");
  });

  it("returns null for something that is not a URL", () => {
    expect(requestOrigin("not a url")).toBeNull();
  });
});

describe("RateLimitCoordinator — recording", () => {
  it("records nothing for a 429 without a Retry-After delay", () => {
    const { coordinator } = fakeCoordinator();
    expect(coordinator.noteRateLimit("https://api.example.com/x", null)).toBe(0);
    expect(coordinator.remainingMs("https://api.example.com")).toBe(0);
  });

  it("records a bounded shared deadline", () => {
    const { coordinator } = fakeCoordinator();
    const remaining = coordinator.noteRateLimit("https://api.example.com/x", 500);
    expect(remaining).toBe(500);

    expect(coordinator.remainingMs("https://api.example.com")).toBe(500);
    expect(coordinator.backoffUntil("https://api.example.com")).toBe(500);
  });

  it("clamps a hostile Retry-After to the ceiling", () => {
    const { coordinator } = fakeCoordinator({ maxDelayMs: 1000 });
    const remaining = coordinator.noteRateLimit("https://api.example.com", 999_999_999);
    expect(remaining).toBe(1000);
    expect(remaining).toBeLessThanOrEqual(1000);
  });

  it("only ever moves the deadline forward", () => {
    const { coordinator } = fakeCoordinator();
    coordinator.noteRateLimit("https://api.example.com", 2000);
    // A second, shorter 429 must not shorten the shared wait.
    coordinator.noteRateLimit("https://api.example.com", 500);
    expect(coordinator.remainingMs("https://api.example.com")).toBe(2000);
  });

  it("records nothing for a non-URL input", () => {
    const { coordinator } = fakeCoordinator();
    expect(coordinator.noteRateLimit("not a url", 500)).toBe(0);
    expect(coordinator.backoffUntil("not a url")).toBe(0);
  });

  it("defaults the ceiling to 60s", () => {
    expect(DEFAULT_RATE_LIMIT_MAX_DELAY_MS).toBe(60_000);
  });
});

describe("RateLimitCoordinator.acquire", () => {
  it("resolves immediately for an unthrottled origin", async () => {
    const { coordinator, sleeps } = fakeCoordinator();
    await coordinator.acquire("https://api.example.com");
    expect(sleeps).toEqual([]);
  });

  it("waits out the shared backoff", async () => {
    const { coordinator, sleeps, now } = fakeCoordinator();
    coordinator.noteRateLimit("https://api.example.com", 400);
    await coordinator.acquire("https://api.example.com");
    expect(sleeps).toEqual([400]);
    expect(now()).toBe(400);
    expect(coordinator.remainingMs("https://api.example.com")).toBe(0);
  });

  it("holds parallel calls to the same origin for the shared backoff", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const coordinator = new RateLimitCoordinator({
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        // Hold both callers at the same point so neither advances the clock
        // before the other has observed the shared deadline.
        await gate;
        clock += ms;
      },
    });
    coordinator.noteRateLimit("https://api.example.com/x", 300);

    const first = coordinator.acquire("https://api.example.com/a");
    const second = coordinator.acquire("https://api.example.com/b");
    // Both callers observed the same recorded delay rather than retrying into
    // the server's window independently.
    expect(sleeps).toEqual([300, 300]);

    release();
    await Promise.all([first, second]);
    expect(coordinator.remainingMs("https://api.example.com")).toBe(0);
  });

  it("never blocks an unrelated origin", async () => {
    const { coordinator, sleeps } = fakeCoordinator();
    coordinator.noteRateLimit("https://a.example.com", 5000);
    await coordinator.acquire("https://b.example.com");
    expect(sleeps).toEqual([]);
    expect(coordinator.remainingMs("https://a.example.com")).toBe(5000);
  });

  it("rejects promptly when the caller cancels", async () => {
    const { coordinator } = fakeCoordinator();
    coordinator.noteRateLimit("https://api.example.com", 5000);
    const controller = new AbortController();
    controller.abort();

    await expect(
      coordinator.acquire("https://api.example.com", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("RateLimitCoordinator.clear", () => {
  it("drops one origin without touching the others", () => {
    const { coordinator } = fakeCoordinator();
    coordinator.noteRateLimit("https://a.example.com", 1000);
    coordinator.noteRateLimit("https://b.example.com", 1000);
    coordinator.clear("https://a.example.com");
    expect(coordinator.remainingMs("https://a.example.com")).toBe(0);
    expect(coordinator.remainingMs("https://b.example.com")).toBe(1000);
  });

  it("drops every origin when called without an argument", () => {
    const { coordinator } = fakeCoordinator();
    coordinator.noteRateLimit("https://a.example.com", 1000);
    coordinator.noteRateLimit("https://b.example.com", 1000);
    coordinator.clear();
    expect(coordinator.remainingMs("https://a.example.com")).toBe(0);
    expect(coordinator.remainingMs("https://b.example.com")).toBe(0);
  });
});

describe("createRateLimitCoordinator", () => {
  it("createRateLimitCoordinator returns a working coordinator", () => {
    const coordinator = createRateLimitCoordinator({
      now: () => 0,
      sleep: async () => undefined,
    });
    expect(requestOrigin("https://api.example.com/x")).toBe("https://api.example.com");
    expect(coordinator.remainingMs("https://api.example.com")).toBe(0);
  });
});
