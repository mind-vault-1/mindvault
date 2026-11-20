/**
 * Transaction wait policy and settlement polling (#1058).
 *
 * `mindvault_buy` lets the caller choose between returning as soon as the
 * payment is submitted and waiting for the transaction to settle. These tests
 * pin the policy normalization, the bounded maximum wait, the always-present
 * `txHash`/`status` fields, and prompt cancellation — all without real waiting
 * (the clock and sleep are injected).
 */
import { describe, it, expect } from "vitest";

import {
  TRANSACTION_WAIT_POLICIES,
  buildSettlementSnapshot,
  normalizeTransactionWaitPolicy,
  pollSettlement,
  resolveTransactionWait,
  waitPolicyFromFlag,
  type TransactionLookup,
} from "./settlement.js";

const lookup = (status: string, found = status !== "NOT_FOUND"): TransactionLookup => ({
  hash: "abc123",
  found,
  status,
});

describe("normalizeTransactionWaitPolicy", () => {
  it("defaults to return-after-submit", () => {
    expect(normalizeTransactionWaitPolicy(undefined)).toBe("return-after-submit");
    expect(normalizeTransactionWaitPolicy(null)).toBe("return-after-submit");
    expect(normalizeTransactionWaitPolicy("")).toBe("return-after-submit");
  });

  it("accepts the canonical names and short aliases", () => {
    expect(normalizeTransactionWaitPolicy("wait-for-final-result")).toBe("wait-for-final-result");
    expect(normalizeTransactionWaitPolicy("final")).toBe("wait-for-final-result");
    expect(normalizeTransactionWaitPolicy("return-after-submit")).toBe("return-after-submit");
    expect(normalizeTransactionWaitPolicy("submit")).toBe("return-after-submit");
  });

  it("is tolerant of case and surrounding whitespace", () => {
    expect(normalizeTransactionWaitPolicy("  WAIT-FOR-FINAL-RESULT ")).toBe(
      "wait-for-final-result",
    );
  });

  it("rejects an unrecognized policy rather than silently ignoring it", () => {
    expect(() => normalizeTransactionWaitPolicy("eventually")).toThrow(/wait-for-final-result/);
  });
});

describe("waitPolicyFromFlag", () => {
  it("maps the legacy boolean wait flag onto a policy", () => {
    expect(waitPolicyFromFlag(true)).toBe("wait-for-final-result");
    expect(waitPolicyFromFlag("true")).toBe("wait-for-final-result");
    expect(waitPolicyFromFlag(false)).toBe("return-after-submit");
    expect(waitPolicyFromFlag(undefined)).toBe("return-after-submit");
  });
});

describe("resolveTransactionWait", () => {
  it("lets waitPolicy win over the legacy wait flag", () => {
    const resolved = resolveTransactionWait({ waitPolicy: "return-after-submit", wait: true });
    expect(resolved.policy).toBe("return-after-submit");
    expect(resolved.wait).toBe(false);
  });

  it("keeps wait: true working for existing clients", () => {
    const resolved = resolveTransactionWait({ wait: true });
    expect(resolved.policy).toBe("wait-for-final-result");
    expect(resolved.wait).toBe(true);
  });

  it("defaults to return-after-submit when nothing is supplied", () => {
    expect(resolveTransactionWait({}).policy).toBe("return-after-submit");
  });

  it("clamps the wait to the documented maximum", () => {
    const resolved = resolveTransactionWait({
      waitPolicy: "wait-for-final-result",
      timeoutMs: 10_000_000,
    });
    expect(resolved.timeoutMs).toBe(300_000);
    expect(resolved.timeoutMs).toBeLessThanOrEqual(300_000);
  });
});

describe("buildSettlementSnapshot", () => {
  it("always carries txHash and status, even when nothing was polled", () => {
    const snapshot = buildSettlementSnapshot({
      txHash: "deadbeef",
      wait: false,
      skipped: false,
      result: null,
    });
    expect(snapshot.txHash).toBe("deadbeef");
    expect(snapshot.status).toBeNull();
    expect(snapshot.waitPolicy).toBe("return-after-submit");
    expect(snapshot.polled).toBe(false);
    expect(snapshot.cancelled).toBe(false);
  });

  it("reports a skipped wait when there was no hash to poll", () => {
    const snapshot = buildSettlementSnapshot({
      txHash: null,
      wait: true,
      skipped: true,
      waitPolicy: "wait-for-final-result",
      result: null,
    });
    expect(snapshot.skipped).toBe(true);
    expect(snapshot.waitPolicy).toBe("wait-for-final-result");
    expect(snapshot.message).toMatch(/no transaction hash/i);
  });

  it("describes a polled SUCCESS", () => {
    const snapshot = buildSettlementSnapshot({
      txHash: "abc123",
      wait: true,
      skipped: false,
      waitPolicy: "wait-for-final-result",
      result: { tx: lookup("SUCCESS"), attempts: 2, timedOut: false },
    });
    expect(snapshot.polled).toBe(true);
    expect(snapshot.settled).toBe(true);
    expect(snapshot.success).toBe(true);
    expect(snapshot.status).toBe("SUCCESS");
    expect(snapshot.cancelled).toBe(false);
  });

  it("flags a cancelled wait", () => {
    const snapshot = buildSettlementSnapshot({
      txHash: "abc123",
      wait: true,
      skipped: false,
      waitPolicy: "wait-for-final-result",
      result: { tx: lookup("NOT_FOUND", false), attempts: 1, timedOut: false, cancelled: true },
    });
    expect(snapshot.cancelled).toBe(true);
    expect(snapshot.timedOut).toBe(false);
    expect(snapshot.message).toMatch(/cancelled/i);
  });
});

describe("pollSettlement", () => {
  it("does a single check under return-after-submit and never waits", async () => {
    let clock = 0;
    const fetchTransaction = async () => lookup("SUCCESS");
    const result = await pollSettlement({
      txHash: "abc123",
      wait: false,
      timeoutMs: 5000,
      intervalMs: 1000,
      fetchTransaction,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    });
    expect(result.attempts).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(result.cancelled).toBe(false);
    expect(result.tx.status).toBe("SUCCESS");
    expect(clock).toBe(0);
  });

  it("polls until the transaction reaches a terminal status", async () => {
    let clock = 0;
    const responses = [lookup("NOT_FOUND", false), lookup("SUCCESS")];
    const fetchTransaction = async () => responses.shift()!;
    const result = await pollSettlement({
      txHash: "abc123",
      wait: true,
      timeoutMs: 3000,
      intervalMs: 1000,
      fetchTransaction,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    });
    expect(result.tx.status).toBe("SUCCESS");
    expect(result.attempts).toBe(2);
    expect(result.timedOut).toBe(false);
    expect(result.cancelled).toBe(false);
  });

  it("gives up at the deadline without an unbounded wait", async () => {
    let clock = 0;
    const result = await pollSettlement({
      txHash: "abc123",
      wait: true,
      timeoutMs: 2500,
      intervalMs: 1000,
      fetchTransaction: async () => lookup("NOT_FOUND", false),
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    });
    expect(result.timedOut).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(clock).toBeLessThanOrEqual(3000);
  });

  it("returns immediately and honestly when aborted before the first lookup", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchTransaction = async () => {
      throw new Error("should not be called");
    };
    const result = await pollSettlement({
      txHash: "abc123",
      wait: true,
      timeoutMs: 5000,
      intervalMs: 1000,
      fetchTransaction,
      sleep: async () => undefined,
      signal: controller.signal,
    });
    expect(result.cancelled).toBe(true);
    expect(result.attempts).toBe(0);
    expect(result.tx.hash).toBe("abc123");
    expect(result.tx.status).toBe("UNKNOWN");
  });

  it("stops promptly when cancelled during the wait", async () => {
    const controller = new AbortController();
    const result = await pollSettlement({
      txHash: "abc123",
      wait: true,
      timeoutMs: 30_000,
      intervalMs: 1000,
      fetchTransaction: async () => lookup("NOT_FOUND", false),
      sleep: async () => {
        controller.abort();
      },
      signal: controller.signal,
    });
    expect(result.cancelled).toBe(true);
    expect(result.tx.status).toBe("NOT_FOUND");
  });
});

describe("wait policy constants", () => {
  it("exposes exactly the two documented policies", () => {
    expect(TRANSACTION_WAIT_POLICIES).toEqual(["return-after-submit", "wait-for-final-result"]);
  });

  it("caps the wait at the settlement timeout ceiling", () => {
    expect(resolveTransactionWait({ timeoutMs: 400_000 }).timeoutMs).toBe(300_000);
  });
});
