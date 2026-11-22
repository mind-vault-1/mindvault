import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ERROR_CODES } from "./errorCodes.js";
import { stageForErrorCode } from "./paymentRetry.js";
import { purchaseStatusOf, type PurchaseReceipt } from "./purchaseHistory.js";
import { SETTLED_TRANSACTION_STATUSES, skippedSettlementMessage } from "./settlement.js";

const doc = readFileSync(
  join(
    dirname(dirname(fileURLToPath(import.meta.url))),
    "..",
    "docs",
    "mcp-receipt-consistency.md",
  ),
  "utf-8",
);

const receipt = (txHash: string | null): PurchaseReceipt => ({
  resourceId: "abc123",
  amount: "1.5",
  network: "stellar:testnet",
  txHash,
  timestamp: "2026-08-25T11:59:07.000Z",
  receiptRef: null,
});

describe("docs/mcp-receipt-consistency.md — staleness guard", () => {
  it("maps the receipt classifier to the documented states", () => {
    expect(purchaseStatusOf(receipt("c0ffee01"))).toBe("settled");
    expect(purchaseStatusOf(receipt(null))).toBe("pending");
    expect(doc).toContain('`status: "settled"`');
    expect(doc).toContain('`status: "pending"`');
    expect(doc).toContain('"status": "unknown"');
  });

  it("documents the terminal and non-terminal transaction statuses", () => {
    for (const status of SETTLED_TRANSACTION_STATUSES) {
      expect(doc, `${status} is not documented`).toContain(`\`${status}\``);
    }
    for (const status of ["NOT_FOUND", "IN_PROGRESS", "UNKNOWN"]) {
      expect(doc, `${status} is not documented as non-terminal`).toContain(`\`${status}\``);
    }
  });

  it("quotes the current settlement messages", () => {
    expect(doc).toContain(skippedSettlementMessage("no-wait"));
    expect(doc).toContain(skippedSettlementMessage("no-tx-hash"));
  });

  it("quotes the recovery action for each documented payment error", () => {
    const codes = [
      "MV_PAYMENT_REQUIRED",
      "MV_PAYMENT_CEILING_EXCEEDED",
      "MV_INSUFFICIENT_FUNDS",
      "MV_PAYMENT_REJECTED",
    ] as const;
    for (const code of codes) {
      expect(doc, `${code} is not documented`).toContain(code);
      expect(doc, `${code} has the wrong action`).toContain(ERROR_CODES[code].action);
      expect(stageForErrorCode(code)).not.toBeNull();
    }
  });

  it("does not claim a timeout maps to a payment stage", () => {
    expect(stageForErrorCode("MV_TIMEOUT")).toBeNull();
    expect(doc).toContain("`MV_TIMEOUT` by itself maps to no payment stage");
  });
});
