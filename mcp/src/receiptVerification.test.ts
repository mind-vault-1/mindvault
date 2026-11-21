import { describe, expect, it } from "vitest";
import {
  RECEIPT_VERIFICATION_FIELDS,
  RECEIPT_VERIFICATION_SCHEMA,
  verifyPaymentReceipt,
} from "./receiptVerification.js";
import { RECEIPT_VERIFICATION_OUTPUT_SCHEMA } from "./outputSchemas.js";
import { checkOutput } from "./outputValidation.js";

const SCHEMA = RECEIPT_VERIFICATION_OUTPUT_SCHEMA as unknown as Record<string, unknown>;

const VALID_TX_HASH = "a".repeat(64);

const VALID_RECEIPT = {
  amount: "10.50",
  currency: "USDC",
  txHash: VALID_TX_HASH,
  network: "stellar:testnet",
  resourceId: "cm7x8y9z",
};

describe("verifyPaymentReceipt", () => {
  it("returns valid for a complete, well-formed receipt", () => {
    const result = verifyPaymentReceipt(VALID_RECEIPT);

    expect(result.schema).toBe(RECEIPT_VERIFICATION_SCHEMA);
    expect(result.outcome).toBe("valid");
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.fields.amount).toMatchObject({ outcome: "valid", value: "10.5", code: "ok" });
    expect(result.fields.currency).toMatchObject({ outcome: "valid", value: "USDC", code: "ok" });
    expect(result.fields.txHash).toMatchObject({
      outcome: "valid",
      value: VALID_TX_HASH,
      code: "ok",
    });
    expect(result.fields.network).toMatchObject({
      outcome: "valid",
      value: "stellar:testnet",
      code: "ok",
    });
    expect(result.fields.resourceId).toMatchObject({
      outcome: "valid",
      value: "cm7x8y9z",
      code: "ok",
    });
    expect(checkOutput(SCHEMA, result)).toEqual({ valid: true });
  });

  it("normalizes decimal amount, currency case, txHash case, and network aliases against expectations", () => {
    const result = verifyPaymentReceipt(
      {
        amount: "10.5000000",
        currency: "usdc",
        txHash: "A".repeat(64),
        network: "testnet",
        resourceId: "cm7x8y9z",
      },
      {
        amount: "10.5",
        currency: "USDC",
        txHash: VALID_TX_HASH,
        network: "stellar:testnet",
        resourceId: "cm7x8y9z",
      },
    );

    expect(result.outcome).toBe("valid");
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.fields.network.value).toBe("stellar:testnet");
    expect(result.fields.txHash.value).toBe(VALID_TX_HASH);
    expect(checkOutput(SCHEMA, result)).toEqual({ valid: true });
  });

  describe("malformed receipts (invalid outcome)", () => {
    it.each([null, undefined, "not-an-object", 42, []])(
      "returns invalid with malformed_receipt for non-object input %p",
      (input) => {
        const result = verifyPaymentReceipt(input);

        expect(result.outcome).toBe("invalid");
        expect(result.valid).toBe(false);
        expect(result.issues).toHaveLength(RECEIPT_VERIFICATION_FIELDS.length);
        for (const field of RECEIPT_VERIFICATION_FIELDS) {
          expect(result.fields[field].outcome).toBe("invalid");
          expect(result.fields[field].code).toBe("malformed_receipt");
        }
        expect(checkOutput(SCHEMA, result)).toEqual({ valid: true });
      },
    );

    it("rejects malformed and non-positive amounts", () => {
      const badFormat = verifyPaymentReceipt({ ...VALID_RECEIPT, amount: "1.12345678" });
      expect(badFormat.outcome).toBe("invalid");
      expect(badFormat.fields.amount).toMatchObject({ outcome: "invalid", code: "malformed" });

      const zero = verifyPaymentReceipt({ ...VALID_RECEIPT, amount: "0" });
      expect(zero.outcome).toBe("invalid");
      expect(zero.fields.amount).toMatchObject({ outcome: "invalid", code: "non_positive" });

      const wrongType = verifyPaymentReceipt({ ...VALID_RECEIPT, amount: 10.5 });
      expect(wrongType.outcome).toBe("invalid");
      expect(wrongType.fields.amount).toMatchObject({ outcome: "invalid", code: "malformed" });
    });

    it("rejects unsupported or malformed currency", () => {
      const unsupported = verifyPaymentReceipt({ ...VALID_RECEIPT, currency: "XLM" });
      expect(unsupported.outcome).toBe("invalid");
      expect(unsupported.fields.currency).toMatchObject({
        outcome: "invalid",
        code: "unsupported_currency",
        value: "XLM",
      });

      const malformed = verifyPaymentReceipt({ ...VALID_RECEIPT, currency: "123$" });
      expect(malformed.outcome).toBe("invalid");
      expect(malformed.fields.currency).toMatchObject({ outcome: "invalid", code: "malformed" });
    });

    it("rejects malformed txHash, network, and resourceId", () => {
      const result = verifyPaymentReceipt({
        amount: "5.00",
        currency: "USDC",
        txHash: "not-a-hash",
        network: "???",
        resourceId: "bad resource id!",
      });

      expect(result.outcome).toBe("invalid");
      expect(result.valid).toBe(false);
      expect(result.fields.txHash).toMatchObject({ outcome: "invalid", code: "malformed" });
      expect(result.fields.network).toMatchObject({ outcome: "invalid", code: "malformed" });
      expect(result.fields.resourceId).toMatchObject({ outcome: "invalid", code: "malformed" });
      expect(result.issues.map((i) => i.field)).toEqual(["txHash", "network", "resourceId"]);
      expect(checkOutput(SCHEMA, result)).toEqual({ valid: true });
    });

    it("reports mismatch when receipt fields differ from caller expectations", () => {
      const result = verifyPaymentReceipt(VALID_RECEIPT, {
        amount: "20.00",
        currency: "EURC",
        txHash: "b".repeat(64),
        network: "stellar:pubnet",
        resourceId: "other-res",
      });

      expect(result.outcome).toBe("invalid");
      expect(result.valid).toBe(false);
      for (const field of RECEIPT_VERIFICATION_FIELDS) {
        expect(result.fields[field].outcome).toBe("invalid");
        expect(result.fields[field].code).toBe("mismatch");
      }
      expect(checkOutput(SCHEMA, result)).toEqual({ valid: true });
    });
  });

  describe("partial and indeterminate receipts", () => {
    it("returns indeterminate when txHash is missing (pending receipt)", () => {
      const result = verifyPaymentReceipt({ ...VALID_RECEIPT, txHash: null });

      expect(result.outcome).toBe("indeterminate");
      expect(result.valid).toBe(false);
      expect(result.fields.txHash).toMatchObject({
        outcome: "indeterminate",
        code: "missing",
        value: null,
      });
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({
        field: "txHash",
        outcome: "indeterminate",
        code: "missing",
      });
      expect(checkOutput(SCHEMA, result)).toEqual({ valid: true });
    });

    it("returns indeterminate for an empty receipt object", () => {
      const result = verifyPaymentReceipt({});

      expect(result.outcome).toBe("indeterminate");
      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(5);
      for (const field of RECEIPT_VERIFICATION_FIELDS) {
        expect(result.fields[field]).toMatchObject({
          outcome: "indeterminate",
          code: "missing",
        });
      }
      expect(checkOutput(SCHEMA, result)).toEqual({ valid: true });
    });

    it("returns indeterminate for an unrecognized CAIP-2 network", () => {
      const result = verifyPaymentReceipt({ ...VALID_RECEIPT, network: "eip155:1" });

      expect(result.outcome).toBe("indeterminate");
      expect(result.valid).toBe(false);
      expect(result.fields.network).toMatchObject({
        outcome: "indeterminate",
        code: "unknown_network",
        value: "eip155:1",
      });
      expect(checkOutput(SCHEMA, result)).toEqual({ valid: true });
    });

    it("aggregates to invalid when a partial receipt also has an invalid field", () => {
      const result = verifyPaymentReceipt({
        amount: "not-a-number",
        currency: "USDC",
        txHash: null,
        network: "stellar:testnet",
        resourceId: "cm7x8y9z",
      });

      expect(result.outcome).toBe("invalid");
      expect(result.valid).toBe(false);
      expect(result.fields.amount.outcome).toBe("invalid");
      expect(result.fields.txHash.outcome).toBe("indeterminate");
      expect(result.issues).toHaveLength(2);
      expect(checkOutput(SCHEMA, result)).toEqual({ valid: true });
    });
  });
});
