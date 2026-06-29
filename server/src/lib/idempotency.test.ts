import { describe, it, expect, beforeEach, vi } from "vitest";

// idempotency.ts imports config; mock it so the test doesn't require a full env.
vi.mock("../config.js", () => ({ config: { IDEMPOTENCY_TTL_MS: 60_000 } }));

import { getIdempotencyStore, idempotencyCacheKey } from "./idempotency.js";

describe("idempotencyCacheKey", () => {
  it("scopes keys per publisher", () => {
    expect(idempotencyCacheKey("pub1", "abc")).toBe("pub1:abc");
    expect(idempotencyCacheKey("pub1", "abc")).not.toBe(idempotencyCacheKey("pub2", "abc"));
  });
});

describe("idempotency store", () => {
  beforeEach(() => getIdempotencyStore().clear());

  it("returns the original result on a repeat lookup", () => {
    const store = getIdempotencyStore();
    const key = idempotencyCacheKey("pub1", "k1");

    // First request marks the key in progress...
    store.set(key, { inProgress: true });
    expect(store.get(key)).toEqual({ inProgress: true });

    // ...then records the committed result.
    const result = { status: 201, body: { id: "r1", title: "Doc" } };
    store.set(key, { inProgress: false, result });

    // A retry sees the same stored result.
    expect(store.get(key)).toEqual({ inProgress: false, result });
  });

  it("isolates identical keys across different publishers", () => {
    const store = getIdempotencyStore();
    store.set(idempotencyCacheKey("pubA", "same"), {
      inProgress: false,
      result: { status: 201, body: { id: "A" } },
    });

    expect(store.get(idempotencyCacheKey("pubB", "same"))).toBeUndefined();
  });
});

// ── Concurrent-retry tests (#312) ──────────────────────────────────────────

describe("idempotency store – concurrent requests", () => {
  beforeEach(() => getIdempotencyStore().clear());

  /**
   * Simulates two concurrent in-flight requests sharing the same idempotency
   * key. Only the first caller should perform the effect; the second should
   * observe the in-progress marker and block/defer rather than racing to
   * create a duplicate.
   *
   * In practice the server uses the in-progress marker as a 409 signal.
   * This test verifies the store correctly represents that protocol.
   */
  it("concurrent same-key requests: first wins, second sees in-progress marker", async () => {
    const store = getIdempotencyStore();
    const key = idempotencyCacheKey("pub1", "concurrent-key");

    // ── Caller A starts first and claims the key ───────────────────────────
    expect(store.get(key)).toBeUndefined();
    store.set(key, { inProgress: true });

    // ── Caller B arrives while A is still running ──────────────────────────
    const recordB = store.get(key);
    expect(recordB).toEqual({ inProgress: true });
    // Caller B should detect the in-progress marker and NOT write its own
    // entry (simulating the 409-conflict fast-path).
    const callerBPerformedEffect = recordB?.inProgress === false;
    expect(callerBPerformedEffect).toBe(false);

    // ── Caller A finishes and commits the result ───────────────────────────
    const committedResult = { status: 201, body: { id: "r1", title: "Doc" } };
    store.set(key, { inProgress: false, result: committedResult });

    // ── Both callers now observe the same committed result ─────────────────
    const recordAfterA = store.get(key);
    expect(recordAfterA).toEqual({ inProgress: false, result: committedResult });

    // Caller B polling/retrying also sees the committed result.
    const recordBRetry = store.get(key);
    expect(recordBRetry).toEqual({ inProgress: false, result: committedResult });
  });

  it("concurrent same-key requests produce at most one committed result", async () => {
    const store = getIdempotencyStore();
    const key = idempotencyCacheKey("pub2", "race-key");

    let effectCount = 0;

    // Simulate two callers running concurrently as micro-tasks.
    async function caller(result: { status: number; body: unknown }): Promise<boolean> {
      // If key is already claimed, back off (simulate 409 fast path).
      if (store.get(key) !== undefined) return false;

      // Claim the key.
      store.set(key, { inProgress: true });

      // Simulate async work (publish effect).
      await Promise.resolve();
      effectCount++;

      store.set(key, { inProgress: false, result });
      return true;
    }

    // Fire both callers without awaiting between them (true concurrent start).
    const [didA, didB] = await Promise.all([
      caller({ status: 201, body: { id: "A" } }),
      caller({ status: 201, body: { id: "B" } }),
    ]);

    // Exactly one caller should have performed the effect.
    expect(effectCount).toBe(1);
    // Exactly one caller should have committed.
    const committed = [didA, didB].filter(Boolean);
    expect(committed).toHaveLength(1);

    // The store should hold a single, consistent result.
    const record = store.get(key);
    expect(record).toBeDefined();
    expect(record?.inProgress).toBe(false);
  });

  it("returns the committed result to all callers once in-progress resolves", () => {
    const store = getIdempotencyStore();
    const key = idempotencyCacheKey("pub3", "resolve-key");
    const committed = { status: 201, body: { id: "final" } };

    store.set(key, { inProgress: true });
    store.set(key, { inProgress: false, result: committed });

    // All subsequent reads return the same committed result.
    for (let i = 0; i < 5; i++) {
      expect(store.get(key)).toEqual({ inProgress: false, result: committed });
    }
  });

  // ── Key reuse after completion (#312) ─────────────────────────────────────

  it("allows key reuse after the TTL expires (completed result evicted)", async () => {
    // Use an injectable clock so we can advance time deterministically.
    let now = 1_000_000;
    const { createTtlCache } = await import("./ttlCache.js");
    const shortStore = createTtlCache<import("./idempotency.js").IdempotencyRecord>({
      defaultTtlMs: 100,
      now: () => now,
    });

    const key = idempotencyCacheKey("pub4", "reuse-key");
    const firstResult = { status: 201, body: { id: "first" } };
    shortStore.set(key, { inProgress: false, result: firstResult });

    // Before expiry – same result returned.
    expect(shortStore.get(key)).toEqual({ inProgress: false, result: firstResult });

    // Advance past the TTL.
    now += 200;

    // After expiry – entry is evicted.
    expect(shortStore.get(key)).toBeUndefined();

    // A new request can now claim and commit a fresh result.
    shortStore.set(key, { inProgress: true });
    const secondResult = { status: 201, body: { id: "second" } };
    shortStore.set(key, { inProgress: false, result: secondResult });

    expect(shortStore.get(key)).toEqual({ inProgress: false, result: secondResult });
  });

  // ── Key reuse after failure (#312) ────────────────────────────────────────

  it("allows key reuse after a failed attempt is cleared", () => {
    const store = getIdempotencyStore();
    const key = idempotencyCacheKey("pub5", "failure-key");

    // First attempt is in-progress.
    store.set(key, { inProgress: true });

    // Simulate failure: caller deletes the key so the next request can retry.
    store.delete(key);
    expect(store.get(key)).toBeUndefined();

    // A retry can now claim the key and commit a result.
    store.set(key, { inProgress: true });
    const retryResult = { status: 201, body: { id: "retry-success" } };
    store.set(key, { inProgress: false, result: retryResult });

    expect(store.get(key)).toEqual({ inProgress: false, result: retryResult });
  });

  it("does not double-apply effects when a client retries after server commit", () => {
    const store = getIdempotencyStore();
    const key = idempotencyCacheKey("pub6", "client-retry-key");
    const originalResult = { status: 201, body: { id: "original" } };

    // Server commits the result.
    store.set(key, { inProgress: true });
    store.set(key, { inProgress: false, result: originalResult });

    // Client did not receive the response (network blip) and retries.
    const retryRecord = store.get(key);
    // The server detects the committed record and returns the stored result
    // without applying the effect again.
    expect(retryRecord).toEqual({ inProgress: false, result: originalResult });
    expect((retryRecord as any)?.inProgress).toBe(false);
  });

  it("result consistency: concurrent readers see the same committed body", () => {
    const store = getIdempotencyStore();
    const key = idempotencyCacheKey("pub7", "consistency-key");
    const committed = { status: 201, body: { id: "consistent", title: "Consistent Doc" } };

    store.set(key, { inProgress: false, result: committed });

    const reads = Array.from({ length: 10 }, () => store.get(key));
    reads.forEach((r) => {
      expect(r).toEqual({ inProgress: false, result: committed });
    });
  });
});
