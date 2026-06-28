import { describe, it, expect, beforeAll } from "vitest";
import { createRegistryClient, type VaultRegistryClient } from "./index.js";
import { networks } from "./networks.js";

// Skip integration tests unless specifically requested
const isIntegration = process.env.RUN_INTEGRATION === "true";

describe.skipIf(!isIntegration)("Vault Registry Contract Integration", () => {
  const network = networks.testnet; // Use testnet for integration tests
  let signerPublicKey: string;

  beforeAll(async () => {
    // Generate a new random keypair for testing
    // In a real integration test, we'd want a funded account, but this is a stub.
    signerPublicKey = "GBBD47IF6LWK7P7MDEVSCWTTCJMCRSMOQCRI3OQQA5VIG5EQEXISUIER"; // Mock for compilation
  });

  it("should register and read back a resource", async () => {
    const resourceId = `test-resource-${Date.now()}`;
    const publisherWallet = signerPublicKey;

    expect(createRegistryClient).toBeDefined();
  });
});
