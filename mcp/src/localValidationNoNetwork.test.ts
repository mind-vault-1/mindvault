/**
 * No-network guard for local-only validation (#1249).
 *
 * The dispatcher short-circuit in index.ts stops before handlers, but the
 * report builder must also be inert on its own: stubbing fetch with a throwing
 * spy proves no hidden HTTP path was introduced.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { localValidationOutcome } from "./localValidation.js";

describe("local-only validation outbound suppression", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never calls fetch, even for a networked tool", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("local validation must not use the network");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = localValidationOutcome(
      "mindvault_buy",
      { resourceId: "cm7x8y9z", dryRun: true },
      { MINDVAULT_LOCAL_VALIDATION: "1", STELLAR_NETWORK: "testnet" },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    const text = typeof outcome === "string" ? outcome : outcome.text;
    expect(text).toContain("mindvault.local-validation/v1");
    expect(text).toContain('"noOutbound": true');
    const structured = typeof outcome === "string" ? undefined : outcome.structured;
    expect(structured).toMatchObject({
      schema: "mindvault.local-validation/v1",
      mode: "local-only",
      noOutbound: true,
      tool: "mindvault_buy",
    });
  });
});
