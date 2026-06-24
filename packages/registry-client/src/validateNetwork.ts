import {
  getNetworkPreset,
  type NetworkPreset,
  type StellarDeploymentNetwork,
  resolveStellarNetwork,
} from "./networks.js";

/** x402 network strings accepted by MindVault. */
export const X402_NETWORK_IDS = {
  testnet: "stellar:testnet",
  mainnet: "stellar:pubnet",
} as const;

/** Aliases that map to the canonical mainnet x402 id. */
const MAINNET_X402_ALIASES = new Set(["stellar:pubnet", "stellar:mainnet"]);

export interface NetworkConfigInput {
  stellarNetwork: StellarDeploymentNetwork;
  x402Network: string;
  sorobanRpcUrl: string;
  horizonUrl?: string;
  usdcSacContractId?: string;
  registryContractId?: string;
}

export interface NetworkValidationIssue {
  field: string;
  message: string;
}

/** Normalize x402 network id (accept stellar:mainnet as alias for stellar:pubnet). */
export function normalizeX402Network(network: string): string {
  const trimmed = network.trim();
  if (MAINNET_X402_ALIASES.has(trimmed)) return X402_NETWORK_IDS.mainnet;
  return trimmed;
}

/** Infer deployment network from an x402 network string. */
export function inferNetworkFromX402(network: string): StellarDeploymentNetwork | undefined {
  const normalized = normalizeX402Network(network);
  if (normalized === X402_NETWORK_IDS.testnet) return "testnet";
  if (normalized === X402_NETWORK_IDS.mainnet) return "mainnet";
  return undefined;
}

/** Infer deployment network from a Soroban RPC URL hostname. */
export function inferNetworkFromRpcUrl(rpcUrl: string): StellarDeploymentNetwork | undefined {
  try {
    const host = new URL(rpcUrl).hostname.toLowerCase();
    if (host.includes("testnet")) return "testnet";
    if (host === "soroban.stellar.org") return "mainnet";
  } catch {
    // invalid URL handled elsewhere
  }
  return undefined;
}

/** Infer deployment network from a Horizon URL hostname. */
export function inferNetworkFromHorizonUrl(
  horizonUrl: string,
): StellarDeploymentNetwork | undefined {
  try {
    const host = new URL(horizonUrl).hostname.toLowerCase();
    if (host.includes("testnet")) return "testnet";
    if (host === "horizon.stellar.org") return "mainnet";
  } catch {
    // invalid URL handled elsewhere
  }
  return undefined;
}

/** Stellar network passphrase for the given x402 network id. */
export function networkPassphraseForX402(x402Network: string): string {
  const inferred = inferNetworkFromX402(x402Network);
  if (!inferred) {
    throw new Error(
      `Unsupported NETWORK value "${x402Network}". Use stellar:testnet or stellar:pubnet.`,
    );
  }
  return getNetworkPreset(inferred).networkPassphrase;
}

/**
 * Validate that network-related settings are internally consistent.
 * Returns a list of issues; an empty list means the config is valid.
 */
export function validateNetworkConfig(input: NetworkConfigInput): NetworkValidationIssue[] {
  const preset = getNetworkPreset(input.stellarNetwork);
  const issues: NetworkValidationIssue[] = [];

  const normalizedX402 = normalizeX402Network(input.x402Network);
  const x402Inferred = inferNetworkFromX402(normalizedX402);
  if (!x402Inferred) {
    issues.push({
      field: "NETWORK",
      message: `Unsupported x402 network "${input.x402Network}". Use stellar:testnet or stellar:pubnet.`,
    });
  } else if (x402Inferred !== input.stellarNetwork) {
    issues.push({
      field: "NETWORK",
      message: `NETWORK=${input.x402Network} does not match STELLAR_NETWORK=${input.stellarNetwork}.`,
    });
  } else if (normalizedX402 !== preset.x402Network) {
    issues.push({
      field: "NETWORK",
      message: `NETWORK should be ${preset.x402Network} for STELLAR_NETWORK=${input.stellarNetwork}.`,
    });
  }

  const rpcInferred = inferNetworkFromRpcUrl(input.sorobanRpcUrl);
  if (!rpcInferred) {
    issues.push({
      field: "SOROBAN_RPC_URL",
      message: `Cannot infer network from SOROBAN_RPC_URL="${input.sorobanRpcUrl}".`,
    });
  } else if (rpcInferred !== input.stellarNetwork) {
    issues.push({
      field: "SOROBAN_RPC_URL",
      message: `SOROBAN_RPC_URL points to ${rpcInferred} but STELLAR_NETWORK=${input.stellarNetwork}.`,
    });
  }

  if (input.horizonUrl) {
    const horizonInferred = inferNetworkFromHorizonUrl(input.horizonUrl);
    if (!horizonInferred) {
      issues.push({
        field: "HORIZON_URL",
        message: `Cannot infer network from HORIZON_URL="${input.horizonUrl}".`,
      });
    } else if (horizonInferred !== input.stellarNetwork) {
      issues.push({
        field: "HORIZON_URL",
        message: `HORIZON_URL points to ${horizonInferred} but STELLAR_NETWORK=${input.stellarNetwork}.`,
      });
    }
  }

  if (input.usdcSacContractId && input.usdcSacContractId !== preset.usdcSacContractId) {
    issues.push({
      field: "USDC_CONTRACT_ID",
      message: `USDC_CONTRACT_ID does not match the canonical ${input.stellarNetwork} USDC SAC.`,
    });
  }

  if (
    input.registryContractId &&
    preset.defaultRegistryContractId &&
    input.registryContractId !== preset.defaultRegistryContractId &&
    input.stellarNetwork === "testnet"
  ) {
    // Custom testnet contract IDs are allowed — only warn when clearly cross-network.
    const otherPreset = getNetworkPreset(
      input.stellarNetwork === "testnet" ? "mainnet" : "testnet",
    );
    if (otherPreset.defaultRegistryContractId === input.registryContractId) {
      issues.push({
        field: "VAULT_REGISTRY_CONTRACT_ID",
        message: `Registry contract ID belongs to ${otherPreset.stellarNetwork}, not ${input.stellarNetwork}.`,
      });
    }
  }

  return issues;
}

/** Apply network preset defaults to env vars that were not explicitly set. */
export function applyNetworkEnvDefaults(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const stellarNetwork = resolveStellarNetwork(env.STELLAR_NETWORK);
  const preset: NetworkPreset = getNetworkPreset(stellarNetwork);

  return {
    ...env,
    STELLAR_NETWORK: stellarNetwork,
    NETWORK: env.NETWORK ?? preset.x402Network,
    SOROBAN_RPC_URL: env.SOROBAN_RPC_URL ?? preset.sorobanRpcUrl,
    USDC_CONTRACT_ID: env.USDC_CONTRACT_ID ?? preset.usdcSacContractId,
  };
}
