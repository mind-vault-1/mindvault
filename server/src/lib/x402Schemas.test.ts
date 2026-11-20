import { parsePaymentPayload } from "@x402/core/schemas";
import { describe, expect, it } from "vitest";

describe("x402 payment schema compatibility", () => {
  it("preserves a v2 Stellar payload and extension data with the patched Zod", () => {
    const payment = {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: "stellar:testnet",
        amount: "100000",
        asset: "test-asset",
        payTo: "test-recipient",
        maxTimeoutSeconds: 60,
        extra: { areFeesSponsored: true },
      },
      payload: { transaction: "test-transaction" },
      extensions: { "test-extension": { approved: false } },
    };

    expect(parsePaymentPayload(payment)).toMatchObject({ success: true, data: payment });
  });
});
