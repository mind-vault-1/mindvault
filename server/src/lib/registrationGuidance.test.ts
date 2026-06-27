import { describe, it, expect, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: { STELLAR_NETWORK: "testnet" },
}));

import { buildRegistrationFailureGuidance, explorerTxUrl } from "./registrationGuidance.js";

describe("buildRegistrationFailureGuidance", () => {
  it("always names the retry endpoint and keeps the resource listed", () => {
    const g = buildRegistrationFailureGuidance({ resourceId: "abc123", detail: "boom" });
    expect(g.retryEndpoint).toBe("POST /resources/abc123/register");
    expect(g.retryable).toBe(true);
    expect(g.nextSteps.some((s) => s.includes("POST /resources/abc123/register"))).toBe(true);
    expect(g.nextSteps.some((s) => /still listed and purchasable/i.test(s))).toBe(true);
    expect(g.nextSteps.some((s) => /operator/i.test(s))).toBe(true);
  });

  it("links to the transaction on the explorer when a hash exists", () => {
    const g = buildRegistrationFailureGuidance({
      resourceId: "abc123",
      txHash: "deadbeef",
      detail: "Transaction failed on-chain",
    });
    expect(g.txStatusUrl).toBe(explorerTxUrl("deadbeef"));
    expect(g.txStatusUrl).toContain("stellar.expert/explorer/testnet/tx/deadbeef");
    expect(g.nextSteps.some((s) => s.includes("deadbeef"))).toBe(true);
    // A broadcast-but-failed tx points at the funding/fees cause.
    expect(g.nextSteps.some((s) => /XLM for fees/i.test(s))).toBe(true);
  });

  it("treats a timeout as possibly-still-pending rather than failed", () => {
    const g = buildRegistrationFailureGuidance({
      resourceId: "abc123",
      txHash: "feedface",
      detail: "Transaction polling timeout - status unknown",
    });
    expect(g.nextSteps.some((s) => /pending/i.test(s) && /re-check|wait/i.test(s))).toBe(true);
  });

  it("omits the tx link and points at funding/RPC when nothing was submitted", () => {
    const g = buildRegistrationFailureGuidance({ resourceId: "abc123", detail: "RPC unreachable" });
    expect(g.txStatusUrl).toBeUndefined();
    expect(g.nextSteps.some((s) => /No transaction was submitted/i.test(s))).toBe(true);
    expect(g.nextSteps.some((s) => /funded|RPC/i.test(s))).toBe(true);
  });
});
