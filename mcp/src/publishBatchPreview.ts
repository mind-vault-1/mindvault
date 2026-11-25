/**
 * Offline, read-only validation preview for `mindvault_publish_batch`.
 *
 * A batch publish signs payments and a Soroban transaction. By the time an
 * agent discovers a malformed price or a private external URL, the wallet may
 * already have paid for the earlier items. This module applies the same
 * per-item rules the real dispatcher uses, in one deterministic pass, without
 * signing, paying, fetching, or writing anything.
 *
 * The result is a structured report with one entry per submitted item so an
 * agent can fix only the bad rows. It is advisory: `mindvault_publish_batch`
 * remains the authoritative validator at dispatch time.
 */

import {
  isBlockedAddress,
  isBlockedHostname,
  isHostAllowlisted,
  parseUrlAllowlist,
} from "./outboundUrl.js";
import { checkUsdcAmountInput, sumUsdc, trimUsdc, USDC_AMOUNT_FORMAT } from "./usdcAmount.js";

/** Schema identifier carried by every preview result. */
export const PUBLISH_BATCH_PREVIEW_SCHEMA = "mindvault.publish-batch-preview/v1";

/** Same bound the real batch publisher advertises. */
export const PUBLISH_BATCH_PREVIEW_MAX_ITEMS = 10;

export interface PublishBatchPreviewIssue {
  field: string;
  code: string;
  message: string;
}

export interface NormalizedPreviewItem {
  title: string;
  description: string | null;
  price: string;
  externalUrl: string;
}

export interface PublishBatchPreviewItem {
  index: number;
  valid: boolean;
  issues: PublishBatchPreviewIssue[];
  normalized: NormalizedPreviewItem | null;
}

export class PublishBatchPreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishBatchPreviewError";
  }
}

/** Validate the batch envelope (item count), then each item independently. */
export function previewPublishBatch(
  args: Record<string, unknown> | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = args ?? {};
  const items = raw.items;
  if (!Array.isArray(items)) {
    throw new PublishBatchPreviewError(
      "Invalid items: expected an array of 1–10 resource objects.",
    );
  }
  if (items.length < 1 || items.length > PUBLISH_BATCH_PREVIEW_MAX_ITEMS) {
    throw new PublishBatchPreviewError(
      `Invalid items: expected 1–${PUBLISH_BATCH_PREVIEW_MAX_ITEMS} resources, got ${items.length}.`,
    );
  }

  const allowlist = parseUrlAllowlist(env.MINDVAULT_URL_ALLOWLIST);
  const previews: PublishBatchPreviewItem[] = items.map((item, index) =>
    previewItem(item, index, allowlist),
  );
  const validCount = previews.filter((item) => item.valid).length;
  const prices = previews.flatMap((item) => (item.normalized ? [item.normalized.price] : []));
  const valid = validCount === previews.length;

  return JSON.stringify(
    {
      schema: PUBLISH_BATCH_PREVIEW_SCHEMA,
      itemCount: items.length,
      valid,
      summary: {
        validCount,
        invalidCount: items.length - validCount,
        totalValidUsdc: trimUsdc(sumUsdc(prices)) || "0",
        estimatedVerificationFeeCount: items.length,
      },
      items: previews,
      nextStep: valid
        ? "All items passed offline validation. Call mindvault_publish_batch to sign and pay."
        : "Fix the listed issues and run this preview again before mindvault_publish_batch.",
    },
    null,
    2,
  );
}

function previewItem(
  value: unknown,
  index: number,
  allowlist: ReturnType<typeof parseUrlAllowlist>,
): PublishBatchPreviewItem {
  const issues: PublishBatchPreviewIssue[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push({
      field: `items[${index}]`,
      code: "not_an_object",
      message: "Expected a resource object.",
    });
    return { index, valid: false, issues, normalized: null };
  }
  const item = value as Record<string, unknown>;

  const title = requiredTrimmed(item, "title", 256, issues, index);
  const description = optionalTrimmed(item, "description", 2048, issues, index);
  const price = priceValue(item, issues, index);
  const externalUrl = externalUrlValue(item, allowlist, issues, index);

  return {
    index,
    valid: issues.length === 0,
    issues,
    normalized:
      issues.length === 0
        ? {
            title: title!,
            description: description ?? null,
            price: price!,
            externalUrl: externalUrl!,
          }
        : null,
  };
}

function issue(
  issues: PublishBatchPreviewIssue[],
  index: number,
  field: string,
  code: string,
  message: string,
): void {
  issues.push({ field: `items[${index}].${field}`, code, message });
}

function requiredTrimmed(
  item: Record<string, unknown>,
  field: string,
  maxLength: number,
  issues: PublishBatchPreviewIssue[],
  index: number,
): string | undefined {
  const value = item[field];
  if (typeof value !== "string" || value.trim() === "") {
    issue(issues, index, field, "required", `Expected a non-empty ${field}.`);
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    issue(issues, index, field, "too_long", `Expected at most ${maxLength} characters.`);
    return undefined;
  }
  return trimmed;
}

function optionalTrimmed(
  item: Record<string, unknown>,
  field: string,
  maxLength: number,
  issues: PublishBatchPreviewIssue[],
  index: number,
): string | undefined {
  const value = item[field];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    issue(issues, index, field, "not_a_string", `Expected a string ${field}.`);
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    issue(issues, index, field, "too_long", `Expected at most ${maxLength} characters.`);
    return undefined;
  }
  return trimmed || undefined;
}

function priceValue(
  item: Record<string, unknown>,
  issues: PublishBatchPreviewIssue[],
  index: number,
): string | undefined {
  const value = item.price;
  if (typeof value !== "string" || value.trim() === "") {
    issue(
      issues,
      index,
      "price",
      "required",
      `Expected a non-empty price. Use ${USDC_AMOUNT_FORMAT}.`,
    );
    return undefined;
  }
  const check = checkUsdcAmountInput(value, { positive: true });
  if (!check.ok) {
    issue(issues, index, "price", check.problem, check.message);
    return undefined;
  }
  return check.amount;
}

function externalUrlValue(
  item: Record<string, unknown>,
  allowlist: ReturnType<typeof parseUrlAllowlist>,
  issues: PublishBatchPreviewIssue[],
  index: number,
): string | undefined {
  const value = item.externalUrl;
  if (typeof value !== "string" || value.trim() === "") {
    issue(issues, index, "externalUrl", "required", "Expected a non-empty http(s) URL.");
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > 2048) {
    issue(issues, index, "externalUrl", "too_long", "Expected at most 2048 characters.");
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    issue(issues, index, "externalUrl", "malformed", "Expected an absolute http(s) URL.");
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    issue(
      issues,
      index,
      "externalUrl",
      "unsupported_scheme",
      "Only http and https URLs are accepted.",
    );
    return undefined;
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!isHostAllowlisted(host, allowlist) && (isBlockedHostname(host) || isBlockedAddress(host))) {
    issue(
      issues,
      index,
      "externalUrl",
      "blocked_host",
      "Private, loopback, and link-local hosts are rejected unless MINDVAULT_URL_ALLOWLIST opts them in.",
    );
    return undefined;
  }
  return trimmed;
}

/** JSON Schema for the preview envelope, advertised as the tool's outputSchema. */
export const PUBLISH_BATCH_PREVIEW_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    schema: { type: "string", const: PUBLISH_BATCH_PREVIEW_SCHEMA },
    itemCount: { type: "integer", minimum: 1, maximum: PUBLISH_BATCH_PREVIEW_MAX_ITEMS },
    valid: { type: "boolean" },
    summary: {
      type: "object",
      properties: {
        validCount: { type: "integer" },
        invalidCount: { type: "integer" },
        totalValidUsdc: { type: "string" },
        estimatedVerificationFeeCount: { type: "integer" },
      },
      required: ["validCount", "invalidCount", "totalValidUsdc", "estimatedVerificationFeeCount"],
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          valid: { type: "boolean" },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string" },
                code: { type: "string" },
                message: { type: "string" },
              },
              required: ["field", "code", "message"],
            },
          },
          normalized: {
            type: ["object", "null"],
            properties: {
              title: { type: "string" },
              description: { type: ["string", "null"] },
              price: { type: "string" },
              externalUrl: { type: "string" },
            },
            required: ["title", "description", "price", "externalUrl"],
          },
        },
        required: ["index", "valid", "issues", "normalized"],
      },
    },
    nextStep: { type: "string" },
  },
  required: ["schema", "itemCount", "valid", "summary", "items", "nextStep"],
} as const;
