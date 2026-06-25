import { describe, it, expect } from "vitest";
import { createTtlCache } from "./ttlCache.js";

// A controllable clock so expiry is deterministic without real timers.
function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createTtlCache", () => {
  it("returns a stored value within the TTL", () => {
    const clock = fakeClock();
    const cache = createTtlCache<number>({ defaultTtlMs: 1000, now: clock.now });

    cache.set("a", 42);
    clock.advance(999);

    expect(cache.get("a")).toBe(42);
  });

  it("evicts and returns undefined once the entry expires", () => {
    const clock = fakeClock();
    const cache = createTtlCache<number>({ defaultTtlMs: 1000, now: clock.now });

    cache.set("a", 42);
    clock.advance(1000);

    expect(cache.get("a")).toBeUndefined();
    // A second read still misses (entry was evicted, not just hidden).
    expect(cache.get("a")).toBeUndefined();
  });

  it("returns undefined for a key that was never set", () => {
    const cache = createTtlCache<number>({ defaultTtlMs: 1000 });
    expect(cache.get("missing")).toBeUndefined();
  });

  it("honors a per-entry TTL override", () => {
    const clock = fakeClock();
    const cache = createTtlCache<string>({ defaultTtlMs: 1000, now: clock.now });

    cache.set("short", "x", 100);
    clock.advance(150);

    expect(cache.get("short")).toBeUndefined();
  });

  it("delete and clear remove entries", () => {
    const cache = createTtlCache<string>({ defaultTtlMs: 1000 });

    cache.set("a", "1");
    cache.set("b", "2");
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");

    cache.clear();
    expect(cache.get("b")).toBeUndefined();
  });
});
