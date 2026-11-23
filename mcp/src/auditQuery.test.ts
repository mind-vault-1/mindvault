import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUDIT_QUERY_SCHEMA,
  AuditQueryError,
  MAX_AUDIT_QUERY_BYTES,
  queryAuditLog,
  queryAuditLogTool,
} from "./auditQuery.js";

const dir = mkdtempSync(join(tmpdir(), "mindvault-query-"));
const path = join(dir, "audit.jsonl");
afterEach(() => {
  writeFileSync(path, "");
});

describe("bounded audit queries", () => {
  it("composes time, tool, and outcome filters with stable offsets", () => {
    const events = [
      { timestamp: "2026-01-01T00:00:00Z", toolName: "browse", status: "success" },
      { timestamp: "2026-01-02T00:00:00Z", toolName: "buy", status: "error" },
      { timestamp: "2026-01-03T00:00:00Z", toolName: "browse", status: "error" },
      { timestamp: "2026-01-04T00:00:00Z", toolName: "browse", status: "error" },
    ];
    writeFileSync(path, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    const filters = {
      since: "2026-01-02T00:00:00Z",
      tool: "browse",
      outcome: "error" as const,
      limit: 1,
    };
    const first = queryAuditLog(path, filters);
    expect(first.entries).toEqual([events[2]]);
    expect(first.nextOffset).toBe(1);
    const second = queryAuditLog(path, { ...filters, offset: first.nextOffset! });
    expect(second.entries).toEqual([events[3]]);
    expect(second.nextOffset).toBeNull();
  });

  it("rejects invalid limits and dates", () => {
    writeFileSync(path, "");
    expect(() => queryAuditLog(path, { limit: 501 })).toThrow();
    expect(() => queryAuditLog(path, { offset: -1 })).toThrow();
    expect(() => queryAuditLog(path, { since: "invalid" })).toThrow();
  });

  it("caps bytes and reports omitted history", () => {
    writeFileSync(
      path,
      JSON.stringify({ payload: "x".repeat(MAX_AUDIT_QUERY_BYTES) }) +
        "\n" +
        JSON.stringify({ toolName: "latest", status: "success" }) +
        "\n",
    );
    const result = queryAuditLog(path);
    expect(result.truncated).toBe(true);
    expect(result.scannedBytes).toBeLessThanOrEqual(MAX_AUDIT_QUERY_BYTES);
    expect(result.entries).toEqual([{ toolName: "latest", status: "success" }]);
  });
});

describe("mindvault_query_audit_log", () => {
  const env = { MINDVAULT_AUDIT_LOG_FILE: path };

  it("returns a bounded, structured envelope from the configured file", () => {
    writeFileSync(
      path,
      [
        { timestamp: "2026-01-01T00:00:00Z", toolName: "browse", status: "success" },
        { timestamp: "2026-01-02T00:00:00Z", toolName: "buy", status: "error" },
      ]
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
    );

    const parsed = JSON.parse(queryAuditLogTool({ limit: 1 }, env));
    expect(parsed.schema).toBe(AUDIT_QUERY_SCHEMA);
    expect(parsed.source).toBe("MINDVAULT_AUDIT_LOG_FILE");
    expect(parsed.filters).toMatchObject({ limit: 1, offset: 0 });
    expect(parsed.count).toBe(1);
    expect(parsed.nextOffset).toBe(1);
    expect(parsed.truncated).toBe(false);
    expect(parsed.maxScannedBytes).toBe(MAX_AUDIT_QUERY_BYTES);
    expect(parsed.entries).toEqual([
      { timestamp: "2026-01-01T00:00:00Z", toolName: "browse", status: "success" },
    ]);
  });

  it("never accepts a caller-supplied file path", () => {
    writeFileSync(path, "");
    const parsed = JSON.parse(
      queryAuditLogTool({ path: "C:\\secrets\\private.jsonl", limit: 1 }, env),
    );
    expect(parsed.source).toBe("MINDVAULT_AUDIT_LOG_FILE");
  });

  it("fails with an actionable error when no audit file is configured", () => {
    expect(() => queryAuditLogTool({}, {})).toThrow(AuditQueryError);
    expect(() => queryAuditLogTool({}, {})).toThrow(/MINDVAULT_AUDIT_LOG_FILE/);
  });

  it("maps bad filters to deterministic errors", () => {
    expect(() => queryAuditLogTool({ limit: 501 }, env)).toThrow(
      /Invalid limit: expected an integer between 1 and 500/,
    );
    expect(() => queryAuditLogTool({ outcome: "verbose" }, env)).toThrow(
      /Invalid outcome: must be "start", "success", or "error"/,
    );
  });
});
