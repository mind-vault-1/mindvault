import "dotenv/config";
import { z } from "zod/v4";

const envSchema = z.object({
  PORT: z.coerce.number().default(4021),
  BASE_URL: z.string().default("http://localhost:4021"),

  // Stellar / x402
  NETWORK: z.string().default("stellar:testnet"),
  FACILITATOR_URL: z
    .string()
    .default("https://www.x402.org/facilitator"),
  PAY_TO: z.string().min(1, "PAY_TO (platform wallet address) is required"),
  AGENT_SECRET_KEY: z
    .string()
    .min(1, "AGENT_SECRET_KEY (platform agent secret) is required"),

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

  // Verification
  VERIFICATION_PRICE: z.string().default("0.10"),
  REGISTRY_CONTRACT_ID: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
