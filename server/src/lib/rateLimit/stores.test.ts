import { describe, it, expect } from "vitest";
import { MemorySlidingWindowStore } from "./stores.js";

describe("MemorySlidingWindowStore", () => {
  it("allows requests up to the limit within the window", async () => {
    const now = 1_000_000;
    const store = new MemorySlidingWindowStore(() => now);
    const limit = 3;
    const windowMs = 60_000;

    for (let i = 0; i < limit; i++) {
      const result = await store.consume("user:1", limit, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - i - 1);
    }

    const blocked = await store.consume("user:1", limit, windowMs);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("smooths fixed-window boundary bursts", async () => {
    let now = 0;
    const store = new MemorySlidingWindowStore(() => now);
    const limit = 5;
    const windowMs = 60_000;

    // Fill the limit just before a fixed-window rollover (t = 59s).
    now = 59_000;
    for (let i = 0; i < limit; i++) {
      expect((await store.consume("ip:1", limit, windowMs)).allowed).toBe(true);
    }

    // At the next second a fixed window would allow another full burst.
    now = 60_000;
    const blocked = await store.consume("ip:1", limit, windowMs);
    expect(blocked.allowed).toBe(false);

    // Once the oldest events fall out of the sliding window, traffic resumes.
    now = 120_001;
    expect((await store.consume("ip:1", limit, windowMs)).allowed).toBe(true);
  });

  it("tracks keys independently", async () => {
    const store = new MemorySlidingWindowStore();
    const limit = 2;
    const windowMs = 60_000;

    expect((await store.consume("a", limit, windowMs)).allowed).toBe(true);
    expect((await store.consume("a", limit, windowMs)).allowed).toBe(true);
    expect((await store.consume("a", limit, windowMs)).allowed).toBe(false);
    expect((await store.consume("b", limit, windowMs)).allowed).toBe(true);
  });

  it("expires old timestamps as the window slides", async () => {
    let now = 0;
    const store = new MemorySlidingWindowStore(() => now);
    const limit = 2;
    const windowMs = 10_000;

    expect((await store.consume("k", limit, windowMs)).allowed).toBe(true);
    now = 5_000;
    expect((await store.consume("k", limit, windowMs)).allowed).toBe(true);
    expect((await store.consume("k", limit, windowMs)).allowed).toBe(false);

    now = 10_001;
    expect((await store.consume("k", limit, windowMs)).allowed).toBe(true);
  });
});
