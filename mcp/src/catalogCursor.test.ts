import { describe, expect, it } from "vitest";
import { createCatalogCursor, resolveCatalogCursor } from "./catalogCursor.js";
import { CURSOR_TTL_MS } from "./cursorToken.js";
import type { CatalogCacheContext } from "./catalogCache.js";

const context: CatalogCacheContext = {
  profile: "buyer",
  network: "testnet",
  contractId: "C123",
  apiOrigin: "https://catalog.example",
};

describe("catalog cursors", () => {
  it("round-trips the next offset for the same filter identity", () => {
    const filters = { query: "é", limit: 20 };
    const cursor = createCatalogCursor(20, filters, context);
    expect(resolveCatalogCursor(cursor, filters, context)).toEqual({ ok: true, offset: 20 });
  });

  it.each([
    ["a different profile", { ...context, profile: "publisher" }],
    ["a different network", { ...context, network: "mainnet" }],
    ["a different contract", { ...context, contractId: "C456" }],
    ["a different API origin", { ...context, apiOrigin: "https://other.example" }],
  ])("rejects reuse after %s", (_label, changedContext) => {
    const filters = { query: "catalog", limit: 20 };
    const cursor = createCatalogCursor(20, filters, context);
    expect(resolveCatalogCursor(cursor, filters, changedContext)).toMatchObject({ ok: false });
  });

  it("rejects reuse after a filter change or malformed input", () => {
    const filters = { query: "catalog", limit: 20 };
    const cursor = createCatalogCursor(20, filters, context);
    expect(resolveCatalogCursor(cursor, { ...filters, sort: "title" }, context)).toMatchObject({
      ok: false,
    });
    expect(resolveCatalogCursor("not-a-cursor", filters, context)).toMatchObject({ ok: false });
  });

  it("reports an expired cursor separately from an invalid one", () => {
    const filters = { query: "catalog", limit: 20 };
    const issuedAt = 1_000_000;
    const cursor = createCatalogCursor(20, filters, context, () => issuedAt);
    expect(
      resolveCatalogCursor(cursor, filters, context, () => issuedAt + CURSOR_TTL_MS),
    ).toMatchObject({ ok: false, reason: "expired" });
    expect(resolveCatalogCursor("not-a-cursor", filters, context)).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("reports an edited token as tampered", () => {
    const filters = { query: "catalog", limit: 20 };
    const cursor = createCatalogCursor(20, filters, context);
    const envelope = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    envelope.p.offset = 200;
    const edited = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
    expect(resolveCatalogCursor(edited, filters, context)).toMatchObject({
      ok: false,
      reason: "tampered",
    });
  });
});
