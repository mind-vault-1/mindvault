import { describe, it, expect, vi, beforeEach } from "vitest";

// A mutable handle to the fetch wrapped by wrapFetchWithPayment so each test
// controls what the paid request resolves to.
const paidFetch = vi.fn();

vi.mock("@stellar/freighter-api", () => ({
  signAuthEntry: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock("@x402/stellar/exact/client", () => ({
  ExactStellarScheme: class {},
}));

vi.mock("@x402/fetch", () => ({
  wrapFetchWithPayment: () => paidFetch,
  x402Client: class {
    register() {
      return this;
    }
  },
  decodePaymentResponseHeader: (h: string) => JSON.parse(h),
}));

import { purchaseResource, PurchaseError, expectedNetworkPassphrase } from "./x402Buy.js";

function response(
  body: unknown,
  { ok = true, status = 200, headers = {} as Record<string, string> } = {},
): Response {
  const h = new Headers({ "content-type": "application/json", ...headers });
  return {
    ok,
    status,
    headers: h,
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob([JSON.stringify(body)])),
  } as unknown as Response;
}

describe("purchaseResource (#219)", () => {
  beforeEach(() => paidFetch.mockReset());

  it("returns link url, receipt, and settlement tx hash on success", async () => {
    const receipt = { paymentId: "p1", amount: "0.50", currency: "USDC" };
    paidFetch.mockResolvedValue(
      response(
        { url: "https://example.com/data", receipt },
        { headers: { "x-payment-response": JSON.stringify({ transaction: "abc123" }) } },
      ),
    );

    const result = await purchaseResource("https://api/resources/r1", "GBUYER");

    expect(result.url).toBe("https://example.com/data");
    expect(result.receipt).toEqual(receipt);
    expect(result.txHash).toBe("abc123");
    expect(result.explorerUrl).toContain("abc123");
  });

  it("succeeds without an explorer link when no tx hash is present", async () => {
    paidFetch.mockResolvedValue(response({ url: "https://example.com/data" }));

    const result = await purchaseResource("https://api/resources/r1", "GBUYER");

    expect(result.url).toBe("https://example.com/data");
    expect(result.txHash).toBeUndefined();
    expect(result.explorerUrl).toBeUndefined();
  });

  it("throws an actionable PurchaseError with the HTTP status on failure", async () => {
    paidFetch.mockResolvedValue(
      response({ error: "insufficient funds" }, { ok: false, status: 402 }),
    );

    await expect(purchaseResource("https://api/resources/r1", "GBUYER")).rejects.toMatchObject({
      name: "PurchaseError",
      status: 402,
      message: "insufficient funds",
    });
  });

  it("wraps signing/build failures as a PurchaseError", async () => {
    paidFetch.mockRejectedValue(new Error("User declined access"));

    const err = await purchaseResource("https://api/resources/r1", "GBUYER").catch((e) => e);
    expect(err).toBeInstanceOf(PurchaseError);
    expect(err.message).toBe("User declined access");
  });

  it("exposes the expected network passphrase for the preflight check", () => {
    // Defaults to testnet when VITE_STELLAR_NETWORK is unset.
    expect(expectedNetworkPassphrase()).toContain("Test");
  });
});
