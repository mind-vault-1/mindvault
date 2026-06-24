import { describe, it, expect } from "vitest";
import {
  networks,
  validateNetworkConfig,
  normalizeX402Network,
  inferNetworkFromRpcUrl,
  inferNetworkFromX402,
  applyNetworkEnvDefaults,
} from "@mindvault/registry-client";

describe("network presets", () => {
  it("defines testnet and mainnet with distinct RPC and USDC contract ids", () => {
    expect(networks.testnet.x402Network).toBe("stellar:testnet");
    expect(networks.mainnet.x402Network).toBe("stellar:pubnet");
    expect(networks.testnet.sorobanRpcUrl).toContain("testnet");
    expect(networks.mainnet.sorobanRpcUrl).toBe("https://soroban.stellar.org");
    expect(networks.testnet.usdcSacContractId).not.toBe(networks.mainnet.usdcSacContractId);
  });
});

describe("validateNetworkConfig", () => {
  it("accepts consistent testnet configuration", () => {
    const issues = validateNetworkConfig({
      stellarNetwork: "testnet",
      x402Network: "stellar:testnet",
      sorobanRpcUrl: networks.testnet.sorobanRpcUrl,
      usdcSacContractId: networks.testnet.usdcSacContractId,
    });
    expect(issues).toEqual([]);
  });

  it("accepts consistent mainnet configuration", () => {
    const issues = validateNetworkConfig({
      stellarNetwork: "mainnet",
      x402Network: "stellar:pubnet",
      sorobanRpcUrl: networks.mainnet.sorobanRpcUrl,
      horizonUrl: networks.mainnet.horizonUrl,
      usdcSacContractId: networks.mainnet.usdcSacContractId,
    });
    expect(issues).toEqual([]);
  });

  it("rejects mixed testnet NETWORK with mainnet RPC", () => {
    const issues = validateNetworkConfig({
      stellarNetwork: "testnet",
      x402Network: "stellar:testnet",
      sorobanRpcUrl: networks.mainnet.sorobanRpcUrl,
    });
    expect(issues.some((i) => i.field === "SOROBAN_RPC_URL")).toBe(true);
  });

  it("rejects mainnet USDC contract on testnet", () => {
    const issues = validateNetworkConfig({
      stellarNetwork: "testnet",
      x402Network: "stellar:testnet",
      sorobanRpcUrl: networks.testnet.sorobanRpcUrl,
      usdcSacContractId: networks.mainnet.usdcSacContractId,
    });
    expect(issues.some((i) => i.field === "USDC_CONTRACT_ID")).toBe(true);
  });
});

describe("network helpers", () => {
  it("normalizes stellar:mainnet to stellar:pubnet", () => {
    expect(normalizeX402Network("stellar:mainnet")).toBe("stellar:pubnet");
  });

  it("infers network from RPC URL", () => {
    expect(inferNetworkFromRpcUrl(networks.testnet.sorobanRpcUrl)).toBe("testnet");
    expect(inferNetworkFromRpcUrl(networks.mainnet.sorobanRpcUrl)).toBe("mainnet");
  });

  it("infers network from x402 id", () => {
    expect(inferNetworkFromX402("stellar:testnet")).toBe("testnet");
    expect(inferNetworkFromX402("stellar:pubnet")).toBe("mainnet");
    expect(inferNetworkFromX402("stellar:mainnet")).toBe("mainnet");
  });
});

describe("applyNetworkEnvDefaults", () => {
  it("fills mainnet defaults when STELLAR_NETWORK=mainnet", () => {
    const env = applyNetworkEnvDefaults({ STELLAR_NETWORK: "mainnet" });
    expect(env.STELLAR_NETWORK).toBe("mainnet");
    expect(env.NETWORK).toBe("stellar:pubnet");
    expect(env.SOROBAN_RPC_URL).toBe(networks.mainnet.sorobanRpcUrl);
    expect(env.USDC_CONTRACT_ID).toBe(networks.mainnet.usdcSacContractId);
  });

  it("preserves explicit overrides", () => {
    const env = applyNetworkEnvDefaults({
      STELLAR_NETWORK: "mainnet",
      NETWORK: "stellar:pubnet",
      SOROBAN_RPC_URL: "https://soroban.stellar.org",
    });
    expect(env.SOROBAN_RPC_URL).toBe("https://soroban.stellar.org");
  });
});
