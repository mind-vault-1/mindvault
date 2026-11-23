import { describe, it, expect, beforeEach } from "vitest";
import { prepareOwnershipTransfer } from "./tools/publish.js";
import { _setMockMode, _resetProfiles } from "./runtime.js";
import { validateToolArgs } from "./validation.js";
import { PREPARE_OWNERSHIP_TRANSFER_OUTPUT_SCHEMA } from "./outputSchemas.js";

describe("mindvault_prepare_ownership_transfer (#1187)", () => {
  beforeEach(() => {
    _resetProfiles();
    _setMockMode(true);
  });

  it("validates valid arguments successfully", () => {
    const validArgs = {
      resourceId: "cm7x8y9z",
      newCreator: "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH",
    };
    const validated = validateToolArgs("mindvault_prepare_ownership_transfer", validArgs);
    expect(validated.resourceId).toBe("cm7x8y9z");
    expect(validated.newCreator).toBe(
      "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH",
    );
  });

  it("rejects invalid or missing arguments", () => {
    expect(() =>
      validateToolArgs("mindvault_prepare_ownership_transfer", {
        resourceId: "cm7x8y9z",
        // missing newCreator
      }),
    ).toThrow();

    expect(() =>
      validateToolArgs("mindvault_prepare_ownership_transfer", {
        resourceId: "cm7x8y9z",
        newCreator: "invalid-stellar-address",
      }),
    ).toThrow();
  });

  it("generates deterministic mock unsigned transaction in mock mode", async () => {
    const resourceId = "res-test-001";
    const newCreator = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";
    const resultJson = await prepareOwnershipTransfer(resourceId, newCreator);
    const parsed = JSON.parse(resultJson);

    expect(parsed.resourceId).toBe(resourceId);
    expect(parsed.newCreator).toBe(newCreator);
    expect(typeof parsed.unsignedXdr).toBe("string");
    expect(parsed.unsignedXdr.length).toBeGreaterThan(0);
    expect(typeof parsed.networkPassphrase).toBe("string");

    // Verify all required output schema properties exist
    for (const requiredProp of PREPARE_OWNERSHIP_TRANSFER_OUTPUT_SCHEMA.required) {
      expect(parsed).toHaveProperty(requiredProp);
    }
  });
});
