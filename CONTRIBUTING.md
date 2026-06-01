# Contributing to MindVault

Thanks for your interest in building MindVault! This guide gets you from a fresh
clone to a running stack and a first pull request.

MindVault is a payment-protected vault for digital resources on Stellar, using
HTTP 402 and the x402 protocol. Everything runs on **Stellar testnet** — no real
funds are at risk.

## Repository layout

```
mindvault/
  server/     Express backend, x402 middleware, Supabase, verification agent
  web/        React frontend, Stellar wallet connection, Tailwind   (imported separately)
  mcp/        MCP server for AI agent access                        (imported separately)
  contract/   Soroban smart contracts (Rust) — on-chain vault registry
```

This is a **pnpm workspace** for the JavaScript/TypeScript packages. `contract/`
is a separate Rust/Cargo workspace managed with the Stellar CLI.

## Prerequisites

- **Node.js 20+** and **pnpm** (`npm i -g pnpm`)
- **Rust** + the **Stellar CLI** for contract work — see
  [Stellar setup](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)
- A **Supabase** project (free tier) for the backend
- Stellar testnet wallets funded with USDC from [faucet.circle.com](https://faucet.circle.com)

## First-time setup

```bash
git clone <your-fork-url> mindvault && cd mindvault

# Install all JS/TS workspace packages at once
pnpm install

# Configure the backend
cp server/.env.example server/.env
# Fill in Supabase, Stellar, and OpenRouter credentials.
# NEVER commit server/.env — it is gitignored and holds secret keys.

# Database
pnpm db:generate && pnpm db:migrate

# Generate wallets (run twice for separate platform + agent wallets)
pnpm generate-wallet
```

## Running

From the repo root:

```bash
pnpm dev:server      # backend on :4021
# pnpm dev:web       # frontend on :5173 (once web/ is imported)
```

## Smart contract development

```bash
pnpm contract:build  # build the wasm (stellar contract build)
pnpm contract:test   # cargo test

# or directly inside contract/
cd contract && cargo test
```

See [`contract/README.md`](contract/README.md) for the registry interface and
deployment steps.

## Deploying the vault-registry contract

The contract must be deployed before the server can record resources on-chain.
You only need to do this once per environment (testnet or mainnet).

```bash
# 1. Install the Stellar CLI if you haven't already
#    https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup

# 2. Create and fund a deployer identity (skip if you already have one)
stellar keys generate deployer --network testnet --fund

# 3. Build the contract wasm
pnpm contract:build
# Output: contract/target/wasm32v1-none/release/vault_registry.wasm

# 4. Deploy
stellar contract deploy \
  --wasm contract/target/wasm32v1-none/release/vault_registry.wasm \
  --source deployer \
  --network testnet
# Prints the contract ID, e.g. CDQKUIADLO5S5WEHEUTTXX2M45WAHVRU2PBEBD6ZGDKMOP5A72FJ3OD4
```

Copy the printed contract ID and the deployer secret key into `server/.env`
(see the **Environment variables** section below).

## Environment variables

All variables live in `server/.env` (never committed). Copy the example and fill
in each value:

```bash
cp server/.env.example server/.env
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | no | HTTP port, default `4021` |
| `BASE_URL` | no | Public base URL, default `http://localhost:4021` |
| `NETWORK` | no | `stellar:testnet` (default) or `stellar:mainnet` |
| `FACILITATOR_URL` | no | x402 facilitator, default `https://www.x402.org/facilitator` |
| `PAY_TO` | **yes** | Platform Stellar wallet address — receives verification fees |
| `AGENT_SECRET_KEY` | **yes** | Platform agent secret key — pays for content verification |
| `SOROBAN_RPC_URL` | no | Soroban RPC endpoint, default `https://soroban-testnet.stellar.org` |
| `VAULT_REGISTRY_CONTRACT_ID` | **yes** | Deployed vault-registry contract ID (from deploy step above) |
| `REGISTRY_CONTRACT_ID` | **yes** | Same contract ID (alias used by the registry client) |
| `REGISTRY_SECRET_KEY` | **yes** | Secret key of the deployer / registry owner account |
| `OPENROUTER_API_KEY` | **yes** | OpenRouter API key for the AI verification agent |
| `OPENROUTER_MODEL` | no | Model slug, default `anthropic/claude-sonnet-4` |
| `DATABASE_URL` | **yes** | Supabase Postgres connection string (pooler URL) |
| `SUPABASE_URL` | **yes** | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | **yes** | Supabase service role key |
| `SUPABASE_STORAGE_BUCKET` | no | Storage bucket name, default `resources` |
| `MAX_FILE_SIZE_MB` | no | Upload limit in MB, default `50` |
| `VERIFICATION_PRICE` | no | USDC fee charged per verification, default `0.10` |
| `RATE_LIMIT_VERIFY_IP_MAX` | no | Max verify requests per IP per window, default `10` |
| `RATE_LIMIT_VERIFY_IP_WINDOW_MS` | no | Verify IP window in ms, default `60000` |
| `RATE_LIMIT_VERIFY_WALLET_MAX` | no | Max verify requests per payer wallet per window, default `5` |
| `RATE_LIMIT_VERIFY_WALLET_WINDOW_MS` | no | Verify wallet window in ms, default `3600000` |
| `RATE_LIMIT_PUBLISH_IP_MAX` | no | Max publish requests per IP per window, default `20` |
| `RATE_LIMIT_PUBLISH_IP_WINDOW_MS` | no | Publish IP window in ms, default `60000` |
| `RATE_LIMIT_PUBLISH_WALLET_MAX` | no | Max publish requests per publisher wallet per window, default `10` |
| `RATE_LIMIT_PUBLISH_WALLET_WINDOW_MS` | no | Publish wallet window in ms, default `3600000` |

Generate the two Stellar wallets (platform + agent) with:

```bash
pnpm generate-wallet   # run twice, save each public/secret key pair
```

Fund both with testnet USDC from [faucet.circle.com](https://faucet.circle.com).

## Running the integrated flow locally

This walks through the full publish → verify → buy cycle on your local machine.

```bash
# 1. Start the backend
pnpm dev:server        # http://localhost:4021

# 2. Register a publisher
curl -s -X POST http://localhost:4021/publishers \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","walletAddress":"G..."}' \
  | tee /tmp/publisher.json
# Save the returned apiKey

# 3. Publish a link resource (verification fee paid automatically by the agent wallet)
curl -s -X POST http://localhost:4021/resources \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <apiKey>" \
  -d '{"title":"My Dataset","price":"0.50","externalUrl":"https://example.com/data.csv"}' \
  | tee /tmp/resource.json
# Save the returned id

# 4. Check verification status
curl -s http://localhost:4021/resources/<id>/verification

# 5. Access the resource (triggers 402 → payment → delivery)
#    Any x402-capable client handles this automatically.
#    To test manually, use the e2e script:
pnpm --filter server e2e-test

# 6. (Optional) Transfer ownership on-chain
#    a. Build the unsigned tx
curl -s -X POST http://localhost:4021/resources/<id>/ownership/prepare \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <apiKey>" \
  -d '{"newOwnerWallet":"G<new-owner-address>"}' \
  | tee /tmp/prepare.json
# Returns { unsignedXdr, networkPassphrase }

#    b. Sign the XDR with the owner's key (e.g. using stellar-sdk or Freighter),
#       then submit:
curl -s -X POST http://localhost:4021/resources/<id>/ownership \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <apiKey>" \
  -d '{
    "signedXdr": "<base64-xdr>",
    "newOwnerWallet": "G<new-owner-address>",
    "newPublisherId": "<new-publisher-id>"
  }'
# On success: DB publisherId, walletAddress, and onchainTxHash are updated.
```

## Working on a change

1. **Fork** and create a branch: `git checkout -b feat/short-description`
2. Keep changes focused — one logical change per PR.
3. Make sure things build/pass before pushing:
   - Backend: `pnpm build:server`
   - Contract: `pnpm contract:test`
4. Use clear commit messages (e.g. `feat: add catalog search`, `fix: cors header`).
5. Use Conventional Commits formatting for your PR titles (e.g., `feat: add catalog search` or `fix(auth): cors header`). PR titles are automatically linted, and non-conforming titles will fail CI.
6. Open a PR against `main` describing **what** changed and **why**, and how you
   tested it.

## Good first issues

These are drawn from the README's "What Is Not Yet Built" — great starting points:

- **Search & filtering** on the catalog (`server/` + `web/`)
- **Recurring access / time-limited leases** instead of per-request payment
- **Refund mechanism** (potentially a Soroban escrow contract under `contract/`)
- **Rate limiting** on the API
- **Wire the backend to `vault-registry`** — record resources on-chain at publish
  time and read prices from the registry
- **TypeScript bindings** for the contract via `stellar contract bindings typescript`

If you want to take something larger on, open an issue first so we can align on
the approach.

## Security

- Never commit secrets. Only `*.env.example` files belong in git.
- All payments are testnet only; do not point this at mainnet.
- Found a vulnerability? Open an issue describing the impact (avoid posting a
  working exploit publicly).

### Secret scanning (gitleaks)

Every push and pull request runs [gitleaks](https://github.com/gitleaks/gitleaks)
via GitHub Actions. The scanner looks for Stellar secret keys (`S...`), Supabase
service keys, API keys, and other common secret patterns.

**If CI fails on your PR:**

1. **Do not merge** until the finding is resolved.
2. Identify the leaked value in the gitleaks job log (file + line).
3. **Remove the secret from git history** if it was ever committed:
   - If the PR is not merged yet, amend or rebase to drop the offending commit.
   - If the secret reached `main`, rotate it immediately (generate a new Stellar
     keypair, rotate Supabase service key, etc.) — removing it from git does not
     revoke a key that was already exposed.
4. Replace real values with placeholders in tracked files (see `server/.env.example`).
5. Re-run locally before pushing:
   ```bash
   docker run --rm -v "$(pwd):/path" zricethezav/gitleaks:latest \
     detect --source /path --config /path/.gitleaks.toml --verbose
   ```

Placeholder patterns in `server/.env.example` (e.g. `G...`, `S...`, `eyJ...`) are
allowlisted in `.gitleaks.toml` and will not fail the scan.

Happy building. ⚡
