/**
 * Tests for local-only validation mode (#1249).
 *
 * These are deliberately pure: runLocalValidation and validateLocalArguments
 * take an explicit environment, perform no I/O, and never dispatch a tool.
 */
import { describe, expect, it } from "vitest";
import {
  LOCAL_VALIDATION_OUTPUT_SCHEMA,
  localValidationEnabled,
  runLocalValidation,
  validateLocalArguments,
} from "./localValidation.js";
import { checkOutput } from "./outputValidation.js";

const cleanEnv: NodeJS.ProcessEnv = { STELLAR_NETWORK: "testnet" };

describe("localValidationEnabled", () => {
  it("accepts the documented truthy values case-insensitively", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on"]) {
      expect(localValidationEnabled({ MINDVAULT_LOCAL_VALIDATION: value })).toBe(true);
    }
  });

  it("stays off when unset or falsy", () => {
    expect(localValidationEnabled({})).toBe(false);
    for (const value of ["0", "false", "no", "off", "", "enabled"]) {
      expect(localValidationEnabled({ MINDVAULT_LOCAL_VALIDATION: value })).toBe(false);
    }
  });
});

describe("validateLocalArguments", () => {
  it("uses the shared specs for normal tools", () => {
    expect(validateLocalArguments("mindvault_browse", { query: "data", limit: 5 })).toEqual([]);
    expect(validateLocalArguments("mindvault_browse", { limit: "five" }).length).toBeGreaterThan(0);
  });

  it("validates self-validating tools against their advertised input schema", () => {
    expect(
      validateLocalArguments("mindvault_publish_batch", { items: "not-an-array" }).length,
    ).toBeGreaterThan(0);
  });

  it("reports unknown tools rather than throwing", () => {
    expect(validateLocalArguments("mindvault_does_not_exist", {})).toEqual([
      expect.objectContaining({ field: "tool", code: "unknown_argument" }),
    ]);
  });
});

describe("runLocalValidation", () => {
  it("returns a conforming report for a valid call", () => {
    const report = runLocalValidation({
      env: cleanEnv,
      tool: "mindvault_browse",
      args: { query: "data", limit: 5 },
    });

    expect(report).toMatchObject({
      schema: "mindvault.local-validation/v1",
      mode: "local-only",
      ok: true,
      noOutbound: true,
      tool: "mindvault_browse",
      arguments: { status: "pass", issues: [] },
    });
    expect(["pass", "warn"]).toContain(report.configuration.status);
    expect(report.limitations.length).toBeGreaterThan(0);
    expect(checkOutput(LOCAL_VALIDATION_OUTPUT_SCHEMA as Record<string, unknown>, report)).toEqual({
      valid: true,
    });
  });

  it("fails the report when arguments are invalid", () => {
    const report = runLocalValidation({
      env: cleanEnv,
      tool: "mindvault_browse",
      args: { limit: "five" },
    });

    expect(report.ok).toBe(false);
    expect(report.arguments.status).toBe("fail");
    expect(report.arguments.issues.length).toBeGreaterThan(0);
  });

  it("fails the report on blocking configuration diagnostics", () => {
    const report = runLocalValidation({
      env: { STELLAR_NETWORK: "mainnet", MINDVAULT_RECEIPT_RETENTION_DAYS: "0" },
      tool: "mindvault_browse",
      args: {},
    });

    expect(report.ok).toBe(false);
    expect(report.configuration.status).toBe("fail");
    expect(report.configuration.diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of report.configuration.diagnostics) {
      expect(diagnostic.severity).toBe("error");
    }
  });

  it("does not change when process.env changes", () => {
    const before = runLocalValidation({ env: cleanEnv, tool: "mindvault_wallet_info", args: {} });
    process.env.MINDVAULT_LOCAL_VALIDATION = "1";
    const after = runLocalValidation({ env: cleanEnv, tool: "mindvault_wallet_info", args: {} });
    delete process.env.MINDVAULT_LOCAL_VALIDATION;

    expect(after).toEqual(before);
  });
});
