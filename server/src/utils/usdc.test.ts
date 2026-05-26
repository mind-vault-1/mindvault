import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { stroopsToUsdc, usdcToStroops } from "./usdc.js";

describe("usdcToStroops", () => {
  it("converts whole and fractional USDC strings to 7-decimal integer units", () => {
    assert.equal(usdcToStroops("0"), 0n);
    assert.equal(usdcToStroops("1"), 10_000_000n);
    assert.equal(usdcToStroops("0.50"), 5_000_000n);
    assert.equal(usdcToStroops("12.3456789"), 123_456_789n);
  });

  it("trims surrounding whitespace", () => {
    assert.equal(usdcToStroops("  42.01  "), 420_100_000n);
  });

  it("rejects values with more than 7 decimals", () => {
    assert.throws(() => usdcToStroops("0.12345678"), /more than 7 decimal places/);
  });

  it("rejects invalid decimal strings", () => {
    assert.throws(() => usdcToStroops(""), /non-negative decimal string/);
    assert.throws(() => usdcToStroops("-1"), /non-negative decimal string/);
    assert.throws(() => usdcToStroops("1."), /non-negative decimal string/);
    assert.throws(() => usdcToStroops("01.00"), /non-negative decimal string/);
  });
});

describe("stroopsToUsdc", () => {
  it("formats integer units as USDC decimal strings", () => {
    assert.equal(stroopsToUsdc(0n), "0.00");
    assert.equal(stroopsToUsdc(10_000_000n), "1.00");
    assert.equal(stroopsToUsdc(5_000_000n), "0.50");
    assert.equal(stroopsToUsdc(123_456_789n), "12.3456789");
  });

  it("round-trips with usdcToStroops", () => {
    for (const amount of ["0.00", "0.50", "1.23", "12.3456789", "1000000.01"]) {
      assert.equal(usdcToStroops(stroopsToUsdc(usdcToStroops(amount))), usdcToStroops(amount));
    }
  });

  it("rejects negative integer units", () => {
    assert.throws(() => stroopsToUsdc(-1n), /non-negative/);
  });
});
