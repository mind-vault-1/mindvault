import "dotenv/config";
import { z } from "zod/v4";
import {
  applyNetworkEnvDefaults,
  resolveStellarNetwork,
  validateNetworkConfig,
} from "@mindvault/registry-client";
import { rootLogger } from "./lib/logger.js";

const envWithDefaults = applyNetworkEnvDefaults(process.env);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4021),
  BASE_URL: z.string().default("http://localhost:4021"),
  WEB_APP_URL: z.string().url().default("http://localhost:5173"),
  ALLOWED_ORIGINS: z.string().optional(),

  // Stellar / x402 — STELLAR_NETWORK selects preset defaults; individual vars may override.
  STELLAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  NETWORK: z.string().min(1),
  FACILITATOR_URL: z.string().default("https://www.x402.org/facilitator"),
  PAY_TO: z.string().min(1, "PAY_TO (platform wallet address) is required"),
  AGENT_SECRET_KEY: z.string().min(1, "AGENT_SECRET_KEY (platform agent secret) is required"),
  USDC_CONTRACT_ID: z.string().min(1),

  // Soroban / vault-registry
  SOROBAN_RPC_URL: z.string().url("SOROBAN_RPC_URL must be a valid URL"),
  VAULT_REGISTRY_CONTRACT_ID: z.string().min(1, "VAULT_REGISTRY_CONTRACT_ID is required"),

  // OpenRouter
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-sonnet-4"),

  // Supabase
  DATABASE_URL: z.string().min(1, "DATABASE_URL (Supabase Postgres connection string) is required"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_KEY: z.string().min(1, "SUPABASE_SERVICE_KEY is required"),
  SUPABASE_STORAGE_BUCKET: z.string().default("resources"),

  // Limits
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),

  // Soroban registry
  REGISTRY_CONTRACT_ID: z.string().min(1, "REGISTRY_CONTRACT_ID is required"),
  REGISTRY_SECRET_KEY: z
    .string()
    .min(1, "REGISTRY_SECRET_KEY (deployer / owner secret) is required"),

  // Verification
  VERIFICATION_PRICE: z.string().default("0.10"),

  // Rate limiting (verify-content + publish)
  RATE_LIMIT_VERIFY_IP_MAX: z.coerce.number().default(10),
  RATE_LIMIT_VERIFY_IP_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_VERIFY_WALLET_MAX: z.coerce.number().default(5),
  RATE_LIMIT_VERIFY_WALLET_WINDOW_MS: z.coerce.number().default(3_600_000),
  RATE_LIMIT_PUBLISH_IP_MAX: z.coerce.number().default(20),
  RATE_LIMIT_PUBLISH_IP_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_PUBLISH_WALLET_MAX: z.coerce.number().default(10),
  RATE_LIMIT_PUBLISH_WALLET_WINDOW_MS: z.coerce.number().default(3_600_000),

  // Per-request timeout — slow upstreams (RPC, facilitator) return 503 instead
  // of hanging the connection.
  REQUEST_TIMEOUT_MS: z.coerce.number().default(30_000),
  // Max time to drain in-flight requests on SIGTERM/SIGINT before forcing exit.
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(10_000),
  // How long a publish Idempotency-Key is remembered so retries return the
  // original result instead of creating a duplicate (default 24h).
  IDEMPOTENCY_TTL_MS: z.coerce.number().default(86_400_000),
  // Short-lived cache for catalog/preview reads to cut DB load. Kept low so
  // newly published/delisted resources surface quickly.
  CATALOG_CACHE_TTL_MS: z.coerce.number().default(10_000),
});

const parsed = envSchema.safeParse(envWithDefaults);

if (!parsed.success) {
  rootLogger.error(
    { event: "config_invalid", issues: parsed.error.format() },
    "invalid environment variables",
  );
  process.exit(1);
}

const stellarNetwork = resolveStellarNetwork(parsed.data.STELLAR_NETWORK);
const networkIssues = validateNetworkConfig({
  stellarNetwork,
  x402Network: parsed.data.NETWORK,
  sorobanRpcUrl: parsed.data.SOROBAN_RPC_URL,
  usdcSacContractId: parsed.data.USDC_CONTRACT_ID,
  registryContractId: parsed.data.VAULT_REGISTRY_CONTRACT_ID,
});

if (networkIssues.length > 0) {
  rootLogger.error(
    { event: "config_network_mismatch", issues: networkIssues },
    "inconsistent Stellar network configuration",
  );
  for (const issue of networkIssues) {
    rootLogger.error({ field: issue.field }, issue.message);
  }
  process.exit(1);
}

export const config = parsed.data;
