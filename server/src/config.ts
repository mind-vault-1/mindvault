import "dotenv/config";
import { z } from "zod/v4";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4021),
  BASE_URL: z.string().default("http://localhost:4021"),
  WEB_APP_URL: z.string().url().default("http://localhost:5173"),
  ALLOWED_ORIGINS: z.string().optional(),

  // Stellar / x402
  NETWORK: z.string().default("stellar:testnet"),
  FACILITATOR_URL: z
    .string()
    .default("https://www.x402.org/facilitator"),
  PAY_TO: z.string().min(1, "PAY_TO (platform wallet address) is required"),
  AGENT_SECRET_KEY: z
    .string()
    .min(1, "AGENT_SECRET_KEY (platform agent secret) is required"),

  // Soroban / vault-registry
  // RPC endpoint used to read/write the on-chain registry. Default is the
  // public Stellar testnet RPC; override for mainnet or a self-hosted node.
  SOROBAN_RPC_URL: z
    .string()
    .url("SOROBAN_RPC_URL must be a valid URL")
    .default("https://soroban-testnet.stellar.org"),
  // Deployed contract ID for the vault-registry. Required so the server can
  // record/read canonical resource entries on-chain.
  VAULT_REGISTRY_CONTRACT_ID: z
    .string()
    .min(1, "VAULT_REGISTRY_CONTRACT_ID is required"),

  // OpenRouter
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-sonnet-4"),

  // Supabase
  DATABASE_URL: z.string().min(1, "DATABASE_URL (Supabase Postgres connection string) is required"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_KEY is required"),
  SUPABASE_STORAGE_BUCKET: z.string().default("resources"),

  // Limits
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),

  // Soroban registry
  REGISTRY_CONTRACT_ID: z
    .string()
    .min(1, "REGISTRY_CONTRACT_ID is required"),
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
