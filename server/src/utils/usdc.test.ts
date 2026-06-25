import { describe, it, expect } from "vitest";
import { usdcToStroops, stroopsToUsdc } from "./usdc.js";

describe("usdcToStroops", () => {
  it("converts a simple decimal string", () => {
    expect(usdcToStroops("0.50")).toBe(5_000_000n);
  });

  it("converts a whole number string", () => {
    expect(usdcToStroops("1")).toBe(10_000_000n);
  });

  it("converts zero", () => {
    expect(usdcToStroops("0")).toBe(0n);
  });

  it("converts max 7 decimal places", () => {
    expect(usdcToStroops("0.1234567")).toBe(1_234_567n);
  });

  it("handles fractional with fewer than 7 places (pads right)", () => {
    expect(usdcToStroops("1.5")).toBe(15_000_000n);
  });

  it("handles large whole + fraction", () => {
    expect(usdcToStroops("100.0000001")).toBe(1_000_000_001n);
  });

  it("throws on more than 7 decimal places", () => {
    expect(() => usdcToStroops("0.12345678")).toThrow(/Too many decimal places/);
  });

  it("throws on non-numeric input", () => {
    expect(() => usdcToStroops("abc")).toThrow(/Invalid USDC amount/);
  });

  it("throws on negative string", () => {
    expect(() => usdcToStroops("-1")).toThrow(/Invalid USDC amount/);
  });
});

describe("stroopsToUsdc", () => {
  it("converts back to decimal string", () => {
    expect(stroopsToUsdc(5_000_000n)).toBe("0.5");
  });

  it("converts zero", () => {
    expect(stroopsToUsdc(0n)).toBe("0");
  });

  it("converts a whole number of stroops", () => {
    expect(stroopsToUsdc(10_000_000n)).toBe("1");
  });

  it("strips trailing zeros", () => {
    expect(stroopsToUsdc(1_234_567n)).toBe("0.1234567");
  });

  it("round-trips with usdcToStroops", () => {
    const cases = ["0.50", "1", "0.0000001", "100.0000001", "0.1234567"];
    for (const c of cases) {
      expect(stroopsToUsdc(usdcToStroops(c))).toBe(
        c.includes(".") ? `${BigInt(c.split(".")[0])}.${c.split(".")[1].replace(/0+$/, "")}` : c,
      );
    }
  });

  it("throws on negative stroops", () => {
    expect(() => stroopsToUsdc(-1n)).toThrow(/non-negative/);
  });
});
