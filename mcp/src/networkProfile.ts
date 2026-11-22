import {
  buildConfig,
  DEFAULT_MINDVAULT_URL,
  DEFAULT_SPONSORED_ACCOUNT_URL,
  resolveConfig,
  type McpConfig,
} from "./config.js";
import type { StellarDeploymentNetwork } from "@mindvault/registry-client";
import { type StartupDiagnostic } from "./diagnostics.js";
import { resolveFailoverConfig } from "./rpcFailover.js";
import { redactSecrets } from "./redaction.js";

export const NETWORK_PROFILE_SECTIONS = [
  "network",
  "endpoints",
  "contracts",
  "policies",
  "diagnostics",
] as const;

export type NetworkProfileSection = (typeof NETWORK_PROFILE_SECTIONS)[number];

export const NETWORK_PROFILE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    schema: { type: "string", const: "mindvault.network-profile/v1" },
    sections: { type: "array", items: { type: "string", enum: [...NETWORK_PROFILE_SECTIONS] } },
    stellarNetwork: { type: "string" },
    x402Network: { type: "string" },
    sorobanRpcUrl: { type: "string" },
    horizonUrl: { type: "string" },
    registryContractId: { type: "string" },
    usdcContractId: { type: "string" },
    timeouts: { type: "string" },
    retries: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    network: { type: "object" },
    endpoints: { type: "object" },
    contracts: { type: "object" },
    policies: { type: "object" },
    diagnostics: { type: "array", items: { type: "object" } },
  },
  required: ["schema", "sections"],
  additionalProperties: false,
} as const;

type Env = NodeJS.ProcessEnv;

interface SourcedValue<T> {
  value: T;
  source: "env_override" | "preset_default";
}

export interface NetworkProfile {
  schema: "mindvault.network-profile/v1";
  sections: NetworkProfileSection[];
  /** Legacy aliases retained for clients that consumed the original profile. */
  stellarNetwork?: StellarDeploymentNetwork;
  x402Network?: string;
  sorobanRpcUrl?: string;
  horizonUrl?: string;
  registryContractId?: string;
  usdcContractId?: string;
  timeouts?: string;
  retries?: string;
  warnings?: string[];
  network?: {
    stellarNetwork: McpConfig["stellarNetwork"];
    x402Network: SourcedValue<string>;
    networkPassphrase: string;
  };
  endpoints?: {
    baseUrl: SourcedValue<string>;
    sorobanRpc: SourcedValue<{ url: string; failoverUrls: string[] }>;
    horizonUrl: SourcedValue<string>;
    sponsoredAccountUrl: SourcedValue<string>;
  };
  contracts?: {
    registryContractId: SourcedValue<string>;
    usdcContractId: SourcedValue<string>;
  };
  policies?: {
    readOnly: boolean;
    mainnetMutationConfirmationRequired: boolean;
    timeouts: string;
    retries: string;
  };
  diagnostics?: Array<{
    variable: string;
    severity: StartupDiagnostic["severity"];
    message: string;
    expected?: string;
  }>;
}

function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    // Configuration URLs are useful for diagnosis, but credentials and query
    // strings are not part of an effective endpoint and must not be exposed.
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return redactSecrets(raw);
  }
}

function sourcedUrl(env: Env, name: string, fallback: string): SourcedValue<string> {
  const value = env[name]?.trim();
  return {
    value: safeUrl(value || fallback),
    source: value ? "env_override" : "preset_default",
  };
}

function failoverUrls(env: Env): string[] {
  return resolveFailoverConfig(env, buildConfig(env).sorobanRpcUrl).endpoints.map(safeUrl);
}

function selectedSections(value?: readonly string[]): NetworkProfileSection[] {
  if (!value || value.length === 0) return [...NETWORK_PROFILE_SECTIONS];
  const invalid = value.filter(
    (section) => !(NETWORK_PROFILE_SECTIONS as readonly string[]).includes(section),
  );
  if (invalid.length > 0) {
    throw new Error(
      `Invalid network profile section(s): ${invalid.join(", ")}. Expected: ${NETWORK_PROFILE_SECTIONS.join(", ")}.`,
    );
  }
  return [...new Set(value)] as NetworkProfileSection[];
}

export function buildNetworkProfile(
  env: Env,
  options: { sections?: readonly string[]; timeouts: string; retries: string },
): NetworkProfile {
  const config = buildConfig(env);
  const stellarNetwork = config.stellarNetwork;
  const preset = config.networkPreset;
  const sections = selectedSections(options.sections);
  const profile: NetworkProfile = { schema: "mindvault.network-profile/v1", sections };

  // Keep the original flat response available when no filter is requested.
  // New consumers should use the sourced sections above; this compatibility
  // envelope avoids breaking existing agents and operators.
  if (!options.sections || options.sections.length === 0) {
    const x402Network = config.x402Network;
    const sorobanRpcUrl = safeUrl(env.SOROBAN_RPC_URL ?? preset.sorobanRpcUrl);
    const horizonUrl = safeUrl(env.HORIZON_URL ?? preset.horizonUrl);
    const registryContractId =
      env.VAULT_REGISTRY_CONTRACT_ID ?? preset.defaultRegistryContractId ?? "";
    const usdcContractId = env.USDC_CONTRACT_ID ?? preset.usdcSacContractId;
    const warnings: string[] = [];
    for (const [name, value, fallback] of [
      ["NETWORK", env.NETWORK, preset.x402Network],
      ["SOROBAN_RPC_URL", env.SOROBAN_RPC_URL, preset.sorobanRpcUrl],
      ["HORIZON_URL", env.HORIZON_URL, preset.horizonUrl],
      ["USDC_CONTRACT_ID", env.USDC_CONTRACT_ID, preset.usdcSacContractId],
      [
        "VAULT_REGISTRY_CONTRACT_ID",
        env.VAULT_REGISTRY_CONTRACT_ID,
        preset.defaultRegistryContractId,
      ],
    ] as const) {
      if (value && value !== fallback) warnings.push(`${name} overrides preset`);
    }
    Object.assign(profile, {
      stellarNetwork,
      x402Network,
      sorobanRpcUrl,
      horizonUrl,
      registryContractId,
      usdcContractId,
      timeouts: options.timeouts,
      retries: options.retries,
      warnings,
    });
  }

  if (sections.includes("network")) {
    profile.network = {
      stellarNetwork,
      x402Network: {
        value: config.x402Network,
        source: env.NETWORK?.trim() ? "env_override" : "preset_default",
      },
      networkPassphrase: preset.networkPassphrase,
    };
  }

  if (sections.includes("endpoints")) {
    const rpc = sourcedUrl(env, "SOROBAN_RPC_URL", preset.sorobanRpcUrl);
    profile.endpoints = {
      baseUrl: sourcedUrl(env, "MINDVAULT_URL", DEFAULT_MINDVAULT_URL),
      sorobanRpc: {
        value: { url: rpc.value, failoverUrls: failoverUrls(env) },
        source: rpc.source,
      },
      horizonUrl: sourcedUrl(env, "HORIZON_URL", preset.horizonUrl),
      sponsoredAccountUrl: sourcedUrl(env, "SPONSORED_ACCOUNT_URL", DEFAULT_SPONSORED_ACCOUNT_URL),
    };
  }

  if (sections.includes("contracts")) {
    profile.contracts = {
      registryContractId: {
        value: env.VAULT_REGISTRY_CONTRACT_ID ?? preset.defaultRegistryContractId ?? "",
        source: env.VAULT_REGISTRY_CONTRACT_ID ? "env_override" : "preset_default",
      },
      usdcContractId: {
        value: env.USDC_CONTRACT_ID ?? preset.usdcSacContractId,
        source: env.USDC_CONTRACT_ID ? "env_override" : "preset_default",
      },
    };
  }

  if (sections.includes("policies")) {
    profile.policies = {
      readOnly: true,
      mainnetMutationConfirmationRequired:
        stellarNetwork === "mainnet" &&
        !["1", "true", "yes", "on"].includes((env.MINDVAULT_ALLOW_MAINNET ?? "").toLowerCase()),
      timeouts: options.timeouts,
      retries: options.retries,
    };
  }

  if (sections.includes("diagnostics")) {
    profile.diagnostics = resolveConfig(env).diagnostics.map((diagnostic) => ({
      variable: diagnostic.variable,
      severity: diagnostic.severity,
      message: redactSecrets(diagnostic.message),
      ...(diagnostic.expected ? { expected: redactSecrets(diagnostic.expected) } : {}),
    }));
  }

  return profile;
}
