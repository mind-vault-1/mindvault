/**
 * Payment and publish amounts typed into tools are refused, never rounded,
 * when they are not plain 7-decimal USDC (#1252).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  MAX_USDC_AMOUNT_STROOPS,
  USDC_AMOUNT_FORMAT,
  checkUsdcAmountInput,
  stroopsToUsdc,
} from "./usdcAmount.js";
import { ToolValidationError, validateToolArgs } from "./validation.js";

process.env.MINDVAULT_MOCK = "1";
process.env.STELLAR_NETWORK = "testnet";
const home = mkdtempSync(join(tmpdir(), "mindvault-mcp-amount-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

const MAX = stroopsToUsdc(MAX_USDC_AMOUNT_STROOPS);

describe("checkUsdcAmountInput", () => {
  it.each([
    ["1e5", "exponent"],
    ["1E5", "exponent"],
    ["1e-7", "exponent"],
    ["5.5e+2", "exponent"],
    [".5e1", "exponent"],
    ["-1e3", "exponent"],
    ["-1", "negative"],
    ["-0.5", "negative"],
    ["-.5", "negative"],
    ["1.00000001", "excess_precision"],
    ["0.12345678", "excess_precision"],
    ["+1", "malformed"],
    ["1.", "malformed"],
    [".5", "malformed"],
    ["0x10", "malformed"],
    ["1,000", "malformed"],
    ["Infinity", "malformed"],
    ["NaN", "malformed"],
    ["1 000", "malformed"],
  ])("refuses %j as %s", (input, problem) => {
    const check = checkUsdcAmountInput(input);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.problem).toBe(problem);
    expect(check.message).toContain(USDC_AMOUNT_FORMAT);
  });

  it("never repeats the refused value in the message", () => {
    for (const input of ["987654e3", "-4242", "3.141592653"]) {
      const check = checkUsdcAmountInput(input);
      expect(check.ok).toBe(false);
      if (!check.ok) expect(check.message).not.toContain(input);
    }
  });

  it.each([
    ["5", 50_000_000n],
    ["0.50", 5_000_000n],
    ["0.0000001", 1n],
    ["1.1234567", 11_234_567n],
    ["  2.5  ", 25_000_000n],
    ["007", 70_000_000n],
  ])("accepts %j exactly", (input, stroops) => {
    const check = checkUsdcAmountInput(input);
    expect(check).toEqual({ ok: true, amount: input.trim(), stroops });
  });

  it("accepts the registry maximum and refuses one stroop above it", () => {
    expect(checkUsdcAmountInput(MAX)).toMatchObject({ ok: true, stroops: MAX_USDC_AMOUNT_STROOPS });
    expect(checkUsdcAmountInput("100000000000")).toMatchObject({ ok: true });
    const over = checkUsdcAmountInput("100000000000.0000001");
    expect(over).toMatchObject({ ok: false, problem: "too_large" });
  });

  it("refuses zero only when the amount must be positive", () => {
    expect(checkUsdcAmountInput("0")).toMatchObject({ ok: true, stroops: 0n });
    expect(checkUsdcAmountInput("0.0000000")).toMatchObject({ ok: true, stroops: 0n });
    expect(checkUsdcAmountInput("0", { positive: true })).toMatchObject({
      ok: false,
      problem: "zero",
    });
    expect(checkUsdcAmountInput("0.0000001", { positive: true })).toMatchObject({ ok: true });
  });
});

function validationIssues(tool: string, args: Record<string, unknown>) {
  try {
    validateToolArgs(tool, args);
  } catch (err) {
    if (err instanceof ToolValidationError) return err.issues;
    throw err;
  }
  return [];
}

describe("tool arguments use the same amount rules", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["mindvault_publish", { title: "T", externalUrl: "https://example.com/data.csv" }, "price"],
    ["mindvault_set_price", { resourceId: "abc123" }, "price"],
    ["mindvault_buy", { resourceId: "res-1" }, "maxAutoPayUsdc"],
    ["mindvault_buy_lease", { resourceId: "res-1", tier: "hour" }, "maxAutoPayUsdc"],
  ];

  it.each(cases)("%s refuses exponent, excess precision and negative %s", (tool, base, field) => {
    for (const bad of ["1e2", "0.00000001", "-5"]) {
      const issues = validationIssues(tool, { ...base, [field]: bad });
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ field, code: "invalid_usdc_amount" });
      expect(issues[0]!.message).toContain(USDC_AMOUNT_FORMAT);
    }
  });

  it.each(cases)(
    "%s refuses a JSON number for %s instead of stringifying it",
    (tool, base, field) => {
      const issues = validationIssues(tool, { ...base, [field]: 1e-7 });
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ field, code: "wrong_type" });
      expect(issues[0]!.message).toContain(USDC_AMOUNT_FORMAT);
    },
  );

  it.each(cases)("%s accepts a 7-decimal %s and passes it on trimmed", (tool, base, field) => {
    const args = validateToolArgs(tool, { ...base, [field]: " 0.0000001 " });
    expect(args[field]).toBe("0.0000001");
  });

  it("refuses a zero price but allows a zero purchase ceiling", () => {
    expect(
      validationIssues("mindvault_set_price", { resourceId: "abc123", price: "0" })[0],
    ).toMatchObject({ field: "price", code: "invalid_usdc_amount" });
    expect(validationIssues("mindvault_buy", { resourceId: "res-1", maxAutoPayUsdc: "0" })).toEqual(
      [],
    );
  });

  it("reports a missing price with the accepted format", () => {
    const issues = validationIssues("mindvault_set_price", { resourceId: "abc123" });
    expect(issues[0]).toMatchObject({ field: "price", code: "missing_required" });
    expect(issues[0]!.message).toContain(USDC_AMOUNT_FORMAT);
  });

  it("leaves catalog price filters on their own parser", () => {
    expect(validationIssues("mindvault_browse", { minPrice: "0", maxPrice: "5.00" })).toEqual([]);
  });
});

describe("mindvault_publish_batch", () => {
  it("refuses an item price in exponent notation before publishing anything", async () => {
    const { dispatchTool } = await import("./index.js");
    const items = [
      { title: "Fine", price: "1.00", externalUrl: "https://example.com/a" },
      { title: "Exponent", price: "1e2", externalUrl: "https://example.com/b" },
    ];
    await expect(dispatchTool("mindvault_publish_batch", { items })).rejects.toThrow(
      /items\[1\]\.price: Exponent notation is not accepted/,
    );
  });

  it("refuses excess precision and zero item prices", async () => {
    const { dispatchTool } = await import("./index.js");
    for (const price of ["1.123456789", "0"]) {
      await expect(
        dispatchTool("mindvault_publish_batch", {
          items: [{ title: "T", price, externalUrl: "https://example.com/a" }],
        }),
      ).rejects.toThrow(/items\[0\]\.price: .*Use a plain decimal USDC amount/);
    }
  });
});
