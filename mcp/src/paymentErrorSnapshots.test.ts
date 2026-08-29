/**
 * Snapshot tests for normalized payment-failure error messages (#661).
 *
 * The MCP error-mapping layer (`errorMapping.ts`) must produce a single,
 * deterministic text representation for every payment failure class an
 * agent can encounter.  Snapshotting these outputs gives us a regression
 * baseline: any change to the error format — message text, classification
 * line, or action advice — will surface as a failed snapshot update rather
 * than a silent behaviour change.
 *
 * Coverage:
 *   1. HTTP 402 from the x402 payment layer (payment rejected at facilitator)
 *   2. HTTP 402 with an empty / missing body (facilitator returns no detail)
 *   3. Transport-level abort during payment (AbortError / timeout)
 *   4. Network error reaching the x402 facilitator (fetch failed)
 *   5. HTTP 402 from the MindVault API (resource-level payment required)
 *   6. Soroban RPC error during payment settlement (contract-level failure)
 *   7. Registry not-found error (resource not registered, no payment path)
 *   8. x402 HTTP 500 during settlement (facilitator server error)
 */
import { describe, it, expect } from "vitest";
import {
  formatMappedError,
  mapHttpError,
  mapRegistryError,
  mapTransportError,
} from "./errorMapping.js";

describe("payment failure error snapshots", () => {
  // ── 1. HTTP 402 from the x402 layer ────────────────────────────────────────
  it("x402 payment rejected (402 with detail)", () => {
    const text = formatMappedError(
      mapHttpError({
        operation: "Buy failed [402]",
        source: "x402",
        status: 402,
        data: { error: "payment rejected: insufficient balance" },
      }),
    );
    expect(text).toMatchSnapshot();
  });

  // ── 2. 402 with empty / missing body ───────────────────────────────────────
  it("x402 payment rejected (402 with no body)", () => {
    const text = formatMappedError(
      mapHttpError({
        operation: "Buy failed [402]",
        source: "x402",
        status: 402,
        data: null,
      }),
    );
    expect(text).toMatchSnapshot();
  });

  // ── 3. AbortError / timeout during payment ─────────────────────────────────
  it("x402 payment aborted (AbortError timeout)", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    const text = formatMappedError(
      mapTransportError({
        operation: "Buy failed",
        source: "x402",
        error: abort,
      }),
    );
    expect(text).toMatchSnapshot();
  });

  // ── 4. Network error reaching facilitator ──────────────────────────────────
  it("x402 network failure (fetch failed)", () => {
    const text = formatMappedError(
      mapTransportError({
        operation: "Buy failed",
        source: "x402",
        error: new Error("fetch failed"),
      }),
    );
    expect(text).toMatchSnapshot();
  });

  // ── 5. HTTP 402 from the MindVault API ─────────────────────────────────────
  it("MindVault API payment required (402)", () => {
    const text = formatMappedError(
      mapHttpError({
        operation: "Buy failed",
        source: "api",
        status: 402,
        data: { error: "payment required to access this resource" },
      }),
    );
    expect(text).toMatchSnapshot();
  });

  // ── 6. Soroban RPC error during settlement ─────────────────────────────────
  it("Soroban RPC payment settlement error", () => {
    const text = formatMappedError(
      mapRegistryError({
        operation: "Payment settlement failed",
        message: '{"code":-32602,"message":"invalid params"}',
        source: "soroban",
      }),
    );
    expect(text).toMatchSnapshot();
  });

  // ── 7. Registry not-found (resource not registered) ───────────────────────
  it("registry not-found during buy (resource not on-chain)", () => {
    const text = formatMappedError(
      mapRegistryError({
        operation: "Registry lookup for buy",
        message: "Resource not found",
        notFound: true,
      }),
    );
    expect(text).toMatchSnapshot();
  });

  // ── 8. Facilitator server error during settlement ──────────────────────────
  it("x402 facilitator server error during settlement (500)", () => {
    const text = formatMappedError(
      mapHttpError({
        operation: "Payment settlement failed",
        source: "x402",
        status: 500,
        data: { error: "internal facilitator error" },
      }),
    );
    expect(text).toMatchSnapshot();
  });

  // ── Determinism guarantee ──────────────────────────────────────────────────
  it("payment error format is deterministic across calls", () => {
    const build = () =>
      formatMappedError(
        mapHttpError({
          operation: "Buy failed [402]",
          source: "x402",
          status: 402,
          data: { error: "stale auth entry" },
        }),
      );
    expect(build()).toBe(build());
    expect(build()).toMatchSnapshot();
  });

  // ── Machine-readable classification line ──────────────────────────────────
  it("payment error always includes Source, Category, and HTTP in classification", () => {
    const text = formatMappedError(
      mapHttpError({
        operation: "Buy failed [402]",
        source: "x402",
        status: 402,
        data: { error: "auth entry expired" },
      }),
    );
    const lines = text.split("\n");
    // Line 1: summary
    expect(lines[0]).toContain("Buy failed [402]");
    // Line 2: machine-readable classification
    expect(lines[1]).toContain("Source: x402 payment");
    expect(lines[1]).toContain("Category: payment");
    expect(lines[1]).toContain("HTTP 402");
    // Line 3: action advice
    expect(lines[2]).toMatch(/^Next: /);
    expect(lines[2]).toContain("mindvault_wallet_info");
    expect(lines).toHaveLength(3);
  });
});
