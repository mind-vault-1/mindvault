# MindVault

MindVault is a payment-protected vault for digital resources built on Stellar. Creators store their work and MindVault wraps it with an HTTP 402 paywall using the x402 protocol. Anyone with the resource URL — whether a human in a browser or an AI agent running autonomously — pays USDC on Stellar to access it.

## The Problem

Creators produce valuable digital work every day — datasets, research, code, prompts, trained models. But there is no simple way to protect and monetize this work for both human and machine consumers.

Traditional paywalls require accounts, logins, and subscriptions. That works fine for humans. It does not work for AI agents. An agent cannot sign up for an account, manage a subscription, or navigate an auth flow. But it can make an HTTP request, and it can sign a payment on a blockchain. That should be enough.

## What MindVault Does

MindVault gives creators a vault for their digital resources. Each stored resource gets a unique URL with a programmable paywall. When anything — a browser, a script, an AI agent — requests that URL:

1. The vault returns HTTP 402 (Payment Required) with the price and the creator's Stellar wallet address
2. The requester signs a USDC payment on Stellar
3. The requester retries the request with proof of payment
4. The vault delivers the resource and the USDC goes directly to the creator

One URL. One payment. One delivery. No accounts. No middleman.

## How We Use Stellar

MindVault is built entirely on Stellar's infrastructure. Every payment that flows through the platform is a real USDC transaction on the Stellar network.

**x402 Protocol** — The HTTP 402 status code was reserved for "Payment Required" but never standardized. The x402 protocol gives it a purpose. When a client requests a paywalled resource, the server returns a 402 with a `PAYMENT-REQUIRED` header containing the price, destination wallet, network, and payment scheme. The client signs a Soroban authorization entry for a USDC transfer, attaches it to the retry request, and the x402 facilitator verifies and settles the transaction on-chain. We use the `@x402/express` middleware on the server and `@x402/stellar` for signing on the client.

**USDC on Soroban** — All payments use the Stellar testnet USDC token contract (`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`). This is a Stellar Asset Contract (SAC) that wraps the classic USDC issuer. Balances are interchangeable between classic and Soroban operations.

**Wallet Connection** — The web app uses `@creit.tech/stellar-wallets-kit` to connect browser wallets (Freighter, xBull, Albedo, and others). When a user pays for a resource, the wallet kit bridges to x402's `ClientStellarSigner` interface to sign Soroban auth entries.

**Sponsored Agent Accounts** — The MCP server uses the [stellar-sponsored-agent-account](https://github.com/oceans404/stellar-sponsored-agent-account) service to create wallets for AI agents. The service sponsors the ~1.5 XLM reserve needed to create an account and establish a USDC trustline, so an agent can get a wallet with zero upfront cost.

**Two Platform Wallets** — MindVault operates two separate Stellar wallets. The platform wallet (`GB6LGS25...`) receives verification fees. The agent wallet (`GDNNUI6N...`) pays for verification when publishing via the MCP server. Both are visible on Stellar Explorer with real USDC transactions flowing between them.

**Facilitator** — Payment verification and settlement is handled by the x402 facilitator at `x402.org/facilitator` (Coinbase, testnet, fees sponsored). The facilitator calls `/verify` to validate the signed auth entry and `/settle` to submit the transaction on-chain.

## Content Verification

Before a resource goes live in the vault, a built-in AI agent reviews it for originality and quality. This agent is itself an x402-paid service. It has its own endpoint (`POST /verify-content`), its own price ($0.10 USDC), and it receives payments to the platform's Stellar wallet.

When a creator publishes a resource from the web app, their browser wallet pays the verification fee via x402. When an AI agent publishes through the MCP server, the agent's wallet pays the same fee through the same protocol.

The verification agent has processed 7 verifications, approved 2, rejected 5, and earned $0.70 USDC. It correctly rejects test submissions and placeholder content while approving genuine resource listings. Its full activity feed is visible on the Agent page in the app.

## Who Uses MindVault

**Creators** store their resources, set a price in USDC, and receive payments directly to their Stellar wallet every time someone accesses their work. No platform cut.

**AI Agents** can browse the catalog, pay for resources, and even publish their own — all programmatically through the API or MCP server. No accounts, no OAuth. An HTTP request and a Stellar payment is all they need.

**Humans** connect a browser wallet (Freighter, xBull, etc.), browse the vault, and pay to access resources with one click.

All three interact with the same URLs, the same 402 responses, and the same x402 payment flow.

## MCP Server

MindVault includes an MCP server that lets any AI system (Claude Code, Codex, or any MCP-enabled client) interact with the vault through natural conversation.

Available tools:

| Tool | Description |
|------|-------------|
| `mindvault_setup_wallet` | Create a Stellar wallet using the sponsored account protocol |
| `mindvault_wallet_info` | Check wallet address and USDC balance |
| `mindvault_browse` | List available resources in the vault |
| `mindvault_preview` | Get details and price for a resource |
| `mindvault_register` | Register as a publisher using the agent's wallet |
| `mindvault_publish` | Publish a resource and pay for verification via x402 |
| `mindvault_buy` | Pay USDC and access a resource via x402 |
| `mindvault_agent_status` | Check the verification agent's earnings and activity |

### Install

```bash
cd mcp && pnpm install && pnpm build

# Claude Code
claude mcp add mindvault node /path/to/mindVault/mcp/dist/index.js

# Codex
codex mcp add mindvault -- node /path/to/mindVault/mcp/dist/index.js
```

An agent can set up a wallet, register as a publisher, publish a resource (paying for verification), and then another agent can discover and buy that resource. The full agent-to-agent economy runs through x402.

## Project Structure

```
mindVault/
  server/     Express backend, x402 middleware, Supabase, verification agent
  web/        React frontend, Stellar wallet connection, Tailwind
  mcp/        MCP server for AI agent access
```

## Running Locally

Requires Node.js 20+, pnpm, and a Supabase project (free tier). Stellar testnet wallets need XLM (via Friendbot) and Soroban USDC for x402 payments.

### Quick start

```bash
# 1. Install dependencies
make install          # or: pnpm install

# 2. Configure environment
cp server/.env.example server/.env
# Fill in Supabase, Stellar contract IDs, and OpenRouter credentials.

# 3. One-time setup (DB migrations + wallet generation)
make setup

# 4. After setting AGENT_SECRET_KEY in server/.env, prepare USDC trustline
make setup-usdc

# 5. Run API (:4021) and web app (:5173)
make dev
```

Set `VITE_API_URL=http://localhost:4021` when running the web app separately (e.g. in a `web/.env` file).

### Makefile targets

| Target | Description |
|--------|-------------|
| `make setup` | Install deps, run DB migrations, generate a testnet wallet |
| `make setup-usdc` | Add USDC trustline for `AGENT_SECRET_KEY` and print faucet guidance |
| `make dev` | Start server and web app together |
| `make dev-server` | Backend only on `:4021` |
| `make dev-web` | Frontend only on `:5173` |
| `make test` | Run unit tests |

### Local services

MindVault does not require Docker Compose. External services used locally:

- **Supabase** — Postgres (`DATABASE_URL`) and file storage (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`)
- **Stellar testnet** — Soroban RPC (`SOROBAN_RPC_URL`), Friendbot for XLM, Soroban USDC for x402
- **OpenRouter** — AI verification (`OPENROUTER_API_KEY`)
- **x402 facilitator** — payment verify/settle (`FACILITATOR_URL`, default `https://www.x402.org/facilitator`)

Wallet helpers live in `server/scripts/generate-wallet.ts` (run via `make wallets` or `pnpm generate-wallet`) and `server/scripts/setup-usdc.ts` (run via `make setup-usdc`).

## Architecture

- **[docs/architecture.md](docs/architecture.md)** — how x402 + USDC handles payment and how the vault-registry contract is the on-chain source of truth for ownership, price, and content integrity. Includes a full system diagram.
- **[docs/x402-payment-troubleshooting.md](docs/x402-payment-troubleshooting.md)** — common x402 payment/sign failures and how to fix them (browser vs MCP, Explorer inspection).

## Operations

- **Reconciliation**: see [docs/reconciliation.md](docs/reconciliation.md) — detects and reports drift between the DB and the on-chain vault registry; run with `pnpm reconcile` from `server/`.

## Testing the 402 Flow

```bash
# Any HTTP client gets a 402 with payment instructions
curl -i https://mindvault-hyr3.onrender.com/resources/swcn98besxpp6t1u8e77fqz3
# HTTP/1.1 402 Payment Required
# PAYMENT-REQUIRED: eyJ4NDAy...  (base64 encoded payment details)
```

The `PAYMENT-REQUIRED` header contains the price, destination wallet, network, asset contract, and payment scheme. Any x402-compatible client handles it automatically.

## What Is Real

- Payments are real USDC transactions on Stellar testnet, settled through the x402 facilitator
- The AI verification agent makes real LLM calls (via OpenRouter) and real x402 payments
- The frontend connects real Stellar wallets and signs real Soroban auth entries
- The platform and agent operate from two separate Stellar wallets with visible on-chain activity
- Creator earnings are tracked from actual payment settlements
- The MCP server creates real sponsored accounts on Stellar

## What Is Not Yet Built

- Search and filtering on the catalog
- Recurring access or time-limited leases (currently per-request)
- Refund mechanism
- Rate limiting
- Mainnet deployment

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, TypeScript, Express |
| Payments | x402 protocol (`@x402/express`, `@x402/stellar`, `@x402/fetch`) |
| Blockchain | Stellar testnet, USDC via Soroban SAC |
| Database | Supabase Postgres, Drizzle ORM |
| Storage | Supabase Storage |
| AI | OpenRouter (model-flexible, defaults to Claude) |
| Frontend | React, Vite, Tailwind CSS |
| Wallets | @creit.tech/stellar-wallets-kit |
| Agent Access | MCP server with sponsored account provisioning |

## Links
- x402 protocol: [x402.org](https://www.x402.org/)
- x402 on Stellar: [developers.stellar.org](https://developers.stellar.org/docs/build/agentic-payments/x402)
- Sponsored accounts: [stellar-sponsored-agent-account](https://github.com/oceans404/stellar-sponsored-agent-account)
- Stellar Wallets Kit: [stellarwalletskit.dev](https://stellarwalletskit.dev/)
- Circle testnet faucet: [faucet.circle.com](https://faucet.circle.com)

## License

MIT
