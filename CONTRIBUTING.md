# Contributing to MindVault

Thanks for your interest in building MindVault. This guide gets you from a fresh clone to a running stack and a first pull request.

MindVault is a payment-protected vault for digital resources on Stellar, using HTTP 402 and the x402 protocol. Everything runs on **Stellar testnet** - no real funds are at risk.

## Repository layout

```text
mindvault/
  server/     Express backend, x402 middleware, Supabase, verification agent
  web/        React frontend, Stellar wallet connection, Tailwind   (imported separately)
  mcp/        MCP server for AI agent access                        (imported separately)
  contract/   Soroban smart contracts (Rust) for on-chain registry
```

This is a **pnpm workspace** for JavaScript/TypeScript packages. `contract/` is a separate Rust/Cargo workspace managed with the Stellar CLI.

## Prerequisites

- **Node.js 20+** and **pnpm** (`npm i -g pnpm`)
- **Rust** and the **Stellar CLI** for contract work. See [Stellar setup](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)
- A **Supabase** project (free tier) for the backend
- Stellar testnet wallets funded with USDC from [faucet.circle.com](https://faucet.circle.com)

## First-time setup

```bash
git clone <your-fork-url> mindvault
cd mindvault
pnpm install
cp server/.env.example server/.env
```

Then fill `server/.env` with valid values:

- `PORT`, `BASE_URL`
- `NETWORK`, `FACILITATOR_URL`, `PAY_TO`, `AGENT_SECRET_KEY`
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
- `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_STORAGE_BUCKET`
- `MAX_FILE_SIZE_MB`, `VERIFICATION_PRICE`

Never commit `server/.env`.

Run database and wallet setup:

```bash
pnpm db:generate
pnpm db:migrate
pnpm generate-wallet
pnpm generate-wallet
```

Run wallet generation twice so platform and agent keys are separate.

## Deploy the vault registry contract (testnet)

Build and test contract code:

```bash
pnpm contract:build
pnpm contract:test
```

Set local shell vars used by the deploy commands:

```bash
export STELLAR_NETWORK=testnet
export STELLAR_DEPLOYER=deployer
```

```powershell
$env:STELLAR_NETWORK = "testnet"
$env:STELLAR_DEPLOYER = "deployer"
```

Create and fund deployer key (first time only):

```bash
stellar keys generate "$STELLAR_DEPLOYER" --network "$STELLAR_NETWORK" --fund
```

Deploy registry contract:

```bash
stellar contract deploy \
  --wasm contract/target/wasm32v1-none/release/vault_registry.wasm \
  --source "$STELLAR_DEPLOYER" \
  --network "$STELLAR_NETWORK"
```

Save the returned contract ID in your local notes or shell env for later calls:

```bash
export VAULT_REGISTRY_CONTRACT_ID=<paste_contract_id>
```

## Integrated local flow

From repo root:

```bash
pnpm dev:server
```

In another terminal, run an end-to-end pass:

```bash
pnpm --filter @mindvault/server e2e
```

This validates the integrated backend flow (publisher registration, resource publish, verification endpoint, catalog, and paywall response).

## Working on a change

1. Fork and create a branch, for example: `git checkout -b docs/issue-53-contributing`
2. Keep changes focused - one logical change per PR.
3. Before pushing, run checks for touched areas:
   - Backend: `pnpm build:server`
   - Contract: `pnpm contract:test`
4. Use clear commit messages.
5. Open a PR against `main` with what changed, why, and how you tested it.

## Good first issues

These are drawn from the README section "What Is Not Yet Built":

- Search and filtering on the catalog (`server/` + `web/`)
- Recurring access and time-limited leases instead of per-request payment
- Refund mechanism (potential Soroban escrow contract under `contract/`)
- Rate limiting on the API
- Wire backend to `vault-registry` so resource registration and price reads are on-chain
- TypeScript bindings via `stellar contract bindings typescript`

If you want to take something larger, open an issue first so maintainers can align with you.

## Security

- Never commit secrets. Only `*.env.example` files belong in git.
- All payments are testnet only. Do not point this at mainnet.
- If you find a vulnerability, open an issue describing impact and avoid posting a working exploit.
