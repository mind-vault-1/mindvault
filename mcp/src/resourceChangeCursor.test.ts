import { describe, expect, it } from "vitest";

import type { CatalogCacheContext } from "./catalogCache.js";
import {
  createResourceChangeCursor,
  resolveResourceChangeCursor,
  type ResourceChangeCursorPayload,
} from "./resourceChangeCursor.js";

const context: CatalogCacheContext = {
  profile: "default",
  network: "testnet",
  contractId: "CMOCK",
  apiOrigin: "https://api.example.com",
};

const state = {
  price: "5.00",
  verificationStatus: "verified",
  listed: true,
};

function decodePayload(cursor: string): ResourceChangeCursorPayload {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
}

function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

describe("resourceChangeCursor", () => {
  it("round-trips the last observed state", () => {
    const cursor = createResourceChangeCursor("res-1", state, context, () => 1_700);
    expect(decodePayload(cursor)).toMatchObject({
      version: 1,
      resourceId: "res-1",
      context,
      state,
      lastDetectedAt: 1_700,
    });
    expect(resolveResourceChangeCursor(cursor, "res-1", context)).toEqual({
      ok: true,
      state,
      lastDetectedAt: 1_700,
    });
  });

  it("starts from an empty state when no cursor is supplied", () => {
    expect(resolveResourceChangeCursor(undefined, "res-1", context)).toEqual({
      ok: true,
      state: { price: null, verificationStatus: null, listed: null },
      lastDetectedAt: 0,
    });
  });

  it("rejects malformed, wrong-resource, wrong-context, and stale-version cursors", () => {
    const valid = decodePayload(createResourceChangeCursor("res-1", state, context));

    expect(resolveResourceChangeCursor("not-a-cursor", "res-1", context).ok).toBe(false);
    expect(
      resolveResourceChangeCursor(
        encodePayload({ ...valid, resourceId: "res-2" }),
        "res-1",
        context,
      ).ok,
    ).toBe(false);
    expect(
      resolveResourceChangeCursor(
        encodePayload({ ...valid, context: { ...context, profile: "other" } }),
        "res-1",
        context,
      ).ok,
    ).toBe(false);
    expect(
      resolveResourceChangeCursor(encodePayload({ ...valid, version: 2 }), "res-1", context).ok,
    ).toBe(false);
  });

  it("rejects a cursor whose state shape was altered", () => {
    const valid = decodePayload(createResourceChangeCursor("res-1", state, context));
    expect(
      resolveResourceChangeCursor(
        encodePayload({ ...valid, state: { ...valid.state, listed: "yes" } }),
        "res-1",
        context,
      ).ok,
    ).toBe(false);
  });
});
