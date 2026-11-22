import { describe, expect, it } from "vitest";
import { buildNetworkProfile } from "./networkProfile.js";

const baseEnv = {
  STELLAR_NETWORK: "testnet",
  MINDVAULT_HTTP_TIMEOUT_MS: "12000",
};

describe("effective network profile", () => {
  it("reports preset defaults with deterministic sections", () => {
    const profile = buildNetworkProfile(baseEnv, {
      timeouts: "http=12000ms",
      retries: "attempts=3",
    });

    expect(profile.schema).toBe("mindvault.network-profile/v1");
    expect(profile.sections).toEqual([
      "network",
      "endpoints",
      "contracts",
      "policies",
      "diagnostics",
    ]);
    expect(profile.network?.x402Network).toEqual({
      value: "stellar:testnet",
      source: "preset_default",
    });
    expect(profile.endpoints?.sorobanRpc.source).toBe("preset_default");
    expect(profile.endpoints?.sorobanRpc.value.failoverUrls).toEqual([
      "https://soroban-testnet.stellar.org",
    ]);
    expect(profile.policies?.readOnly).toBe(true);
  });

  it("shows sanitized overrides and never returns endpoint credentials", () => {
    const profile = buildNetworkProfile(
      {
        ...baseEnv,
        STELLAR_NETWORK: "mainnet",
        NETWORK: "stellar:pubnet",
        MINDVAULT_URL: "https://user:password@example.test/api?token=secret",
        SOROBAN_RPC_URL: "https://rpc.example.test/primary",
        MINDVAULT_SOROBAN_RPC_URLS: "https://rpc.example.test/backup, https://rpc2.example.test",
        VAULT_REGISTRY_CONTRACT_ID: "CABC",
      },
      {
        sections: ["network", "endpoints", "contracts"],
        timeouts: "disabled",
        retries: "disabled",
      },
    );

    expect(profile.sections).toEqual(["network", "endpoints", "contracts"]);
    expect(profile.endpoints?.baseUrl.value).toBe("https://example.test/api");
    expect(profile.endpoints?.baseUrl.value).not.toContain("password");
    expect(profile.endpoints?.sorobanRpc.value.failoverUrls).toEqual([
      "https://rpc.example.test/primary",
      "https://rpc.example.test/backup",
      "https://rpc2.example.test",
    ]);
    expect(profile.contracts?.registryContractId.source).toBe("env_override");
    expect(profile.diagnostics).toBeUndefined();
  });

  it("includes actionable startup diagnostics without making network calls", () => {
    const profile = buildNetworkProfile(
      { STELLAR_NETWORK: "unknown", MINDVAULT_URL: "not-a-url" },
      { sections: ["diagnostics"], timeouts: "disabled", retries: "disabled" },
    );

    expect(profile.diagnostics).toEqual([
      expect.objectContaining({ variable: "STELLAR_NETWORK", severity: "warning" }),
      expect.objectContaining({ variable: "MINDVAULT_URL", severity: "error" }),
    ]);
  });
});
