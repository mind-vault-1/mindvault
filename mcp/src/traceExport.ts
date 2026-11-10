/**
 * Bounded request trace export by correlation ID (#1068).
 *
 * Exports the ordered audit and network trace for a single correlation ID
 * across API, payment (x402 / Horizon), and registry (Soroban / registry /
 * sponsored) operations, with automatic secret redaction and explicit missing-
 * span reporting when a trace is incomplete or truncated.
 */

import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { isCorrelationId } from "./correlation.js";
import { redactObject, redactSecrets } from "./redaction.js";

/** Schema identifier for exported correlation traces. */
export const TRACE_EXPORT_SCHEMA = "mindvault.correlation-trace/v1" as const;

/** Maximum bytes read from the tail of an audit log file (1 MiB). */
export const MAX_TRACE_EXPORT_BYTES = 1024 * 1024;

/** Hard cap on the number of spans returned in one trace export. */
export const MAX_TRACE_EXPORT_SPANS = 500;

/** Default maximum number of spans returned when not specified by caller. */
export const DEFAULT_TRACE_EXPORT_SPANS = 200;

/** Stellar secret key pattern for final serialization scrub. */
const STELLAR_SECRET_KEY = /S[A-Z2-7]{55}/g;

/** Logical operation domain a trace span belongs to. */
export type TraceOperationDomain = "tool" | "api" | "payment" | "registry";

/** Normalized span in an exported correlation trace. */
export interface TraceSpan {
  /** Zero-based position in the exported trace. */
  index: number;
  /** Operation domain (`tool`, `api`, `payment`, or `registry`). */
  domain: TraceOperationDomain;
  /** ISO-8601 timestamp recorded on the entry, or empty string if absent. */
  timestamp: string;
  /** Correlation ID tying the span to the request. */
  correlationId: string;
  /** Whether the span came from a lifecycle log or a network request log. */
  kind: "lifecycle" | "network";
  /** Operation name (`toolName` or `<method> <endpoint>`). */
  name: string;
  /** Lifecycle status (`start`/`success`/`error`) or HTTP/RPC status code. */
  status: "start" | "success" | "error" | number;
  /** Recorded duration in milliseconds, if present. */
  durationMs: number | null;
  /** Network source tag (`api`, `x402`, `horizon`, `soroban`, `registry`, `sponsored`). */
  source?: string;
  /** Target resource ID, when present on the entry. */
  resourceId?: string;
  /** On-chain transaction hash, when present on the entry. */
  txHash?: string;
  /** Redacted raw audit log entry. */
  entry: Record<string, unknown>;
}

/** Explicit report for an expected span that was not observed in the trace. */
export interface MissingSpanReport {
  /** Machine-readable span identifier (e.g. `tool:start`, `tool:terminal`, `payment:terminal`, `api:operation`). */
  span: string;
  /** Domain where the missing span was expected. */
  domain: TraceOperationDomain;
  /** Human-readable explanation of why the span is considered missing. */
  reason: string;
}

/** Options controlling bounded trace export and missing-span checks. */
export interface TraceExportOptions {
  /** Maximum spans to return (`1..MAX_TRACE_EXPORT_SPANS`). Defaults to 200. */
  maxSpans?: number;
  /** Maximum bytes to scan from the end of the file (`1..MAX_TRACE_EXPORT_BYTES`). */
  maxBytes?: number;
  /**
   * Optional operation domains expected to appear in this trace
   * (for example `["api", "payment", "registry"]`). Any domain not observed
   * in the matched spans is reported in `missingSpans`.
   */
  expectedDomains?: readonly TraceOperationDomain[];
  /** Internal flag set when the underlying file read omitted older bytes. */
  fileTruncated?: boolean;
  /** Number of bytes scanned from disk when exported from a file. */
  scannedBytes?: number;
}

/** Result of exporting a correlation trace. */
export interface CorrelationTraceExport {
  schema: typeof TRACE_EXPORT_SCHEMA;
  correlationId: string;
  isCorrelationId: boolean;
  toolName: string | null;
  status: "complete" | "incomplete" | "not_found";
  complete: boolean;
  truncated: boolean;
  scannedBytes: number;
  totalMatched: number;
  returnedSpans: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  domainsObserved: TraceOperationDomain[];
  spans: TraceSpan[];
  missingSpans: MissingSpanReport[];
}

function classifyDomain(raw: Record<string, unknown>): TraceOperationDomain {
  const source = typeof raw.source === "string" ? raw.source : undefined;
  if (source === "api") return "api";
  if (source === "x402" || source === "horizon") return "payment";
  if (source === "soroban" || source === "registry" || source === "sponsored") {
    return "registry";
  }

  const toolName = typeof raw.toolName === "string" ? raw.toolName : "";
  if (toolName === "x402-payment") return "payment";
  if (toolName.startsWith("onchain-")) return "registry";
  return "tool";
}

function sanitizeEntry(raw: Record<string, unknown>): Record<string, unknown> {
  const redacted = redactObject(raw) as Record<string, unknown>;
  const serialized = redactSecrets(JSON.stringify(redacted)).replace(
    STELLAR_SECRET_KEY,
    "S***REDACTED***",
  );
  return JSON.parse(serialized) as Record<string, unknown>;
}

function toTraceSpan(
  raw: Record<string, unknown>,
  correlationId: string,
  index: number,
): TraceSpan {
  const entry = sanitizeEntry(raw);
  const domain = classifyDomain(entry);
  const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : "";
  const isNetwork = typeof entry.method === "string" || typeof entry.source === "string";

  const method = typeof entry.method === "string" ? entry.method : "REQUEST";
  const endpoint = typeof entry.endpoint === "string" ? entry.endpoint : "";
  const toolName = typeof entry.toolName === "string" ? entry.toolName : "unknown";

  const status: "start" | "success" | "error" | number =
    typeof entry.status === "number"
      ? entry.status
      : entry.status === "start" || entry.status === "success" || entry.status === "error"
        ? entry.status
        : "error";

  const durationMs =
    typeof entry.duration === "number" && Number.isFinite(entry.duration)
      ? entry.duration
      : null;

  const span: TraceSpan = {
    index,
    domain,
    timestamp,
    correlationId,
    kind: isNetwork ? "network" : "lifecycle",
    name: isNetwork ? `${method} ${endpoint}`.trim() : toolName,
    status,
    durationMs,
    entry,
  };

  if (typeof entry.source === "string") span.source = entry.source;
  if (typeof entry.resourceId === "string") span.resourceId = entry.resourceId;
  if (typeof entry.txHash === "string") span.txHash = entry.txHash;

  return span;
}

/**
 * Build a bounded, redacted correlation trace from an array of parsed audit
 * log objects. Preserves chronological and log sequence ordering and reports
 * any missing lifecycle or domain spans explicitly.
 */
export function buildCorrelationTrace(
  entries: readonly Record<string, unknown>[],
  correlationId: string,
  options: TraceExportOptions = {},
): CorrelationTraceExport {
  const trimmedId = typeof correlationId === "string" ? correlationId.trim() : "";
  if (!trimmedId || trimmedId.length > 128) {
    throw new RangeError("Invalid correlationId: must be a non-empty string up to 128 characters");
  }

  const maxSpans = options.maxSpans ?? DEFAULT_TRACE_EXPORT_SPANS;
  if (!Number.isSafeInteger(maxSpans) || maxSpans < 1 || maxSpans > MAX_TRACE_EXPORT_SPANS) {
    throw new RangeError(`Invalid maxSpans: must be an integer between 1 and ${MAX_TRACE_EXPORT_SPANS}`);
  }

  const matchedWithOrder: Array<{ raw: Record<string, unknown>; seq: number; timeMs: number }> = [];
  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    if (item.correlationId !== trimmedId) continue;
    const ts = typeof item.timestamp === "string" ? Date.parse(item.timestamp) : NaN;
    matchedWithOrder.push({
      raw: item,
      seq: i,
      timeMs: Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY,
    });
  }

  // Sort chronologically while preserving file order for identical or unparseable timestamps.
  matchedWithOrder.sort((a, b) => {
    if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
    return a.seq - b.seq;
  });

  const totalMatched = matchedWithOrder.length;
  const capped = matchedWithOrder.slice(0, maxSpans);
  const truncated = Boolean(options.fileTruncated) || totalMatched > maxSpans;

  const spans = capped.map((item, idx) => toTraceSpan(item.raw, trimmedId, idx));

  const domainOrder: TraceOperationDomain[] = ["tool", "api", "payment", "registry"];
  const observedSet = new Set<TraceOperationDomain>(spans.map((s) => s.domain));
  const domainsObserved = domainOrder.filter((d) => observedSet.has(d));

  const primaryToolSpan = spans.find((s) => s.domain === "tool" && s.kind === "lifecycle");
  const toolName = primaryToolSpan ? primaryToolSpan.name : null;

  const missingSpans: MissingSpanReport[] = [];

  if (totalMatched === 0) {
    missingSpans.push(
      {
        span: "tool:start",
        domain: "tool",
        reason: options.fileTruncated
          ? "No spans matched correlationId within the bounded read window (older log history was truncated)."
          : "No spans matched correlationId in the audit log.",
      },
      {
        span: "tool:terminal",
        domain: "tool",
        reason: "No terminal (success/error) tool span was found for this correlationId.",
      },
    );
  } else {
    const hasToolStart = spans.some(
      (s) => s.domain === "tool" && s.kind === "lifecycle" && s.status === "start",
    );
    const hasToolTerminal = spans.some(
      (s) =>
        s.domain === "tool" &&
        s.kind === "lifecycle" &&
        (s.status === "success" || s.status === "error"),
    );

    if (!hasToolStart) {
      missingSpans.push({
        span: "tool:start",
        domain: "tool",
        reason: options.fileTruncated
          ? "Tool start span is missing (likely evicted before the bounded read window)."
          : "Trace contains operations or terminal events without a tool start span.",
      });
    }

    if (!hasToolTerminal) {
      missingSpans.push({
        span: "tool:terminal",
        domain: "tool",
        reason:
          totalMatched > maxSpans
            ? "Tool terminal (success/error) span was omitted because the trace exceeded maxSpans."
            : "Tool call has no terminal (success/error) span; the request may still be in flight or terminated abruptly.",
      });
    }

    const hasPaymentStart = spans.some(
      (s) => s.domain === "payment" && s.kind === "lifecycle" && s.status === "start",
    );
    const hasPaymentTerminal = spans.some(
      (s) =>
        s.domain === "payment" &&
        s.kind === "lifecycle" &&
        (s.status === "success" || s.status === "error"),
    );

    if (hasPaymentStart && !hasPaymentTerminal) {
      missingSpans.push({
        span: "payment:terminal",
        domain: "payment",
        reason: "Payment initiation (x402-payment start) was logged without a matching payment completion or error span.",
      });
    } else if (!hasPaymentStart && hasPaymentTerminal) {
      missingSpans.push({
        span: "payment:start",
        domain: "payment",
        reason: "Payment completion/error span was logged without a preceding payment initiation span.",
      });
    }
  }

  if (options.expectedDomains) {
    for (const expectedDomain of options.expectedDomains) {
      if (!observedSet.has(expectedDomain)) {
        missingSpans.push({
          span: `${expectedDomain}:operation`,
          domain: expectedDomain,
          reason: `Expected at least one ${expectedDomain} span for correlationId ${trimmedId}, but none was recorded.`,
        });
      }
    }
  }

  const timestamps = spans.map((s) => s.timestamp).filter((t) => t.length > 0);
  const firstTimestamp = timestamps.length > 0 ? timestamps[0] : null;
  const lastTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

  const complete = totalMatched > 0 && missingSpans.length === 0 && !truncated;
  const status: "complete" | "incomplete" | "not_found" =
    totalMatched === 0 ? "not_found" : complete ? "complete" : "incomplete";

  return {
    schema: TRACE_EXPORT_SCHEMA,
    correlationId: trimmedId,
    isCorrelationId: isCorrelationId(trimmedId),
    toolName,
    status,
    complete,
    truncated,
    scannedBytes: options.scannedBytes ?? 0,
    totalMatched,
    returnedSpans: spans.length,
    firstTimestamp,
    lastTimestamp,
    domainsObserved,
    spans,
    missingSpans,
  };
}

/**
 * Export the bounded request trace for `correlationId` from a JSONL audit log file.
 */
export function exportCorrelationTrace(
  path: string,
  correlationId: string,
  options: TraceExportOptions = {},
): CorrelationTraceExport {
  const maxBytes = options.maxBytes ?? MAX_TRACE_EXPORT_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_TRACE_EXPORT_BYTES) {
    throw new RangeError(
      `Invalid maxBytes: must be an integer between 1 and ${MAX_TRACE_EXPORT_BYTES}`,
    );
  }

  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const bytes = Math.min(size, maxBytes);
    const start = size - bytes;
    const buffer = Buffer.alloc(bytes);
    let nread = 0;
    while (nread < bytes) {
      const n = readSync(fd, buffer, nread, bytes - nread, start + nread);
      if (n === 0) break;
      nread += n;
    }

    let text = buffer.subarray(0, nread).toString("utf8");
    if (start > 0) {
      const firstNewline = text.indexOf("\n");
      text = firstNewline === -1 ? "" : text.slice(firstNewline + 1);
    }
    if (text.length > 0 && !text.endsWith("\n")) {
      const lastNewline = text.lastIndexOf("\n");
      text = lastNewline === -1 ? "" : text.slice(0, lastNewline + 1);
    }

    const parsedEntries: Record<string, unknown>[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedEntries.push(parsed as Record<string, unknown>);
        }
      } catch {
        continue;
      }
    }

    return buildCorrelationTrace(parsedEntries, correlationId, {
      ...options,
      fileTruncated: start > 0,
      scannedBytes: nread,
    });
  } finally {
    closeSync(fd);
  }
}
