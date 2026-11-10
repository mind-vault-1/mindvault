import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCorrelationTrace,
  exportCorrelationTrace,
  MAX_TRACE_EXPORT_BYTES,
  MAX_TRACE_EXPORT_SPANS,
  TRACE_EXPORT_SCHEMA,
} from "./traceExport.js";

const dir = mkdtempSync(join(tmpdir(), "mindvault-trace-export-"));
const logPath = join(dir, "audit.jsonl");

afterEach(() => {
  writeFileSync(logPath, "");
});

describe("correlation trace export (#1068)", () => {
  it("exports a full trace across API, payment, and registry operations in chronological order", () => {
    const cid = "mv-1a2b3c4d-e5f6-k7q2p1";
    const otherCid = "mv-9z8y7x6w-a1b2-m3n4p5";
    const rawEvents = [
      {
        timestamp: "2026-06-01T12:00:00.000Z",
        correlationId: cid,
        toolName: "mindvault_buy",
        status: "start",
        details: { resourceId: "res123" },
      },
      {
        timestamp: "2026-06-01T12:00:00.050Z",
        correlationId: otherCid,
        toolName: "mindvault_browse",
        status: "start",
      },
      {
        timestamp: "2026-06-01T12:00:00.100Z",
        correlationId: cid,
        method: "GET",
        endpoint: "/api/resources/res123",
        source: "api",
        status: 402,
        duration: 42,
      },
      {
        timestamp: "2026-06-01T12:00:00.150Z",
        correlationId: cid,
        toolName: "x402-payment",
        status: "start",
        resourceId: "res123",
        network: "testnet",
        message: "Initiating payment: 1.50 USDC",
      },
      {
        timestamp: "2026-06-01T12:00:00.300Z",
        correlationId: cid,
        method: "POST",
        endpoint: "https://horizon-testnet.stellar.org/transactions",
        source: "horizon",
        status: 200,
        duration: 140,
        txHash: "abc123txhash",
      },
      {
        timestamp: "2026-06-01T12:00:00.320Z",
        correlationId: cid,
        toolName: "x402-payment",
        status: "success",
        resourceId: "res123",
        duration: 170,
        txHash: "abc123txhash",
      },
      {
        timestamp: "2026-06-01T12:00:00.450Z",
        correlationId: cid,
        method: "POST",
        endpoint: "https://soroban-testnet.stellar.org",
        source: "soroban",
        status: 200,
        duration: 95,
        txHash: "regtx999",
      },
      {
        timestamp: "2026-06-01T12:00:00.500Z",
        correlationId: cid,
        toolName: "mindvault_buy",
        status: "success",
        duration: 500,
        resourceId: "res123",
        txHash: "abc123txhash",
      },
    ];

    writeFileSync(logPath, rawEvents.map((e) => JSON.stringify(e)).join("\n") + "\n");

    const trace = exportCorrelationTrace(logPath, cid, {
      expectedDomains: ["tool", "api", "payment", "registry"],
    });

    expect(trace.schema).toBe(TRACE_EXPORT_SCHEMA);
    expect(trace.correlationId).toBe(cid);
    expect(trace.isCorrelationId).toBe(true);
    expect(trace.toolName).toBe("mindvault_buy");
    expect(trace.status).toBe("complete");
    expect(trace.complete).toBe(true);
    expect(trace.truncated).toBe(false);
    expect(trace.totalMatched).toBe(7);
    expect(trace.returnedSpans).toBe(7);
    expect(trace.domainsObserved).toEqual(["tool", "api", "payment", "registry"]);
    expect(trace.missingSpans).toEqual([]);
    expect(trace.spans.map((s) => s.domain)).toEqual([
      "tool",
      "api",
      "payment",
      "payment",
      "payment",
      "registry",
      "tool",
    ]);
    expect(trace.spans.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(trace.firstTimestamp).toBe("2026-06-01T12:00:00.000Z");
    expect(trace.lastTimestamp).toBe("2026-06-01T12:00:00.500Z");
  });

  it("redacts sensitive credentials, payment headers, and Stellar secret keys across all spans", () => {
    const cid = "mv-1a2b3c4d-e5f6-k7q2p1";
    const secretKey = "S" + "A".repeat(55);
    const events = [
      {
        timestamp: "2026-06-01T12:00:00.000Z",
        correlationId: cid,
        toolName: "mindvault_publish",
        status: "start",
        details: {
          apiKey: "mv_live_super_secret_token_value",
          secretKey,
          resourceId: "res99",
        },
      },
      {
        timestamp: "2026-06-01T12:00:00.100Z",
        correlationId: cid,
        method: "POST",
        endpoint: "https://user:hunter2@api.mindvault.io/resources",
        source: "api",
        status: 200,
        duration: 30,
        requestPayload: {
          authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
          signerHint: `signed with ${secretKey}`,
        },
      },
      {
        timestamp: "2026-06-01T12:00:00.200Z",
        correlationId: cid,
        toolName: "mindvault_publish",
        status: "success",
        duration: 200,
      },
    ];

    const trace = buildCorrelationTrace(events, cid);
    const serialized = JSON.stringify(trace);

    expect(serialized).not.toContain("mv_live_super_secret_token_value");
    expect(serialized).not.toContain(secretKey);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect((trace.spans[0].entry.details as Record<string, unknown>).apiKey).toBe("[REDACTED]");
  });

  it("explicitly reports missing lifecycle, payment, and expected domain spans", () => {
    const cid = "mv-1a2b3c4d-e5f6-k7q2p1";
    const partialEvents = [
      // Missing tool:start and missing tool:terminal, payment started but never finished, no registry span
      {
        timestamp: "2026-06-01T12:00:00.100Z",
        correlationId: cid,
        method: "GET",
        endpoint: "/api/resources/res1",
        source: "api",
        status: 402,
        duration: 15,
      },
      {
        timestamp: "2026-06-01T12:00:00.200Z",
        correlationId: cid,
        toolName: "x402-payment",
        status: "start",
        resourceId: "res1",
      },
    ];

    const trace = buildCorrelationTrace(partialEvents, cid, {
      expectedDomains: ["api", "payment", "registry"],
    });

    expect(trace.status).toBe("incomplete");
    expect(trace.complete).toBe(false);
    expect(trace.missingSpans.map((m) => m.span)).toEqual([
      "tool:start",
      "tool:terminal",
      "payment:terminal",
      "registry:operation",
    ]);
  });

  it("enforces bounded file reads and maxSpans caps", () => {
    const cid = "mv-1a2b3c4d-e5f6-k7q2p1";
    writeFileSync(
      logPath,
      JSON.stringify({
        timestamp: "2026-06-01T12:00:00.000Z",
        correlationId: cid,
        toolName: "mindvault_buy",
        status: "start",
        padding: "x".repeat(MAX_TRACE_EXPORT_BYTES),
      }) +
        "\n" +
        JSON.stringify({
          timestamp: "2026-06-01T12:00:01.000Z",
          correlationId: cid,
          toolName: "mindvault_buy",
          status: "success",
          duration: 1000,
        }) +
        "\n",
    );

    const trace = exportCorrelationTrace(logPath, cid);
    expect(trace.truncated).toBe(true);
    expect(trace.scannedBytes).toBeLessThanOrEqual(MAX_TRACE_EXPORT_BYTES);
    expect(trace.returnedSpans).toBe(1);
    expect(trace.complete).toBe(false);
    expect(trace.missingSpans.some((m) => m.span === "tool:start")).toBe(true);

    expect(() => exportCorrelationTrace(logPath, "")).toThrow(RangeError);
    expect(() =>
      exportCorrelationTrace(logPath, cid, { maxSpans: MAX_TRACE_EXPORT_SPANS + 1 }),
    ).toThrow(RangeError);
  });
});
