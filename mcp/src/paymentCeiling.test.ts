import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_AUTO_PAY_USDC, assertAutoPaymentWithinCeiling } from "./paymentCeiling.js";

const env = { MINDVAULT_MAX_AUTO_PAY_USDC: "5" } as NodeJS.ProcessEnv;

describe("automatic x402 payment ceiling", () => {
  it("uses a documented 10 USDC default", () => {
    expect(DEFAULT_MAX_AUTO_PAY_USDC).toBe("10");
  });

  it("allows a payment below the configured ceiling", () => {
    expect(() => assertAutoPaymentWithinCeiling({ price: "4.99", env })).not.toThrow();
  });

  it("allows a payment exactly at the configured ceiling", () => {
    expect(() => assertAutoPaymentWithinCeiling({ price: "5.00", env })).not.toThrow();
  });

  it("blocks a payment above the ceiling until that call explicitly overrides it", () => {
    expect(() => assertAutoPaymentWithinCeiling({ price: "5.01", env })).toThrow(
      'Purchase requires 5.01 USDC, which exceeds the automatic payment ceiling of 5 USDC. To authorize this purchase, call mindvault_buy with maxAutoPayUsdc: "5.01"',
    );
    expect(() =>
      assertAutoPaymentWithinCeiling({ price: "5.01", maxAutoPayUsdc: "5.01", env }),
    ).not.toThrow();
  });
});
