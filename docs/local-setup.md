# Local Setup Guide

This guide will walk you through setting up MindVault from a fresh clone to a running server and web app. MindVault uses **Stellar testnet** — no real funds are needed or at risk.

## 1. Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 20+**
- **pnpm** (`npm i -g pnpm`)
- **Rust** and the **Stellar CLI** (for smart contracts) — see [Stellar setup docs](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)
- A **Supabase** project (free tier) for Postgres and Storage

## 2. Clone and Install

```bash
git clone https://github.com/mind-vault-1/mindvault.git
cd mindvault

# Install all JS/TS workspace packages
pnpm install
```

## 3. Environment Variables & Supabase

MindVault requires several environment variables to run.

1. Copy the example file:
   ```bash
   cp server/.env.example server/.env
   ```
2. In your new `server/.env` file, fill in the following critical details:
   - **`DATABASE_URL`**: Your Supabase connection string (pooler URL).
   - **`SUPABASE_URL`** & **`SUPABASE_SERVICE_KEY`**: From your Supabase project dashboard.
   - **`OPENROUTER_API_KEY`**: Your OpenRouter API key for the AI verification agent.

For a full explanation of all variables, refer to the [Server Environment Variables Guide](server-env.md). **Never commit `server/.env`** — it holds secret keys.

## 4. Database Setup

Once your `server/.env` is configured with Supabase credentials, generate and run the migrations:

```bash
make migrate
# Or manually: pnpm db:generate && pnpm db:migrate
```

## 5. Stellar Testnet Setup

MindVault uses the Stellar testnet for all payments and the vault registry. 

### A. Deploy the vault registry contract
The smart contract must be deployed so the server can record resources on-chain.

```bash
# 1. Create and fund a deployer identity
stellar keys generate deployer --network testnet --fund

# 2. Build the contract
pnpm contract:build

# 3. Deploy it to testnet
stellar contract deploy \
  --wasm contract/target/wasm32v1-none/release/vault_registry.wasm \
  --source deployer \
  --network testnet
```
Copy the printed contract ID into your `server/.env` file as **`VAULT_REGISTRY_CONTRACT_ID`** and **`REGISTRY_CONTRACT_ID`**. Also, grab your deployer secret key (using `stellar keys show deployer`) and set it as **`REGISTRY_SECRET_KEY`**.

### B. Generate Platform and Agent Wallets
The system needs two separate testnet wallets: a platform wallet (receives fees) and an agent wallet (pays for verification).

```bash
make wallets
```
*Run this command twice.* Add the first pair's public key to `server/.env` as **`PAY_TO`**, and the second pair's secret key as **`AGENT_SECRET_KEY`**.

### C. Fund Wallets and Add USDC Trustline
Both wallets require testnet USDC from the Circle faucet.

1. Provide your agent wallet with a USDC trustline:
   ```bash
   make setup-usdc
   ```
2. Visit the [Circle testnet faucet](https://faucet.circle.com) and fund both your platform (`PAY_TO`) and agent wallet addresses.

> **Having trouble?** See the [Stellar Testnet Funding Guide](stellar-testnet-funding.md) for detailed help.

## 6. Seed and Run

Populate the database with sample catalog resources for local development:

```bash
make seed
```

Start both the backend server (on `:4021`) and the web application (on `:5173`):

```bash
make dev
```

You're all set!

## Troubleshooting

- **Wallet Connection Issues**: See [Wallet Connection Troubleshooting](wallet-connection-troubleshooting.md).
- **x402 Payment/Sign Failures**: See [x402 Payment Troubleshooting](x402-payment-troubleshooting.md).
