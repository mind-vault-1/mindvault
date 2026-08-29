/**
 * Tests for dry-run mode validation and reporting.
 */
import { describe, it, expect } from "vitest";
import { dryRunPublish, dryRunBuy, dryRunOnchain, type DryRunPublishInput } from "./dryRun.js";

describe("dryRunPublish – input validation", () => {
  const baseUrl = "https://example.com";
  const network = "stellar:testnet";

  it("validates title (non-empty, 1-256 chars)", () => {
    const input: DryRunPublishInput = {
      title: "Valid Title",
      price: "5.00",
      externalUrl: "https://example.com/resource",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.validation.title.valid).toBe(true);
  });

  it("rejects empty title", () => {
    const input: DryRunPublishInput = {
      title: "",
      price: "5.00",
      externalUrl: "https://example.com/resource",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.validation.title.valid).toBe(false);
    expect(result.validation.title.error).toContain("non-empty");
  });

  it("rejects title > 256 characters", () => {
    const input: DryRunPublishInput = {
      title: "x".repeat(257),
      price: "5.00",
      externalUrl: "https://example.com/resource",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.validation.title.valid).toBe(false);
    expect(result.validation.title.error).toContain("256");
  });

  it("validates price (decimal string, >= 0, max 2 decimals)", () => {
    const input: DryRunPublishInput = {
      title: "Title",
      price: "10.99",
      externalUrl: "https://example.com/resource",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.validation.price.valid).toBe(true);
  });

  it("rejects invalid price (non-numeric)", () => {
    const input: DryRunPublishInput = {
      title: "Title",
      price: "not-a-price",
      externalUrl: "https://example.com/resource",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.validation.price.valid).toBe(false);
    expect(result.validation.price.error).toContain("valid decimal");
  });

  it("rejects price with > 2 decimal places", () => {
    const input: DryRunPublishInput = {
      title: "Title",
      price: "5.999",
      externalUrl: "https://example.com/resource",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.validation.price.valid).toBe(false);
    expect(result.validation.price.error).toContain("2 decimal");
  });

  it("rejects negative price", () => {
    const input: DryRunPublishInput = {
      title: "Title",
      price: "-5.00",
      externalUrl: "https://example.com/resource",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.validation.price.valid).toBe(false);
  });

  it("validates URL (http/https only)", () => {
    const input: DryRunPublishInput = {
      title: "Title",
      price: "5.00",
      externalUrl: "https://example.com/data.json",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.validation.externalUrl.valid).toBe(true);
  });

  it("rejects non-http URL", () => {
    const input: DryRunPublishInput = {
      title: "Title",
      price: "5.00",
      externalUrl: "ftp://example.com/data",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.validation.externalUrl.valid).toBe(false);
    expect(result.validation.externalUrl.error).toContain("http");
  });

  it("rejects malformed URL", () => {
    const input: DryRunPublishInput = {
      title: "Title",
      price: "5.00",
      externalUrl: "not a url",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.validation.externalUrl.valid).toBe(false);
    expect(result.validation.externalUrl.error).toContain("Invalid");
  });
});

describe("dryRunPublish – result structure", () => {
  const baseUrl = "https://example.com";
  const network = "stellar:testnet";

  it("returns mode and operation in result", () => {
    const input: DryRunPublishInput = {
      title: "Test",
      price: "5.00",
      externalUrl: "https://example.com/data",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.mode).toBe("dry-run");
    expect(result.operation).toBe("publish");
  });

  it("includes network and endpoint in intentions", () => {
    const input: DryRunPublishInput = {
      title: "Test",
      price: "5.00",
      externalUrl: "https://example.com/data",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.intentions.network).toBe(network);
    expect(result.intentions.endpoint).toContain("POST");
    expect(result.intentions.endpoint).toContain("/resources");
  });

  it("shows required wallet state", () => {
    const input: DryRunPublishInput = {
      title: "Test",
      price: "5.00",
      externalUrl: "https://example.com/data",
    };
    const result = dryRunPublish(input, network, baseUrl, false, false);
    expect(result.intentions.requiredWalletState.wallet).toBe(false);
    expect(result.intentions.requiredWalletState.publisherApiKey).toBe(false);
  });

  it("includes ordered step-by-step operations", () => {
    const input: DryRunPublishInput = {
      title: "Test",
      price: "5.00",
      externalUrl: "https://example.com/data",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.steps).toContain("1. Create resource record via POST /resources");
    expect(result.steps).toContain("2. Sign x402 payment for verification (~0.10 USDC)");
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("shows steps only when validation succeeds", () => {
    const input: DryRunPublishInput = {
      title: "",
      price: "invalid",
      externalUrl: "not-a-url",
    };
    const result = dryRunPublish(input, network, baseUrl, true, true);
    expect(result.steps).toContain("Validation failed; see errors above");
  });
});

describe("dryRunBuy – input validation", () => {
  const baseUrl = "https://example.com";
  const network = "stellar:testnet";

  it("validates resource ID (alphanumeric + dash/dot/underscore)", () => {
    const result = dryRunBuy("res-001", network, baseUrl, true);
    expect(result.validation.resourceId.valid).toBe(true);
  });

  it("rejects empty resource ID", () => {
    const result = dryRunBuy("", network, baseUrl, true);
    expect(result.validation.resourceId.valid).toBe(false);
  });

  it("rejects resource ID with invalid characters", () => {
    const result = dryRunBuy("res@001", network, baseUrl, true);
    expect(result.validation.resourceId.valid).toBe(false);
    expect(result.validation.resourceId.error).toContain("only letters");
  });

  it("accepts dots and underscores in resource ID", () => {
    const result = dryRunBuy("res.001_v2", network, baseUrl, true);
    expect(result.validation.resourceId.valid).toBe(true);
  });
});

describe("dryRunBuy – result structure", () => {
  const baseUrl = "https://example.com";
  const network = "stellar:testnet";

  it("returns mode and operation in result", () => {
    const result = dryRunBuy("res-001", network, baseUrl, true);
    expect(result.mode).toBe("dry-run");
    expect(result.operation).toBe("buy");
  });

  it("includes resource ID, network, and endpoint", () => {
    const result = dryRunBuy("res-001", network, baseUrl, true);
    expect(result.resourceId).toBe("res-001");
    expect(result.intentions.network).toBe(network);
    expect(result.intentions.endpoint).toContain("GET");
    expect(result.intentions.endpoint).toContain("/resources/res-001");
  });

  it("shows required wallet state", () => {
    const result = dryRunBuy("res-001", network, baseUrl, false);
    expect(result.intentions.requiredWalletState.wallet).toBe(false);
  });

  it("includes payment steps", () => {
    const result = dryRunBuy("res-001", network, baseUrl, true);
    expect(result.steps).toContain("1. Fetch resource metadata to confirm price");
    expect(result.steps).toContain("2. Verify wallet has sufficient USDC balance");
    expect(result.steps).toContain("3. Create x402 payment authorization (sign payment tx)");
  });
});

describe("dryRunOnchain – input validation", () => {
  const baseUrl = "https://example.com";
  const network = "stellar:testnet";

  it("validates resource ID for on-chain operations", () => {
    const result = dryRunOnchain("register-onchain", "res-001", network, baseUrl, true, true);
    expect(result.validation.resourceId.valid).toBe(true);
  });

  it("rejects invalid resource ID", () => {
    const result = dryRunOnchain("register-onchain", "res@invalid", network, baseUrl, true, true);
    expect(result.validation.resourceId.valid).toBe(false);
  });
});

describe("dryRunOnchain – result structure", () => {
  const baseUrl = "https://example.com";
  const network = "stellar:testnet";

  it("shows operation-specific action text", () => {
    const operations = [
      "register-onchain" as const,
      "update-metadata" as const,
      "set-price" as const,
      "transfer-ownership" as const,
      "set-listed" as const,
    ];

    for (const op of operations) {
      const result = dryRunOnchain(op, "res-001", network, baseUrl, true, true);
      expect(result.operation).toBe(op);
      expect(result.intentions.action).toBeDefined();
      expect(result.intentions.action.length).toBeGreaterThan(0);
    }
  });

  it("includes Soroban contract details", () => {
    const result = dryRunOnchain("register-onchain", "res-001", network, baseUrl, true, true);
    expect(result.intentions.endpoint).toContain("Soroban");
    expect(result.intentions.endpoint).toContain("contract");
  });

  it("shows on-chain transaction steps", () => {
    const result = dryRunOnchain("register-onchain", "res-001", network, baseUrl, true, true);
    expect(result.steps).toContain(
      "1. Fetch resource details (confirm resource exists and you own it)",
    );
    expect(result.steps).toContain("2. Prepare unsigned Soroban transaction via server");
    expect(result.steps).toContain(
      "3. Sign transaction with agent wallet (private key held locally)",
    );
    expect(result.steps).toContain("4. Submit signed transaction via Soroban RPC");
  });
});
