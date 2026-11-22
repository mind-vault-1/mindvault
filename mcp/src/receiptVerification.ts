/**
 * Machine-readable payment receipt verification.
 *
 * Evaluates a payment receipt across five core fields — amount, currency,
 * transaction hash (`txHash`), network, and resource identity (`resourceId`) —
 * and returns a typed, deterministic verification envelope with per-field
 * outcomes (`valid`, `invalid`, or `indeterminate`) and an aggregated overall
 * outcome.
 *
 * Outcomes:
 *   - `valid`:         all five fields are present, well-formed, supported, and
 *                      match any caller-supplied expectations.
 *   - `invalid`:       the receipt itself is malformed or at least one field is
 *                      malformed, non-positive, unsupported, or mismatches an
 *                      expected value.
 *   - `indeterminate`: no field is invalid, but at least one field is missing
 *                      (partial receipt) or cannot be conclusively validated
 *                      (e.g. an unrecognized CAIP-2 network).
 *
 * Pure: no I/O, no network, no process state.
 */

import { RECEIPT_CURRENCY } from "./receipts.js";
import { stroopsToUsdc, trimUsdc, usdcToStroops } from "./usdcAmount.js";

/** Schema identifier carried by every receipt verification result. */
export const RECEIPT_VERIFICATION_SCHEMA = "mindvault.receipt-verification/v1";

/** Aggregated and per-field verification outcomes. */
export const RECEIPT_VERIFICATION_OUTCOMES = ["valid", "invalid", "indeterminate"] as const;
export type ReceiptVerificationOutcome = (typeof RECEIPT_VERIFICATION_OUTCOMES)[number];

/** The five receipt fields evaluated by verification, in stable order. */
export const RECEIPT_VERIFICATION_FIELDS = [
  "amount",
  "currency",
  "txHash",
  "network",
  "resourceId",
] as const;
export type ReceiptVerificationField = (typeof RECEIPT_VERIFICATION_FIELDS)[number];

/** Machine-readable reason codes for per-field verification results. */
export const RECEIPT_FIELD_REASON_CODES = [
  "ok",
  "missing",
  "malformed",
  "malformed_receipt",
  "non_positive",
  "unsupported_currency",
  "unknown_network",
  "mismatch",
] as const;
export type ReceiptFieldReasonCode = (typeof RECEIPT_FIELD_REASON_CODES)[number];

export interface ReceiptFieldVerification {
  field: ReceiptVerificationField;
  outcome: ReceiptVerificationOutcome;
  /** Normalized field value when parseable, or null when absent/unusable. */
  value: string | null;
  /** Normalized expected value when supplied by the caller, or null. */
  expected: string | null;
  code: ReceiptFieldReasonCode;
  message: string;
}

export interface ReceiptVerificationIssue {
  field: ReceiptVerificationField;
  outcome: Exclude<ReceiptVerificationOutcome, "valid">;
  code: Exclude<ReceiptFieldReasonCode, "ok">;
  message: string;
}

export interface PaymentReceiptVerificationResult {
  schema: typeof RECEIPT_VERIFICATION_SCHEMA;
  outcome: ReceiptVerificationOutcome;
  valid: boolean;
  fields: Record<ReceiptVerificationField, ReceiptFieldVerification>;
  issues: ReceiptVerificationIssue[];
  summary: string;
}

export interface PaymentReceiptExpectations {
  amount?: string;
  currency?: string;
  txHash?: string;
  network?: string;
  resourceId?: string;
}

const TX_HASH_PATTERN = /^[0-9a-fA-F]{64}$/;
const CURRENCY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,15}$/;
const RESOURCE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const CAIP2_NETWORK_PATTERN = /^[a-z0-9-]+:[a-zA-Z0-9._-]+$/;

const NETWORK_ALIASES: Record<string, string> = {
  "stellar:testnet": "stellar:testnet",
  testnet: "stellar:testnet",
  "stellar:pubnet": "stellar:pubnet",
  "stellar:mainnet": "stellar:pubnet",
  pubnet: "stellar:pubnet",
  mainnet: "stellar:pubnet",
  "stellar:futurenet": "stellar:futurenet",
  futurenet: "stellar:futurenet",
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissing(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === "string" && value.trim() === "")
  );
}

function canonicalizeNetwork(raw: string): string | null {
  const lowered = raw.trim().toLowerCase();
  return NETWORK_ALIASES[lowered] ?? null;
}

function verifyAmount(raw: unknown, expectedRaw?: string): ReceiptFieldVerification {
  let expectedNorm: string | null = null;
  let expectedStroops: bigint | null = null;
  if (expectedRaw !== undefined && expectedRaw.trim() !== "") {
    const parsed = usdcToStroops(expectedRaw.trim());
    if (parsed !== null && parsed > 0n) {
      expectedStroops = parsed;
      expectedNorm = trimUsdc(stroopsToUsdc(parsed));
    } else {
      expectedNorm = expectedRaw.trim();
    }
  }

  if (isMissing(raw)) {
    return {
      field: "amount",
      outcome: "indeterminate",
      value: null,
      expected: expectedNorm,
      code: "missing",
      message: "Receipt amount is missing.",
    };
  }

  if (typeof raw !== "string") {
    return {
      field: "amount",
      outcome: "invalid",
      value: null,
      expected: expectedNorm,
      code: "malformed",
      message: "Receipt amount must be a decimal string.",
    };
  }

  const trimmed = raw.trim();
  const stroops = usdcToStroops(trimmed);
  if (stroops === null) {
    return {
      field: "amount",
      outcome: "invalid",
      value: null,
      expected: expectedNorm,
      code: "malformed",
      message: `Receipt amount "${trimmed}" is not a valid decimal USDC amount (up to 7 decimal places).`,
    };
  }

  const normalized = trimUsdc(stroopsToUsdc(stroops));
  if (stroops <= 0n) {
    return {
      field: "amount",
      outcome: "invalid",
      value: normalized,
      expected: expectedNorm,
      code: "non_positive",
      message: "Receipt amount must be greater than zero.",
    };
  }

  if (expectedStroops !== null && stroops !== expectedStroops) {
    return {
      field: "amount",
      outcome: "invalid",
      value: normalized,
      expected: expectedNorm,
      code: "mismatch",
      message: `Receipt amount ${normalized} does not match expected amount ${expectedNorm}.`,
    };
  }

  return {
    field: "amount",
    outcome: "valid",
    value: normalized,
    expected: expectedNorm,
    code: "ok",
    message: expectedNorm
      ? `Receipt amount ${normalized} matches expected amount.`
      : `Receipt amount ${normalized} is valid.`,
  };
}

function verifyCurrency(raw: unknown, expectedRaw?: string): ReceiptFieldVerification {
  const expectedNorm =
    expectedRaw !== undefined && expectedRaw.trim() !== ""
      ? expectedRaw.trim().toUpperCase()
      : null;

  if (isMissing(raw)) {
    return {
      field: "currency",
      outcome: "indeterminate",
      value: null,
      expected: expectedNorm,
      code: "missing",
      message: "Receipt currency is missing.",
    };
  }

  if (typeof raw !== "string") {
    return {
      field: "currency",
      outcome: "invalid",
      value: null,
      expected: expectedNorm,
      code: "malformed",
      message: "Receipt currency must be a string.",
    };
  }

  const trimmed = raw.trim();
  if (!CURRENCY_PATTERN.test(trimmed)) {
    return {
      field: "currency",
      outcome: "invalid",
      value: null,
      expected: expectedNorm,
      code: "malformed",
      message: `Receipt currency "${trimmed}" is malformed.`,
    };
  }

  const normalized = trimmed.toUpperCase();
  if (expectedNorm !== null) {
    if (normalized !== expectedNorm) {
      return {
        field: "currency",
        outcome: "invalid",
        value: normalized,
        expected: expectedNorm,
        code: "mismatch",
        message: `Receipt currency ${normalized} does not match expected currency ${expectedNorm}.`,
      };
    }
    return {
      field: "currency",
      outcome: "valid",
      value: normalized,
      expected: expectedNorm,
      code: "ok",
      message: `Receipt currency ${normalized} matches expected currency.`,
    };
  }

  if (normalized !== RECEIPT_CURRENCY) {
    return {
      field: "currency",
      outcome: "invalid",
      value: normalized,
      expected: RECEIPT_CURRENCY,
      code: "unsupported_currency",
      message: `Receipt currency ${normalized} is not supported (expected ${RECEIPT_CURRENCY}).`,
    };
  }

  return {
    field: "currency",
    outcome: "valid",
    value: normalized,
    expected: null,
    code: "ok",
    message: `Receipt currency ${normalized} is valid.`,
  };
}

function verifyTxHash(raw: unknown, expectedRaw?: string): ReceiptFieldVerification {
  const expectedNorm =
    expectedRaw !== undefined && expectedRaw.trim() !== ""
      ? expectedRaw.trim().toLowerCase()
      : null;

  if (isMissing(raw)) {
    return {
      field: "txHash",
      outcome: "indeterminate",
      value: null,
      expected: expectedNorm,
      code: "missing",
      message: "Receipt transaction hash is missing.",
    };
  }

  if (typeof raw !== "string") {
    return {
      field: "txHash",
      outcome: "invalid",
      value: null,
      expected: expectedNorm,
      code: "malformed",
      message: "Receipt transaction hash must be a 64-character hexadecimal string.",
    };
  }

  const trimmed = raw.trim();
  if (!TX_HASH_PATTERN.test(trimmed)) {
    return {
      field: "txHash",
      outcome: "invalid",
      value: null,
      expected: expectedNorm,
      code: "malformed",
      message: "Receipt transaction hash must be a 64-character hexadecimal string.",
    };
  }

  const normalized = trimmed.toLowerCase();
  if (expectedNorm !== null && normalized !== expectedNorm) {
    return {
      field: "txHash",
      outcome: "invalid",
      value: normalized,
      expected: expectedNorm,
      code: "mismatch",
      message: "Receipt transaction hash does not match expected transaction hash.",
    };
  }

  return {
    field: "txHash",
    outcome: "valid",
    value: normalized,
    expected: expectedNorm,
    code: "ok",
    message: expectedNorm
      ? "Receipt transaction hash matches expected transaction hash."
      : "Receipt transaction hash is valid.",
  };
}

function verifyNetwork(raw: unknown, expectedRaw?: string): ReceiptFieldVerification {
  const expectedTrimmed =
    expectedRaw !== undefined && expectedRaw.trim() !== "" ? expectedRaw.trim() : null;
  const expectedCanonical = expectedTrimmed ? canonicalizeNetwork(expectedTrimmed) : null;
  const expectedNorm = expectedCanonical ?? expectedTrimmed;

  if (isMissing(raw)) {
    return {
      field: "network",
      outcome: "indeterminate",
      value: null,
      expected: expectedNorm,
      code: "missing",
      message: "Receipt network is missing.",
    };
  }

  if (typeof raw !== "string") {
    return {
      field: "network",
      outcome: "invalid",
      value: null,
      expected: expectedNorm,
      code: "malformed",
      message: "Receipt network must be a string.",
    };
  }

  const trimmed = raw.trim();
  const canonical = canonicalizeNetwork(trimmed);

  if (canonical !== null) {
    if (expectedNorm !== null && canonical !== expectedNorm) {
      return {
        field: "network",
        outcome: "invalid",
        value: canonical,
        expected: expectedNorm,
        code: "mismatch",
        message: `Receipt network ${canonical} does not match expected network ${expectedNorm}.`,
      };
    }
    return {
      field: "network",
      outcome: "valid",
      value: canonical,
      expected: expectedNorm,
      code: "ok",
      message: expectedNorm
        ? `Receipt network ${canonical} matches expected network.`
        : `Receipt network ${canonical} is valid.`,
    };
  }

  if (CAIP2_NETWORK_PATTERN.test(trimmed)) {
    const lowered = trimmed.toLowerCase();
    if (expectedNorm !== null && lowered !== expectedNorm.toLowerCase()) {
      return {
        field: "network",
        outcome: "invalid",
        value: lowered,
        expected: expectedNorm,
        code: "mismatch",
        message: `Receipt network ${lowered} does not match expected network ${expectedNorm}.`,
      };
    }
    return {
      field: "network",
      outcome: "indeterminate",
      value: lowered,
      expected: expectedNorm,
      code: "unknown_network",
      message: `Receipt network "${trimmed}" is not a recognized Stellar network.`,
    };
  }

  return {
    field: "network",
    outcome: "invalid",
    value: null,
    expected: expectedNorm,
    code: "malformed",
    message: `Receipt network "${trimmed}" is malformed.`,
  };
}

function verifyResourceId(raw: unknown, expectedRaw?: string): ReceiptFieldVerification {
  const expectedNorm =
    expectedRaw !== undefined && expectedRaw.trim() !== "" ? expectedRaw.trim() : null;

  if (isMissing(raw)) {
    return {
      field: "resourceId",
      outcome: "indeterminate",
      value: null,
      expected: expectedNorm,
      code: "missing",
      message: "Receipt resourceId is missing.",
    };
  }

  if (typeof raw !== "string") {
    return {
      field: "resourceId",
      outcome: "invalid",
      value: null,
      expected: expectedNorm,
      code: "malformed",
      message: "Receipt resourceId must be a string.",
    };
  }

  const trimmed = raw.trim();
  if (!RESOURCE_ID_PATTERN.test(trimmed)) {
    return {
      field: "resourceId",
      outcome: "invalid",
      value: null,
      expected: expectedNorm,
      code: "malformed",
      message: `Receipt resourceId "${trimmed}" is malformed.`,
    };
  }

  if (expectedNorm !== null && trimmed !== expectedNorm) {
    return {
      field: "resourceId",
      outcome: "invalid",
      value: trimmed,
      expected: expectedNorm,
      code: "mismatch",
      message: `Receipt resourceId "${trimmed}" does not match expected resourceId "${expectedNorm}".`,
    };
  }

  return {
    field: "resourceId",
    outcome: "valid",
    value: trimmed,
    expected: expectedNorm,
    code: "ok",
    message: expectedNorm
      ? `Receipt resourceId "${trimmed}" matches expected resourceId.`
      : `Receipt resourceId "${trimmed}" is valid.`,
  };
}

/**
 * Verify a payment receipt and return a machine-readable typed result.
 *
 * Accepts arbitrary `unknown` input so malformed or partial receipts produce a
 * structured `invalid` or `indeterminate` result rather than throwing.
 */
export function verifyPaymentReceipt(
  receipt: unknown,
  expected?: PaymentReceiptExpectations,
): PaymentReceiptVerificationResult {
  if (!isPlainRecord(receipt)) {
    const fields = Object.fromEntries(
      RECEIPT_VERIFICATION_FIELDS.map((field) => [
        field,
        {
          field,
          outcome: "invalid" as const,
          value: null,
          expected: null,
          code: "malformed_receipt" as const,
          message: "Receipt must be a JSON object.",
        },
      ]),
    ) as Record<ReceiptVerificationField, ReceiptFieldVerification>;

    const issues: ReceiptVerificationIssue[] = RECEIPT_VERIFICATION_FIELDS.map((field) => ({
      field,
      outcome: "invalid",
      code: "malformed_receipt",
      message: "Receipt must be a JSON object.",
    }));

    return {
      schema: RECEIPT_VERIFICATION_SCHEMA,
      outcome: "invalid",
      valid: false,
      fields,
      issues,
      summary: "Payment receipt is invalid: expected a JSON object.",
    };
  }

  const exp = isPlainRecord(expected) ? (expected as PaymentReceiptExpectations) : undefined;

  const fields: Record<ReceiptVerificationField, ReceiptFieldVerification> = {
    amount: verifyAmount(receipt.amount, exp?.amount),
    currency: verifyCurrency(receipt.currency, exp?.currency),
    txHash: verifyTxHash(receipt.txHash, exp?.txHash),
    network: verifyNetwork(receipt.network, exp?.network),
    resourceId: verifyResourceId(receipt.resourceId, exp?.resourceId),
  };

  const fieldList = RECEIPT_VERIFICATION_FIELDS.map((name) => fields[name]);
  const issues: ReceiptVerificationIssue[] = [];
  for (const check of fieldList) {
    if (check.outcome !== "valid" && check.code !== "ok") {
      issues.push({
        field: check.field,
        outcome: check.outcome,
        code: check.code,
        message: check.message,
      });
    }
  }

  let outcome: ReceiptVerificationOutcome = "valid";
  if (fieldList.some((check) => check.outcome === "invalid")) {
    outcome = "invalid";
  } else if (fieldList.some((check) => check.outcome === "indeterminate")) {
    outcome = "indeterminate";
  }

  let summary: string;
  if (outcome === "valid") {
    summary = `Payment receipt is valid (${fields.amount.value} ${fields.currency.value} on ${fields.network.value} for ${fields.resourceId.value}).`;
  } else if (outcome === "invalid") {
    const badFields = issues
      .filter((issue) => issue.outcome === "invalid")
      .map((issue) => issue.field)
      .join(", ");
    summary = `Payment receipt is invalid: ${badFields} failed verification.`;
  } else {
    const missingFields = issues.map((issue) => issue.field).join(", ");
    summary = `Payment receipt is indeterminate: ${missingFields} could not be verified.`;
  }

  return {
    schema: RECEIPT_VERIFICATION_SCHEMA,
    outcome,
    valid: outcome === "valid",
    fields,
    issues,
    summary,
  };
}
