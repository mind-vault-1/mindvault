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
