import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { redactObject } from "./redaction.js";

/** Schema identifier carried by every `mindvault_query_audit_log` result. */
export const AUDIT_QUERY_SCHEMA = "mindvault.audit-query/v1";

/** The only environment variable that may select the audit log file. */
export const AUDIT_QUERY_FILE_ENV = "MINDVAULT_AUDIT_LOG_FILE";

export class AuditQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditQueryError";
  }
}

export interface AuditQuery {
  since?: string;
  until?: string;
  tool?: string;
  outcome?: "start" | "success" | "error";
  offset?: number;
  limit?: number;
}
export const MAX_AUDIT_QUERY_BYTES = 1024 * 1024;
export const MAX_AUDIT_QUERY_RESULTS = 500;

/** Query the latest bounded window of a JSONL audit log. */
export function queryAuditLog(path: string, query: AuditQuery = {}) {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_AUDIT_QUERY_RESULTS)
    throw new RangeError("Invalid limit");
  if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError("Invalid offset");
  const since = query.since === undefined ? null : Date.parse(query.since);
  const until = query.until === undefined ? null : Date.parse(query.until);
  if (since !== null && !Number.isFinite(since)) throw new RangeError("Invalid since");
  if (until !== null && !Number.isFinite(until)) throw new RangeError("Invalid until");
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const bytes = Math.min(size, MAX_AUDIT_QUERY_BYTES);
    const start = size - bytes;
    const buffer = Buffer.alloc(bytes);
    let nread = 0;
    while (nread < bytes) {
      const n = readSync(fd, buffer, nread, bytes - nread, start + nread);
      if (n === 0) break;
      nread += n;
    }
    let text = buffer.subarray(0, nread).toString("utf8");
    if (start > 0) text = text.slice(text.indexOf("\n") + 1);
    if (!text.endsWith("\n")) text = text.slice(0, text.lastIndexOf("\n") + 1);
    const matches: Record<string, unknown>[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (!event || typeof event !== "object" || Array.isArray(event)) continue;
      const time = typeof event.timestamp === "string" ? Date.parse(event.timestamp) : NaN;
      if (since !== null && !(time >= since)) continue;
      if (until !== null && !(time <= until)) continue;
      if (query.tool !== undefined && event.toolName !== query.tool) continue;
      if (query.outcome !== undefined && event.status !== query.outcome) continue;
      matches.push(redactObject(event) as Record<string, unknown>);
    }
    const entries = matches.slice(offset, offset + limit);
    return {
      entries,
      nextOffset: offset + limit < matches.length ? offset + limit : null,
      truncated: start > 0,
      scannedBytes: nread,
    };
  } finally {
    closeSync(fd);
  }
}

/**
 * Tool entrypoint for `mindvault_query_audit_log`.
 *
 * The log path is deliberately not an argument: an agent asking to query the
 * audit log must not be able to turn that into an arbitrary local-file read.
 * Only the operator-provided `MINDVAULT_AUDIT_LOG_FILE` is consulted. The
 * bounded engine above still applies — at most 1 MiB is read, and at most 500
 * entries are returned — so a broad time range cannot make an agent turn do
 * unbounded work.
 */
export function queryAuditLogTool(
  args: Record<string, unknown> | undefined = {},
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = args ?? {};
  const configured = env[AUDIT_QUERY_FILE_ENV]?.trim();
  if (!configured) {
    throw new AuditQueryError(
      `Audit log queries require ${AUDIT_QUERY_FILE_ENV} to name a JSONL audit log file. No file path argument is accepted; ask the operator to set ${AUDIT_QUERY_FILE_ENV}`,
    );
  }

  const since = optionalString(raw, "since");
  const until = optionalString(raw, "until");
  const tool = optionalString(raw, "tool");
  const outcomeValue = optionalString(raw, "outcome");
  if (
    outcomeValue !== undefined &&
    outcomeValue !== "start" &&
    outcomeValue !== "success" &&
    outcomeValue !== "error"
  ) {
    throw new AuditQueryError('Invalid outcome: must be "start", "success", or "error".');
  }
  const limit = optionalInteger(raw, "limit", 1, MAX_AUDIT_QUERY_RESULTS);
  const offset = optionalInteger(raw, "offset", 0, Number.MAX_SAFE_INTEGER);

  let result: ReturnType<typeof queryAuditLog>;
  try {
    result = queryAuditLog(configured, {
      ...(since !== undefined ? { since } : {}),
      ...(until !== undefined ? { until } : {}),
      ...(tool !== undefined ? { tool } : {}),
      ...(outcomeValue !== undefined ? { outcome: outcomeValue } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AuditQueryError(
      `Could not query the configured audit log (${AUDIT_QUERY_FILE_ENV}): ${detail}`,
    );
  }

  return JSON.stringify(
    {
      schema: AUDIT_QUERY_SCHEMA,
      source: AUDIT_QUERY_FILE_ENV,
      filters: {
        since: since ?? null,
        until: until ?? null,
        tool: tool ?? null,
        outcome: outcomeValue ?? null,
        limit: limit ?? 50,
        offset: offset ?? 0,
      },
      count: result.entries.length,
      nextOffset: result.nextOffset,
      truncated: result.truncated,
      scannedBytes: result.scannedBytes,
      maxScannedBytes: MAX_AUDIT_QUERY_BYTES,
      entries: result.entries,
    },
    null,
    2,
  );
}

function optionalString(raw: Record<string, unknown>, field: string): string | undefined {
  const value = raw[field];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new AuditQueryError(`Invalid ${field}: expected a string.`);
  const trimmed = value.trim();
  if (!trimmed) throw new AuditQueryError(`Invalid ${field}: expected a non-empty string.`);
  return trimmed;
}

function optionalInteger(
  raw: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): number | undefined {
  const value = raw[field];
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new AuditQueryError(`Invalid ${field}: expected an integer between ${min} and ${max}.`);
  }
  return parsed;
}
