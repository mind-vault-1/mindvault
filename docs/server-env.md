# Server environment variables

All variables live in `server/.env` (never committed). Copy `server/.env.example`
and fill in each value.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | Runtime environment (`development`, `production`, `test`) |
| `PORT` | no | `4021` | HTTP listen port |
| `BASE_URL` | no | `http://localhost:4021` | Public base URL of the server |
| `WEB_APP_URL` | no | `http://localhost:5173` | Web app URL (used for CORS / redirects) |
| `ALLOWED_ORIGINS` | no | — | Comma-separated browser origins allowed in production (defaults to `WEB_APP_URL`) |
| `STELLAR_NETWORK` | no | `testnet` | Deployment network selector (`testnet` or `mainnet`). Fills defaults for RPC, USDC, and x402 network when individual vars are omitted |
| `NETWORK` | no | from `STELLAR_NETWORK` | x402 network id (`stellar:testnet` or `stellar:pubnet`; `stellar:mainnet` is accepted as an alias for pubnet) |
| `FACILITATOR_URL` | no | `https://www.x402.org/facilitator` | x402 facilitator endpoint for payment verification/settlement |
| `PAY_TO` | **yes** | — | Platform Stellar wallet address — receives verification fees |
| `AGENT_SECRET_KEY` | **yes** | — | Platform agent secret key — pays for content verification |
| `USDC_CONTRACT_ID` | no | from `STELLAR_NETWORK` | Soroban USDC Stellar Asset Contract for the selected network |
| `SOROBAN_RPC_URL` | no | from `STELLAR_NETWORK` | Soroban RPC endpoint for on-chain registry reads/writes |
| `VAULT_REGISTRY_CONTRACT_ID` | **yes** | — | Deployed vault-registry contract ID |
| `OPENROUTER_API_KEY` | **yes** | — | OpenRouter API key for the AI verification agent |
| `OPENROUTER_MODEL` | no | `anthropic/claude-sonnet-4` | Model slug for verification LLM calls |
| `DATABASE_URL` | **yes** | — | Supabase Postgres connection string (pooler URL) |
| `SUPABASE_URL` | **yes** | — | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | **yes** | — | Supabase service role key |
| `SUPABASE_STORAGE_BUCKET` | no | `resources` | Supabase Storage bucket name for resource uploads |
| `MAX_FILE_SIZE_MB` | no | `50` | Maximum upload file size in MB |
| `VERIFICATION_PRICE` | no | `0.10` | USDC fee charged per content verification |
| `REGISTRY_CONTRACT_ID` | **yes** | — | Same contract ID as `VAULT_REGISTRY_CONTRACT_ID` (alias used by the registry client) |
| `REGISTRY_SECRET_KEY` | **yes** | — | Secret key of the registry deployer / owner account |
| `RATE_LIMIT_VERIFY_IP_MAX` | no | `10` | Max verify-content requests per IP per window |
| `RATE_LIMIT_VERIFY_IP_WINDOW_MS` | no | `60000` | Verify-content IP rate-limit window in ms |
| `RATE_LIMIT_VERIFY_WALLET_MAX` | no | `5` | Max verify-content requests per payer wallet per window |
| `RATE_LIMIT_VERIFY_WALLET_WINDOW_MS` | no | `3600000` | Verify-content wallet rate-limit window in ms |
| `RATE_LIMIT_PUBLISH_IP_MAX` | no | `20` | Max publish requests per IP per window |
| `RATE_LIMIT_PUBLISH_IP_WINDOW_MS` | no | `60000` | Publish IP rate-limit window in ms |
| `RATE_LIMIT_PUBLISH_WALLET_MAX` | no | `10` | Max publish requests per publisher wallet per window |
| `RATE_LIMIT_PUBLISH_WALLET_WINDOW_MS` | no | `3600000` | Publish wallet rate-limit window in ms |
| `REQUEST_TIMEOUT_MS` | no | `30000` | Per-request timeout; slow upstreams return 503 |
| `GRACEFUL_SHUTDOWN_TIMEOUT_MS` | no | `10000` | Max time to drain in-flight requests on SIGTERM/SIGINT |
| `IDEMPOTENCY_TTL_MS` | no | `86400000` | How long a publish Idempotency-Key is remembered (24h) |
| `CATALOG_CACHE_TTL_MS` | no | `10000` | Short-lived cache TTL for catalog/preview reads |

## Mainnet values

Set `STELLAR_NETWORK=mainnet` (or set each variable explicitly). Required mainnet values:

| Variable | Mainnet value |
|---|---|
| `STELLAR_NETWORK` | `mainnet` |
| `NETWORK` | `stellar:pubnet` |
| `SOROBAN_RPC_URL` | `https://soroban.stellar.org` |
| `USDC_CONTRACT_ID` | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` |
| `VAULT_REGISTRY_CONTRACT_ID` | Your deployed mainnet vault-registry contract ID |
| `REGISTRY_CONTRACT_ID` | Same as `VAULT_REGISTRY_CONTRACT_ID` |

Startup validation rejects mixed settings (for example, `STELLAR_NETWORK=testnet` with a mainnet Soroban RPC URL or USDC contract).
