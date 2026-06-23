# Deployment Runbook — Testnet to Mainnet

This runbook covers deploying the full MindVault stack to a **new** Stellar network (testnet or mainnet). A new maintainer should be able to follow these steps sequentially and end up with a working deployment.

## Prerequisites

- Node.js 20+, pnpm, Rust nightly (for Soroban contract compilation)
- `stellar` CLI installed and configured (`cargo install stellar-cli` or [GitHub releases](https://github.com/stellar/stellar-cli))
- A Supabase project (free tier works)
- An OpenRouter API key (for AI verification)
- `VAULT_REGISTRY_CONTRACT_ID` and `VAULT_REGISTRY_SECRET_KEY` from a wallet with sufficient XLM for deployment fees

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Deployment Order                              │
│                                                                     │
│  1. Build & deploy vault-registry Soroban contract                  │
│  2. Add USDC trustline for agent wallet                             │
│  3. Deploy the backend (server)                                     │
│  4. Deploy the frontend (web)                                       │
│  5. Configure MCP server                                            │
│  6. Verify the deployment                                           │
│  7. (Mainnet only) Update reconciliation + monitoring               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Build and deploy the vault-registry contract

### 1.1 Configure network

Set the target network. For testnet:

```bash
NETWORK=testnet
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
SOROBAN_RPC=https://soroban-testnet.stellar.org
```

For mainnet:

```bash
NETWORK=mainnet
NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
SOROBAN_RPC=https://soroban.stellar.org
```

### 1.2 Create a deployer keypair

```bash
stellar keys generate deployer --network $NETWORK --fund
# --fund only works on testnet. For mainnet, fund manually from an exchange.
```

Save the deployer public key:

```bash
stellar keys show deployer
# → G...
```

### 1.3 Build the contract WASM

```bash
cd contract
stellar contract build --manifest-path Cargo.toml
ls -l target/wasm32v1-none/release/vault_registry.wasm
```

### 1.4 Deploy the contract

```bash
CONTRACT_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/vault_registry.wasm \
  --source deployer \
  --network $NETWORK)
echo "Contract ID: $CONTRACT_ID"
```

### 1.5 Record the deployment

Save the contract ID and WASM hash for your records:

```bash
WASM_HASH=$(stellar contract wasm hash \
  --wasm target/wasm32v1-none/release/vault_registry.wasm)
echo "WASM Hash: $WASM_HASH"
```

Update `contract/README.md` with the new deployment details (contract ID, wasm hash, deployer address, deployment date, network).

### 1.6 Generate TypeScript bindings

From the repo root:

```bash
pnpm contract:bindings
```

This regenerates `packages/registry-client/src/generated/index.ts`. Commit the updated file.

---

## Step 2: Add USDC trustline for the agent wallet

The verification agent wallet needs a USDC trustline before it can send or receive USDC.

### 2.1 Generate or identify the agent wallet

If deploying fresh, generate a wallet:

```bash
pnpm generate-wallet
```

This outputs a public key and secret key. Save the secret key as `AGENT_SECRET_KEY`.

### 2.2 Add USDC trustline

For testnet USDC (Soroban SAC):

```bash
pnpm --filter @mindvault/server setup-usdc
```

For mainnet, replace the USDC contract ID with the mainnet SAC ID:
- Testnet: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
- Mainnet: Use the canonical USDC SAC contract ID for Stellar mainnet

### 2.3 Fund the agent wallet

- **Testnet:** Send testnet USDC from [faucet.circle.com](https://faucet.circle.com)
- **Mainnet:** Transfer real USDC from an exchange or another wallet

---

## Step 3: Deploy the server

### 3.1 Configure environment

Copy the example env file and fill in every variable:

```bash
cp server/.env.example server/.env
```

| Variable | Description | Source |
|----------|-------------|--------|
| `PORT` | Server port (default `4021`) | — |
| `BASE_URL` | Public URL of the server | Your deployment |
| `WEB_APP_URL` | Public URL of the web frontend | Your deployment |
| `NETWORK` | `stellar:testnet` or `stellar:pubnet` | Step 1.1 |
| `FACILITATOR_URL` | x402 facilitator endpoint | Default `https://www.x402.org/facilitator` |
| `PAY_TO` | Platform wallet address (receives verification fees) | Generated wallet |
| `AGENT_SECRET_KEY` | Agent wallet secret key | Step 2 |
| `SOROBAN_RPC_URL` | Soroban RPC endpoint | Step 1.1 |
| `VAULT_REGISTRY_CONTRACT_ID` | Deployed contract ID | Step 1.4 |
| `OPENROUTER_API_KEY` | For AI verification | OpenRouter dashboard |
| `DATABASE_URL` | Supabase Postgres connection string | Supabase project settings |
| `SUPABASE_URL` | Supabase project URL | Supabase project settings |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | Supabase project settings |

### 3.2 Run database migrations

```bash
pnpm db:generate && pnpm db:migrate
```

### 3.3 Seed the catalog (optional, dev only)

```bash
make seed
# or with on-chain registration:
make seed ONCHAIN=1
```

### 3.4 Build and deploy the server

```bash
pnpm build:server
```

Deploy the `server/` directory to your hosting platform:

**Render / Railway / Fly.io:**
- Build command: `pnpm install && pnpm build:registry-client && pnpm --filter @mindvault/server build`
- Start command: `pnpm --filter @mindvault/server start`
- Set all env vars from `server/.env` in the platform dashboard

**Docker (optional):**

```dockerfile
FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY . .
RUN pnpm install
RUN pnpm build:registry-client && pnpm --filter @mindvault/server build
CMD ["pnpm", "--filter", "@mindvault/server", "start"]
```

### 3.5 Verify the server is healthy

```bash
curl -i $BASE_URL/health/ready
# Expected: HTTP 200 with JSON dependencies status

curl -i $BASE_URL/resources
# Expected: HTTP 200 with JSON array (may be empty)
```

---

## Step 4: Deploy the frontend

### 4.1 Configure

Create `web/.env`:

```bash
echo "VITE_API_URL=$BASE_URL" > web/.env
```

Optional: set `VITE_NETWORK=testnet` or `VITE_NETWORK=pubnet` to control the Stellar network the wallet kit connects to.

### 4.2 Build

```bash
cd web
pnpm install
pnpm build
# Output in web/dist/
```

### 4.3 Deploy

Deploy `web/dist/` to any static host (Vercel, Netlify, Cloudflare Pages, S3+CloudFront).

Configure the static host to:
- Serve `index.html` for all routes (SPA fallback)
- Set `VITE_API_URL` as an env var pointing to the deployed server
- Set `VITE_NETWORK` to `testnet` or `pubnet`

### 4.4 Verify the frontend

Open the web app URL in a browser:
- Confirm it loads without console errors
- Connect a wallet (Freighter testnet/mainnet)
- Browse the catalog
- Try the full buy flow

---

## Step 5: Configure the MCP server

### 5.1 Set environment variables

```bash
cd mcp
```

Create or update `mcp/.env`:

```bash
MINDVAULT_URL=$BASE_URL
VAULT_REGISTRY_CONTRACT_ID=$CONTRACT_ID
NETWORK_PASSPHRASE="$NETWORK_PASSPHRASE"
SPONSORED_ACCOUNT_URL=https://stellar-sponsored-agent-account.onrender.com
HORIZON_URL=...  # https://horizon-testnet.stellar.org or https://horizon.stellar.org
SOROBAN_RPC_URL=$SOROBAN_RPC
```

### 5.2 Build

```bash
pnpm install && pnpm build
```

### 5.3 Register with MCP clients

```bash
# Claude Code
claude mcp add mindvault node /path/to/mcp/dist/index.js

# Codex
codex mcp add mindvault -- node /path/to/mcp/dist/index.js
```

---

## Step 6: Verify the full deployment

Run through the end-to-end acceptance test:

```bash
# 1. Smoke test the API
curl -i $BASE_URL/health/ready

# 2. Browse resources
curl $BASE_URL/resources

# 3. MCP flow (requires an MCP client)
#    - mindvault_setup_wallet
#    - mindvault_wallet_info
#    - mindvault_browse
#    - mindvault_register
#    - mindvault_publish
#    - mindvault_buy

# 4. Verify on-chain registration
pnpm reconcile
# Expected: "Result: ALL CLEAR" when resources are in sync

# 5. Test the 402 paywall
curl -i $BASE_URL/resources/<known-resource-id>
# Expected: HTTP 402 with PAYMENT-REQUIRED header
```

---

## Step 7: (Mainnet only) Monitoring and operations

### 7.1 Schedule reconciliation

Add the reconciliation CI workflow (see [docs/reconciliation.md](reconciliation.md)) to run daily:

```yaml
# .github/workflows/reconcile.yml
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
```

Update the workflow secrets with mainnet values:
- `SOROBAN_RPC_URL` → mainnet Soroban RPC
- `REGISTRY_CONTRACT_ID` → mainnet contract ID
- `NETWORK` → `stellar:pubnet`

### 7.2 Set up logging and alerts

- **Server logs:** Forward to your logging platform (e.g., Grafana, Datadog, Axiom)
- **Payment monitoring:** Track the platform wallet (`PAY_TO`) for verification fee deposits
- **Error rate alerts:** Page on HTTP 5xx rate > 1% over 5 minutes

### 7.3 Configure rate limits for production

Review `server/.env.example` rate limit variables and tune for expected traffic:

| Variable | Default | Notes |
|----------|---------|-------|
| `RATE_LIMIT_VERIFY_IP_MAX` | 10 | Per-IP verify calls per window |
| `RATE_LIMIT_VERIFY_WALLET_MAX` | 5 | Per-wallet verify calls per window |
| `RATE_LIMIT_PUBLISH_IP_MAX` | 20 | Per-IP publish calls per window |
| `RATE_LIMIT_PUBLISH_WALLET_MAX` | 10 | Per-wallet publish calls per window |

### 7.4 Register for Stellar mainnet USDC

- Obtain real USDC on Stellar mainnet (exchange withdrawal, Circle Mint, etc.)
- Fund the agent wallet and platform wallet with sufficient XLM for account reserves and transaction fees
- Update the USDC SAC contract ID to the mainnet value

---

## Rollback plan

| Component | Rollback action |
|-----------|----------------|
| Contract | Deploy the previous WASM as a new contract; update `VAULT_REGISTRY_CONTRACT_ID` env var |
| Server | Revert to the previous Docker image or deployment version |
| Frontend | Revert the static deployment (most hosts keep previous versions) |
| Database | Restore from the most recent Supabase backup (Point-in-Time Recovery) |

**Data safety notes:**
- The contract is immutable once deployed. To "roll back" the registry, deploy a new instance with the old WASM and point the server at it.
- On-chain USDC payments cannot be reversed. If a bug causes incorrect pricing, delist affected resources via `set_listed(id, false)` and issue refunds manually.
- The database schema migration should be backward-compatible for at least one release. Test rollback by deploying the previous server version against the current database before cutting over.

---

## Checklist

- [ ] Contract built and deployed
- [ ] Contract ID recorded and wired into all env files
- [ ] TypeScript bindings regenerated
- [ ] Agent wallet created and funded
- [ ] USDC trustline established
- [ ] Database migrations run
- [ ] Server deployed and `/health/ready` responds
- [ ] Frontend deployed and loads in browser
- [ ] MCP server built and registered
- [ ] End-to-end flow passes (browse → register → publish → buy)
- [ ] Reconciliation CI workflow configured
- [ ] Rate limits tuned for expected traffic
- [ ] Alerts configured for errors and payment anomalies
