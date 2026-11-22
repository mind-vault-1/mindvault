/**
 * Publish operation ids (#1250): derived, scope-bound handles that let a
 * client resume mindvault_publish_status polling after a reconnect or restart.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_PUBLISH_OPERATION_RESOURCE_ID_LENGTH,
  publishOperationId,
  publishStatusTarget,
  resolvePublishOperationId,
} from "./publishOperation.js";

const TESTNET = { network: "testnet", apiOrigin: "https://api.mindvault.test" };
const MAINNET = { network: "mainnet", apiOrigin: "https://api.mindvault.test" };
const OTHER_API = { network: "testnet", apiOrigin: "https://other.example" };

describe("publishOperationId", () => {
  it("round-trips a resource id in the scope it was issued for", () => {
    for (const resourceId of ["cm7x8y9z", "res-001", "swcn98besxpp6t1u8e77fqz3", "ünïcode"]) {
      const id = publishOperationId(resourceId, TESTNET);
      expect(id).toMatch(/^pubop1\.[A-Za-z0-9_-]+\.[0-9a-f]{16}$/);
      expect(resolvePublishOperationId(id, TESTNET)).toEqual({ ok: true, resourceId });
    }
  });

  it("is stable: the same publish always gets the same id, across processes", () => {
    // Pinned so a change to the derivation, which would orphan every id a
    // client has saved, cannot land unnoticed.
    expect(publishOperationId("cm7x8y9z", TESTNET)).toBe(publishOperationId("cm7x8y9z", TESTNET));
    expect(publishOperationId("cm7x8y9z", TESTNET)).toMatchInlineSnapshot(
      `"pubop1.Y203eDh5OXo.b31b1f387d53f169"`,
    );
  });

  it("differs per resource, network and API", () => {
    const ids = new Set([
      publishOperationId("cm7x8y9z", TESTNET),
      publishOperationId("cm7x8y9a", TESTNET),
      publishOperationId("cm7x8y9z", MAINNET),
      publishOperationId("cm7x8y9z", OTHER_API),
    ]);
    expect(ids.size).toBe(4);
  });

  it("refuses an id issued for another network or API", () => {
    const id = publishOperationId("cm7x8y9z", TESTNET);
    for (const scope of [MAINNET, OTHER_API]) {
      const resolved = resolvePublishOperationId(id, scope);
      expect(resolved).toMatchObject({ ok: false, code: "operation_scope_mismatch" });
      if (!resolved.ok) expect(resolved.message).not.toContain(id);
    }
  });

  it("refuses an altered id", () => {
    const id = publishOperationId("cm7x8y9z", TESTNET);
    const [prefix, encoded, check] = id.split(".");
    const otherResource = Buffer.from("cm7x8y9a").toString("base64url");
    const flipped = `${check!.slice(0, -1)}${check!.endsWith("0") ? "1" : "0"}`;
    for (const altered of [
      `${prefix}.${otherResource}.${check}`,
      `${prefix}.${encoded}.${flipped}`,
    ]) {
      expect(resolvePublishOperationId(altered, TESTNET)).toMatchObject({
        ok: false,
        code: "operation_scope_mismatch",
      });
    }
  });

  it.each([
    "",
    "cm7x8y9z",
    "pubop1",
    "pubop1..0123456789abcdef",
    "pubop2.Y203eDh5OXo.0123456789abcdef",
    "pubop1.Y203eDh5OXo.0123",
    "pubop1.Y203eDh5OXo.0123456789ABCDEF",
    "pubop1.Y203eDh5OXo=.0123456789abcdef",
    "pubop1.Y203eDh5OXp.0123456789abcdef", // non-canonical base64url
    "pubop1.Y203eDh5OXo.0123456789abcdef.extra",
  ])("refuses the malformed id %j", (id) => {
    const resolved = resolvePublishOperationId(id, TESTNET);
    expect(resolved).toMatchObject({ ok: false, code: "malformed_operation_id" });
    if (!resolved.ok) expect(resolved.message).toContain("pubop1.");
  });

  it("refuses an id wrapping an over-long resource id", () => {
    const long = "a".repeat(MAX_PUBLISH_OPERATION_RESOURCE_ID_LENGTH + 1);
    expect(resolvePublishOperationId(publishOperationId(long, TESTNET), TESTNET)).toMatchObject({
      ok: false,
      code: "malformed_operation_id",
    });
  });

  it("accepts surrounding whitespace", () => {
    const id = publishOperationId("cm7x8y9z", TESTNET);
    expect(resolvePublishOperationId(`  ${id}\n`, TESTNET)).toEqual({
      ok: true,
      resourceId: "cm7x8y9z",
    });
  });
});

describe("publishStatusTarget", () => {
  const id = publishOperationId("cm7x8y9z", TESTNET);

  it("uses resourceId, operationId, or both when they agree", () => {
    expect(publishStatusTarget({ resourceId: " cm7x8y9z " }, TESTNET)).toBe("cm7x8y9z");
    expect(publishStatusTarget({ operationId: id }, TESTNET)).toBe("cm7x8y9z");
    expect(publishStatusTarget({ resourceId: "cm7x8y9z", operationId: id }, TESTNET)).toBe(
      "cm7x8y9z",
    );
  });

  it("refuses a missing id, an unknown operation id, and a disagreeing pair", () => {
    expect(() => publishStatusTarget({}, TESTNET)).toThrow(
      /resourceId is required \(or pass operationId\)/,
    );
    expect(() => publishStatusTarget({ resourceId: "  ", operationId: "" }, TESTNET)).toThrow(
      /resourceId is required \(or pass operationId\)/,
    );
    expect(() => publishStatusTarget({ operationId: "pubop1.nope.0" }, TESTNET)).toThrow(
      /not a MindVault publish operation id/,
    );
    expect(() => publishStatusTarget({ operationId: id }, MAINNET)).toThrow(
      /not issued for the active network \(mainnet\)/,
    );
    expect(() => publishStatusTarget({ resourceId: "other", operationId: id }, TESTNET)).toThrow(
      /refer to different resources/,
    );
    expect(() => publishStatusTarget({ operationId: 42 }, TESTNET)).toThrow(/must be the string/);
  });
});

// ── Tool level: resume polling with the id a publish returned ───────────────

const jsonFetch = vi.fn();

vi.mock("./runtime.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, jsonFetch };
});

const { publishStatus } = await import("./tools/wallet.js");
const { BASE_URL, STELLAR_NETWORK } = await import("./runtime.js");
const SCOPE = { network: STELLAR_NETWORK, apiOrigin: new URL(BASE_URL).origin };

function serve(status: string) {
  jsonFetch.mockImplementation(async (url: string) => {
    if (!url.includes("/resources/cm7x8y9z/")) return { ok: false, status: 404, data: {} };
    return url.endsWith("/meta")
      ? {
          ok: true,
          status: 200,
          data: { id: "cm7x8y9z", title: "Dataset", verificationStatus: status },
        }
      : { ok: true, status: 200, data: { resourceId: "cm7x8y9z", status, listed: true } };
  });
}

describe("mindvault_publish_status with operationId", () => {
  beforeEach(() => {
    jsonFetch.mockReset();
  });

  it("reports the operationId so a client can save it", async () => {
    serve("pending");
    const snapshot = JSON.parse(await publishStatus({ resourceId: "cm7x8y9z" }));
    expect(snapshot.operationId).toBe(publishOperationId("cm7x8y9z", SCOPE));
  });

  it("resumes polling from a saved operationId, as after a restart", async () => {
    serve("pending");
    const saved = JSON.parse(await publishStatus({ resourceId: "cm7x8y9z" })).operationId;

    // A new session knows only the saved id.
    serve("verified");
    const resumed = JSON.parse(await publishStatus({ operationId: saved, wait: true }));
    expect(resumed).toMatchObject({
      resourceId: "cm7x8y9z",
      operationId: saved,
      verificationStatus: "verified",
      settled: true,
    });
    expect(jsonFetch).toHaveBeenCalledWith(`${BASE_URL}/resources/cm7x8y9z/meta`);
  });

  it("refuses an unknown operationId without calling the API", async () => {
    serve("pending");
    await expect(
      publishStatus({ operationId: "pubop1.Y203eDh5OXo.0000000000000000" }),
    ).rejects.toThrow(/not issued for the active network/);
    await expect(publishStatus({ operationId: "op-123" })).rejects.toThrow(
      /not a MindVault publish operation id/,
    );
    expect(jsonFetch).not.toHaveBeenCalled();
  });

  it("reports a resource that no longer exists the same way as a bare resourceId", async () => {
    serve("pending");
    const gone = publishOperationId("deleted1", SCOPE);
    await expect(publishStatus({ operationId: gone })).rejects.toThrow(
      /Resource "deleted1" not found/,
    );
  });
});
