import { afterEach, describe, expect, it } from "vitest";

import {
  CURSOR_TTL_MS,
  createCursorToken,
  cursorErrorMessage,
  cursorMappedError,
  readCursorToken,
} from "./cursorToken.js";

const now = () => 1_000_000;

function tamper(token: string, mutate: (payload: any) => void): string {
  const envelope = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  mutate(envelope);
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

afterEach(() => {
  delete process.env.MINDVAULT_CURSOR_SIGNING_KEY;
});

describe("cursor tokens", () => {
  it("round-trips a payload within the validity window", () => {
    const token = createCursorToken("catalog", { offset: 20 }, now);
    expect(readCursorToken(token, "catalog", now)).toEqual({ ok: true, payload: { offset: 20 } });
    expect(readCursorToken(token, "catalog", () => now() + CURSOR_TTL_MS - 1).ok).toBe(true);
  });

  it("rejects an expired token with a distinct reason", () => {
    const token = createCursorToken("catalog", { offset: 20 }, now);
    expect(readCursorToken(token, "catalog", () => now() + CURSOR_TTL_MS)).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a tampered payload even when its shape stays valid", () => {
    const token = createCursorToken("catalog", { offset: 20 }, now);
    const edited = tamper(token, (payload) => {
      payload.p.offset = 200;
    });
    expect(readCursorToken(edited, "catalog", now)).toMatchObject({
      ok: false,
      reason: "tampered",
    });
  });

  it("rejects a token signed with a different configured key", () => {
    const token = createCursorToken("catalog", { offset: 20 }, now);
    process.env.MINDVAULT_CURSOR_SIGNING_KEY = "a-different-signing-key-with-32-chars";
    expect(readCursorToken(token, "catalog", now)).toMatchObject({
      ok: false,
      reason: "tampered",
    });
  });

  it("rejects a token issued for another tool", () => {
    const token = createCursorToken("registry", { t: "s" }, now);
    expect(readCursorToken(token, "catalog", now)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it.each(["not-a-cursor", "", Buffer.from("[]").toString("base64url")])(
    "rejects malformed token %j",
    (token) => {
      expect(readCursorToken(token, "catalog", now)).toMatchObject({
        ok: false,
        reason: "invalid",
      });
    },
  );
});

describe("cursor error mapping", () => {
  it("gives every failure reason a stable code and actionable text", () => {
    for (const reason of ["invalid", "expired", "tampered"] as const) {
      const error = cursorErrorMessage("registry", reason);
      const mapped = cursorMappedError({
        operation: "Creator page rejected",
        reason,
        error,
        source: "soroban",
      });
      expect(mapped.code).toBe(
        {
          invalid: "MV_CURSOR_INVALID",
          expired: "MV_CURSOR_EXPIRED",
          tampered: "MV_CURSOR_TAMPERED",
        }[reason],
      );
      expect(mapped.category).toBe("validation");
      expect(mapped.action.length).toBeGreaterThan(0);
      expect(mapped.summary).toContain("Creator page rejected");
    }
  });
});
