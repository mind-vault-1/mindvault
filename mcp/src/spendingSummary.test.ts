/**
 * Focused tests for profile-scoped purchase spending summary (#1271).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PURCHASE_HISTORY_VERSION,
  _setPurchasesFilePath,
  recordPurchase,
} from "./purchaseHistory.js";
import {
  SPENDING_SUMMARY_OUTPUT_SCHEMA,
  SPENDING_SUMMARY_SCHEMA,
  SpendingSummaryError,
  buildSpendingSummary,
  normalizeSpendingSummaryOptions,
  spendingSummaryTool,
} from "./spendingSummary.js";

let directory: string;
let file: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "mv-spending-summary-"));
  file = join(directory, "purchases.json");
  _setPurchasesFilePath(file);
});

afterEach(() => {
  _setPurchasesFilePath(null);
  rmSync(directory, { recursive: true, force: true });
});

function buy(
  resourceId: string,
  amount: string,
  timestamp: string,
  profile?: string,
  network = "stellar:testnet",
) {
  return recordPurchase({
    resourceId,
    amount,
    network,
    txHash: null,
    receiptRef: null,
    timestamp,
    ...(profile ? { profile } : {}),
  });
}

describe("exact decimal arithmetic", () => {
  it("sums 0.1 + 0.2 without floating-point drift", () => {
    buy("res-1", "0.1", "2026-08-01T10:00:00.000Z", "buyer");
    buy("res-2", "0.2", "2026-08-02T10:00:00.000Z", "buyer");

    const summary = buildSpendingSummary(normalizeSpendingSummaryOptions({}), {
      profile: "buyer",
    });

    expect(summary.count).toBe(2);
    expect(summary.totalsByCurrency).toEqual([{ currency: "USDC", count: 2, totalAmount: "0.3" }]);
    expect(summary.summaries).toEqual([
      { period: "2026-08", currency: "USDC", count: 2, totalAmount: "0.3" },
    ]);
  });

  it("preserves 7-decimal Stellar stroop precision", () => {
    buy("res-1", "0.0000001", "2026-08-01T10:00:00.000Z", "buyer");
    buy("res-2", "1.2345679", "2026-08-02T10:00:00.000Z", "buyer");

    const summary = buildSpendingSummary(normalizeSpendingSummaryOptions({}), {
      profile: "buyer",
    });

    expect(summary.totalsByCurrency).toEqual([
      { currency: "USDC", count: 2, totalAmount: "1.234568" },
    ]);
  });
});

describe("profile isolation", () => {
  it("includes only receipts belonging to the active profile and excludes unscoped receipts", () => {
    buy("res-a1", "1.5", "2026-08-01T10:00:00.000Z", "alice");
    buy("res-a2", "2.5", "2026-08-02T10:00:00.000Z", "alice");
    buy("res-b1", "99.0", "2026-08-03T10:00:00.000Z", "bob");
    buy("res-unscoped", "50.0", "2026-08-04T10:00:00.000Z", undefined);

    const alice = JSON.parse(spendingSummaryTool({}, { profile: "alice" }));
    expect(alice.schema).toBe(SPENDING_SUMMARY_SCHEMA);
    expect(alice.profile).toBe("alice");
    expect(alice.count).toBe(2);
    expect(alice.totalsByCurrency).toEqual([{ currency: "USDC", count: 2, totalAmount: "4" }]);

    const bob = JSON.parse(spendingSummaryTool({}, { profile: "bob" }));
    expect(bob.count).toBe(1);
    expect(bob.totalsByCurrency).toEqual([{ currency: "USDC", count: 1, totalAmount: "99" }]);
  });
});

describe("date boundaries and grouping", () => {
  beforeEach(() => {
    buy("res-1", "1", "2026-07-31T23:59:59.999Z", "buyer");
    buy("res-2", "2", "2026-08-01T00:00:00.000Z", "buyer");
    buy("res-3", "3", "2026-08-15T12:00:00.000Z", "buyer");
    buy("res-4", "4", "2026-08-31T00:00:00.000Z", "buyer");
    buy("res-5", "5", "2026-09-01T00:00:00.000Z", "buyer");
  });

  it("treats since and until bounds as inclusive", () => {
    const summary = buildSpendingSummary(
      normalizeSpendingSummaryOptions({
        since: "2026-08-01",
        until: "2026-08-31T00:00:00.000Z",
      }),
      { profile: "buyer" },
    );

    expect(summary.count).toBe(3);
    expect(summary.totalsByCurrency).toEqual([{ currency: "USDC", count: 3, totalAmount: "9" }]);
  });

  it("supports day, month, and none groupBy modes, newest period first", () => {
    const byDay = buildSpendingSummary(
      normalizeSpendingSummaryOptions({
        since: "2026-08-01",
        until: "2026-08-31T23:59:59.999Z",
        groupBy: "day",
      }),
      { profile: "buyer" },
    );
    expect(byDay.summaries.map((s) => s.period)).toEqual([
      "2026-08-31",
      "2026-08-15",
      "2026-08-01",
    ]);

    const none = buildSpendingSummary(normalizeSpendingSummaryOptions({ groupBy: "none" }), {
      profile: "buyer",
    });
    expect(none.summaries).toEqual([
      { period: "all", currency: "USDC", count: 5, totalAmount: "15" },
    ]);
  });

  it("rejects inverted date ranges and invalid bounds", () => {
    expect(() =>
      normalizeSpendingSummaryOptions({ since: "2026-09-01", until: "2026-08-01" }),
    ).toThrow(SpendingSummaryError);

    expect(() => normalizeSpendingSummaryOptions({ since: "not-a-date" })).toThrow(
      SpendingSummaryError,
    );
  });
});

describe("empty history", () => {
  it("returns zero counts and empty buckets when no purchases file exists", () => {
    const summary = JSON.parse(spendingSummaryTool({}, { profile: "default" }));

    expect(summary.count).toBe(0);
    expect(summary.totalsByCurrency).toEqual([]);
    expect(summary.summaries).toEqual([]);
    expect(summary.dataSource).toBe("~/.mindvault/purchases.json");
    expect(summary.message).toContain("default");
    for (const key of SPENDING_SUMMARY_OUTPUT_SCHEMA.required) {
      expect(summary).toHaveProperty(key);
    }
  });

  it("returns zero counts when the store has receipts only for other profiles", () => {
    writeFileSync(
      file,
      JSON.stringify({
        version: PURCHASE_HISTORY_VERSION,
        purchases: [
          {
            resourceId: "res-1",
            amount: "10",
            network: "stellar:testnet",
            txHash: null,
            receiptRef: null,
            timestamp: "2026-08-01T00:00:00.000Z",
            profile: "other",
          },
        ],
      }),
      "utf-8",
    );

    const summary = JSON.parse(spendingSummaryTool({}, { profile: "active" }));
    expect(summary.count).toBe(0);
    expect(summary.totalsByCurrency).toEqual([]);
    expect(summary.summaries).toEqual([]);
  });
});
