import { afterEach, describe, expect, it } from "vitest";

import type { CatalogCacheContext } from "./catalogCache.js";
import {
  createResourceChangeCursor,
  resolveResourceChangeCursor,
  type ResourceChangeCursorPayload,
} from "./resourceChangeCursor.js";
import { createCursorToken, CURSOR_TTL_MS } from "./cursorToken.js";

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

const issuedAt = 1_000_000;

function decodePayload(cursor: string): ResourceChangeCursorPayload {
  const envelope = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  return envelope.p;
}

function signPayload(payload: unknown): string {
  return createCursorToken("subscription", payload, () => issuedAt);
}

afterEach(() => {
  delete process.env.MINDVAULT_CURSOR_SIGNING_KEY;
});

describe("resourceChangeCursor", () => {
  it("round-trips the last observed state", () => {
    const cursor = createResourceChangeCursor("res-1", state, context, () => issuedAt);
    expect(decodePayload(cursor)).toMatchObject({
      version: 1,
      resourceId: "res-1",
      context,
      state,
      lastDetectedAt: issuedAt,
    });
    expect(resolveResourceChangeCursor(cursor, "res-1", context, () => issuedAt)).toEqual({
      ok: true,
      state,
      lastDetectedAt: issuedAt,
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
    const valid = decodePayload(
      createResourceChangeCursor("res-1", state, context, () => issuedAt),
    );

    expect(resolveResourceChangeCursor("not-a-cursor", "res-1", context).ok).toBe(false);
    expect(
      resolveResourceChangeCursor(
        signPayload({ ...valid, resourceId: "res-2" }),
        "res-1",
        context,
        () => issuedAt,
      ).ok,
    ).toBe(false);
    expect(
      resolveResourceChangeCursor(
        signPayload({ ...valid, context: { ...context, profile: "other" } }),
        "res-1",
        context,
        () => issuedAt,
      ).ok,
    ).toBe(false);
    expect(
      resolveResourceChangeCursor(
        signPayload({ ...valid, version: 2 }),
        "res-1",
        context,
        () => issuedAt,
      ).ok,
    ).toBe(false);
  });

  it("rejects a cursor whose state shape was altered", () => {
    const valid = decodePayload(
      createResourceChangeCursor("res-1", state, context, () => issuedAt),
    );
    expect(
      resolveResourceChangeCursor(
        signPayload({ ...valid, state: { ...valid.state, listed: "yes" } }),
        "res-1",
        context,
        () => issuedAt,
      ).ok,
    ).toBe(false);
  });

  it("reports expired and tampered cursors with distinct reasons", () => {
    const cursor = createResourceChangeCursor("res-1", state, context, () => issuedAt);
    expect(
      resolveResourceChangeCursor(cursor, "res-1", context, () => issuedAt + CURSOR_TTL_MS),
    ).toMatchObject({ ok: false, reason: "expired" });

    const envelope = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    envelope.p.state.price = "999.00";
    const edited = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
    expect(resolveResourceChangeCursor(edited, "res-1", context, () => issuedAt)).toMatchObject({
      ok: false,
      reason: "tampered",
    });
  });
});
