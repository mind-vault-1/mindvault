/**
 * Profile-scoped purchase spending summary for the MindVault MCP server.
 *
 * Reads locally persisted purchase receipts (~/.mindvault/purchases.json, or
 * MINDVAULT_PURCHASES_FILE) for the active wallet profile and aggregates spend
 * by currency and time range using exact BigInt stroop arithmetic.
 */

import { listPurchases, type PurchaseReceipt } from "./purchaseHistory.js";
import { RECEIPT_CURRENCY } from "./receipts.js";
import { stroopsToUsdc, trimUsdc, usdcToStroops } from "./usdcAmount.js";

export const SPENDING_SUMMARY_SCHEMA = "mindvault.spending-summary/v1";

export type SpendingSummaryGroupBy = "day" | "month" | "none";

export interface SpendingSummaryOptions {
  since?: string;
  until?: string;
  groupBy: SpendingSummaryGroupBy;
  network?: string;
}

export interface SpendingBucket {
  /** Time bucket ("YYYY-MM", "YYYY-MM-DD", or "all" when groupBy is "none"). */
  period: string;
  currency: string;
  count: number;
  totalAmount: string;
}

export interface CurrencySpendTotal {
  currency: string;
  count: number;
  totalAmount: string;
}

export interface SpendingSummary {
  schema: typeof SPENDING_SUMMARY_SCHEMA;
  profile: string;
  dataSource: string;
  filters: {
    network: string | null;
    since: string | null;
    until: string | null;
    groupBy: SpendingSummaryGroupBy;
  };
  count: number;
  totalsByCurrency: CurrencySpendTotal[];
  summaries: SpendingBucket[];
  message?: string;
}

export class SpendingSummaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendingSummaryError";
  }
}

function optionalTrimmed(args: Record<string, unknown>, field: string): string | undefined {
  const value = args[field];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new SpendingSummaryError(`Invalid ${field}: expected a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) throw new SpendingSummaryError(`Invalid ${field}: expected a non-empty string.`);
  return trimmed;
}

/**
 * Parse an ISO-8601 date or timestamp bound. Bare dates (e.g. "2026-08-01")
 * are read as midnight UTC, matching mindvault_export_receipts.
 */
function parseBound(args: Record<string, unknown>, field: string): string | undefined {
  const raw = optionalTrimmed(args, field);
  if (raw === undefined) return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    throw new SpendingSummaryError(
      `Invalid ${field}: expected an ISO-8601 date or timestamp, e.g. "2026-08-01" or "2026-08-01T12:00:00Z".`,
    );
  }
  return new Date(ms).toISOString();
}

export function normalizeSpendingSummaryOptions(
  args: Record<string, unknown> | undefined,
): SpendingSummaryOptions {
  const raw = args ?? {};

  const since = parseBound(raw, "since");
  const until = parseBound(raw, "until");
  if (since && until && since > until) {
    throw new SpendingSummaryError("Invalid date range: since cannot be later than until.");
  }

  let groupBy: SpendingSummaryGroupBy = "month";
  if (raw.groupBy !== undefined && raw.groupBy !== null && raw.groupBy !== "") {
    if (raw.groupBy !== "day" && raw.groupBy !== "month" && raw.groupBy !== "none") {
      throw new SpendingSummaryError('Invalid groupBy: must be "day", "month", or "none".');
    }
    groupBy = raw.groupBy;
  }

  const network = optionalTrimmed(raw, "network");

  return {
    ...(since ? { since } : {}),
    ...(until ? { until } : {}),
    groupBy,
    ...(network ? { network } : {}),
  };
}

function currencyOf(receipt: PurchaseReceipt): string {
  const maybeCurrency = (receipt as PurchaseReceipt & { currency?: unknown }).currency;
  return typeof maybeCurrency === "string" && maybeCurrency.trim().length > 0
    ? maybeCurrency.trim()
    : RECEIPT_CURRENCY;
}

function periodOf(timestamp: string, groupBy: SpendingSummaryGroupBy): string {
  if (groupBy === "none") return "all";
  if (groupBy === "day") return timestamp.slice(0, 10);
  return timestamp.slice(0, 7);
}

function formatStroops(stroops: bigint): string {
  return trimUsdc(stroopsToUsdc(stroops)) || "0";
}

/**
 * Build a profile-scoped spending summary from locally persisted purchase receipts.
 */
export function buildSpendingSummary(
  options: SpendingSummaryOptions,
  context: { profile: string },
): SpendingSummary {
  const profile = context.profile;
  const scoped = listPurchases({
    profile,
    ...(options.network ? { network: options.network } : {}),
  });

  const matching = scoped.filter((r) => {
    if (options.since && r.timestamp < options.since) return false;
    if (options.until && r.timestamp > options.until) return false;
    return true;
  });

  const bucketMap = new Map<
    string,
    { period: string; currency: string; count: number; stroops: bigint }
  >();
  const currencyMap = new Map<string, { count: number; stroops: bigint }>();

  for (const receipt of matching) {
    const currency = currencyOf(receipt);
    const period = periodOf(receipt.timestamp, options.groupBy);
    const stroops = usdcToStroops(receipt.amount) ?? 0n;

    const bucketKey = `${period}\0${currency}`;
    const existingBucket = bucketMap.get(bucketKey);
    if (existingBucket) {
      existingBucket.count += 1;
      existingBucket.stroops += stroops;
    } else {
      bucketMap.set(bucketKey, { period, currency, count: 1, stroops });
    }

    const existingCurrency = currencyMap.get(currency);
    if (existingCurrency) {
      existingCurrency.count += 1;
      existingCurrency.stroops += stroops;
    } else {
      currencyMap.set(currency, { count: 1, stroops });
    }
  }

  const summaries: SpendingBucket[] = [...bucketMap.values()]
    .sort((a, b) => {
      if (a.period !== b.period) return a.period < b.period ? 1 : -1;
      return a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0;
    })
    .map((b) => ({
      period: b.period,
      currency: b.currency,
      count: b.count,
      totalAmount: formatStroops(b.stroops),
    }));

  const totalsByCurrency: CurrencySpendTotal[] = [...currencyMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([currency, agg]) => ({
      currency,
      count: agg.count,
      totalAmount: formatStroops(agg.stroops),
    }));

  return {
    schema: SPENDING_SUMMARY_SCHEMA,
    profile,
    dataSource: "~/.mindvault/purchases.json",
    filters: {
      network: options.network ?? null,
      since: options.since ?? null,
      until: options.until ?? null,
      groupBy: options.groupBy,
    },
    count: matching.length,
    totalsByCurrency,
    summaries,
    ...(matching.length === 0
      ? {
          message: `No purchase receipts match the given filters for profile "${profile}" in ~/.mindvault/purchases.json.`,
        }
      : {}),
  };
}

/** Read-only MCP tool entrypoint for mindvault_spending_summary. */
export function spendingSummaryTool(
  args: Record<string, unknown> | undefined,
  options: { profile: string },
): string {
  const normalized = normalizeSpendingSummaryOptions(args);
  return JSON.stringify(buildSpendingSummary(normalized, options), null, 2);
}

export const SPENDING_SUMMARY_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    schema: { type: "string", const: SPENDING_SUMMARY_SCHEMA },
    profile: { type: "string", description: "Active wallet profile the summary is scoped to." },
    dataSource: {
      type: "string",
      description: "Local purchase receipt store path (~/.mindvault/purchases.json).",
    },
    filters: {
      type: "object",
      properties: {
        network: { type: ["string", "null"] },
        since: { type: ["string", "null"] },
        until: { type: ["string", "null"] },
        groupBy: { type: "string", enum: ["day", "month", "none"] },
      },
      required: ["network", "since", "until", "groupBy"],
    },
    count: { type: "integer", description: "Total matching purchase receipts for this profile." },
    totalsByCurrency: {
      type: "array",
      description: "Exact decimal totals across the matched range, grouped by currency.",
      items: {
        type: "object",
        properties: {
          currency: { type: "string" },
          count: { type: "integer" },
          totalAmount: { type: "string" },
        },
        required: ["currency", "count", "totalAmount"],
      },
    },
    summaries: {
      type: "array",
      description: "Exact decimal totals grouped by time period and currency, newest period first.",
      items: {
        type: "object",
        properties: {
          period: { type: "string" },
          currency: { type: "string" },
          count: { type: "integer" },
          totalAmount: { type: "string" },
        },
        required: ["period", "currency", "count", "totalAmount"],
      },
    },
    message: { type: "string" },
  },
  required: [
    "schema",
    "profile",
    "dataSource",
    "filters",
    "count",
    "totalsByCurrency",
    "summaries",
  ],
} as const;
