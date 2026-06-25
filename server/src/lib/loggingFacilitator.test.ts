import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerify = vi.fn();
const mockSettle = vi.fn();

vi.mock("@x402/core/server", () => ({
  HTTPFacilitatorClient: class {
    url = "https://facilitator.test";
    verify = mockVerify;
    settle = mockSettle;
    getSupported = vi.fn();
  },
}));

vi.mock("./logger.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe("createLoggingFacilitatorClient", () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockSettle.mockReset();
  });

  it("logs verify outcomes", async () => {
    mockVerify.mockResolvedValue({ isValid: true });
    const { createLoggingFacilitatorClient } = await import("./loggingFacilitator.js");
    const client = createLoggingFacilitatorClient("https://facilitator.test");

    await client.verify(
      {} as PaymentPayload,
      { network: "stellar:testnet" } as unknown as PaymentRequirements,
    );

    expect(mockVerify).toHaveBeenCalled();
  });

  it("logs settle outcomes", async () => {
    mockSettle.mockResolvedValue({ success: true, transaction: "abc123" });
    const { createLoggingFacilitatorClient } = await import("./loggingFacilitator.js");
    const client = createLoggingFacilitatorClient("https://facilitator.test");

    await client.settle(
      {} as PaymentPayload,
      { network: "stellar:testnet" } as unknown as PaymentRequirements,
    );

    expect(mockSettle).toHaveBeenCalled();
  });
});
