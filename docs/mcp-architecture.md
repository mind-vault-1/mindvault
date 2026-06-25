# MCP Architecture — Agent Flow

This document describes how an AI agent (Claude Code, Codex, or any MCP-enabled client) interacts with MindVault through the MCP server.

The MCP server is a thin adapter layer. It translates natural-language tool calls into HTTP API requests and x402 payment flows, then returns results as text. The agent never touches Stellar or Soroban directly — the MCP server handles wallet management, payment signing, and x402 negotiation.

---

## Flow Diagram

```mermaid
sequenceDiagram
    participant Agent as AI Agent<br/>(Claude / Codex)
    participant MCP as MCP Server<br/>(mcp/src/index.ts)
    participant Sponsored as Sponsored Account<br/>Service
    participant API as MindVault API<br/>(server/)
    participant Facilitator as x402 Facilitator<br/>(x402.org)
    participant Stellar as Stellar / Soroban<br/>(testnet / mainnet)

    Note over Agent,Stellar: ── 1. Wallet Setup ──────────────────────────────────────

    Agent->>MCP: mindvault_setup_wallet
    MCP->>Sponsored: POST /create
    Sponsored->>Stellar: sponsor reserve + create account + USDC trustline
    Stellar-->>Sponsored: account funded
    Sponsored-->>MCP: { publicKey, secretKey }
    MCP-->>Agent: "Wallet created. Address: G..."
    Note over MCP: secretKey held in memory only<br/>never written to disk

    Note over Agent,Stellar: ── 2. Publisher Registration ─────────────────────────

    Agent->>MCP: mindvault_register(name, email)
    MCP->>API: POST /publishers { name, email, walletAddress }
    API-->>MCP: { id, apiKey }
    MCP-->>Agent: "Registered. API key stored in memory."
    Note over MCP: apiKey held in memory only

    Note over Agent,Stellar: ── 3. Publish + Verification Payment ────────────────

    Agent->>MCP: mindvault_publish(title, price, externalUrl)
    MCP->>API: POST /resources [x-api-key] { title, price, externalUrl }
    API-->>MCP: { id, accessUrl, verificationStatus: "pending" }

    MCP->>API: POST /verify-content { content, resourceId }
    API-->>MCP: 402 Payment Required<br/>PAYMENT-REQUIRED: eyJ...
    Note over MCP: wrapFetchWithPayment intercepts 402

    MCP->>MCP: sign Soroban USDC auth entry<br/>with agent Ed25519 key
    MCP->>Facilitator: verify signed auth entry
    Facilitator->>Stellar: submit USDC transfer (agent → platform wallet)
    Stellar-->>Facilitator: transaction confirmed
    Facilitator-->>MCP: payment verified

    MCP->>API: POST /verify-content [X-PAYMENT header] retry
    API->>API: LLM originality check (OpenRouter)
    API-->>MCP: { isOriginal, confidence, flags }
    MCP-->>Agent: "Resource published. Verification: approved ✓"

    Note over Agent,Stellar: ── 4. Browse & Preview ──────────────────────────────

    Agent->>MCP: mindvault_browse
    MCP->>API: GET /resources
    API-->>MCP: [ { id, title, price, accessUrl }, ... ]
    MCP-->>Agent: formatted resource list

    Agent->>MCP: mindvault_preview(resourceId)
    MCP->>API: GET /resources/:id/meta
    API-->>MCP: { title, description, price, verificationStatus }
    MCP-->>Agent: formatted resource details

    Note over Agent,Stellar: ── 5. Resource Purchase ──────────────────────────────

    Agent->>MCP: mindvault_buy(resourceId)
    MCP->>API: GET /resources/:id
    API-->>MCP: 402 Payment Required<br/>PAYMENT-REQUIRED: eyJ...

    MCP->>MCP: sign Soroban USDC auth entry<br/>with agent Ed25519 key
    MCP->>Facilitator: verify signed auth entry
    Facilitator->>Stellar: submit USDC transfer (agent → creator wallet)
    Stellar-->>Facilitator: transaction confirmed
    Facilitator-->>MCP: payment verified

    MCP->>API: GET /resources/:id [X-PAYMENT header] retry
    API-->>MCP: { url, receipt } or file bytes
    MCP-->>Agent: resource content + payment receipt
```

---

## Call Types

| Arrow | Protocol | Description |
|-------|----------|-------------|
| Agent → MCP | MCP (stdio) | Tool call via Model Context Protocol |
| MCP → Sponsored | HTTPS | REST: create sponsored Stellar account |
| MCP → API | HTTPS | REST: resource and publisher operations |
| MCP → Facilitator | HTTPS | x402: verify payment auth entry |
| Facilitator → Stellar | Soroban RPC | Submit USDC transaction on-chain |

---

## In-Memory State

The MCP server holds two pieces of ephemeral state across tool calls within a session:

| State | Set by | Used by |
|-------|--------|---------|
| `agentWallet` `{ publicKey, secretKey }` | `mindvault_setup_wallet` | `mindvault_register`, `mindvault_publish`, `mindvault_buy`, `mindvault_wallet_info` |
| `agentApiKey` | `mindvault_register` | `mindvault_publish` |

Both are lost when the MCP server process exits. A new session requires running `mindvault_setup_wallet` and `mindvault_register` again, or pre-loading an existing wallet by setting `AGENT_SECRET_KEY` and `AGENT_API_KEY` environment variables if you extend the server.

---

## Tool Summary

| Tool | API Call(s) | Stellar/Soroban |
|------|-------------|-----------------|
| `mindvault_setup_wallet` | `POST /create` (sponsored service) | Creates account + trustline |
| `mindvault_wallet_info` | Horizon `/accounts/:key` | Reads USDC balance |
| `mindvault_browse` | `GET /resources` | None |
| `mindvault_preview` | `GET /resources/:id/meta` | None |
| `mindvault_register` | `POST /publishers` | None |
| `mindvault_publish` | `POST /resources`, `POST /verify-content` (x402) | Signs + settles USDC payment to platform wallet |
| `mindvault_buy` | `GET /resources/:id` (x402) | Signs + settles USDC payment to creator wallet |
| `mindvault_agent_status` | `GET /agent/status` | None |

---

## Environment Variables (MCP Server)

| Variable | Default | Description |
|----------|---------|-------------|
| `MINDVAULT_URL` | `https://mindvault-hyr3.onrender.com` | MindVault API base URL |
| `SPONSORED_ACCOUNT_URL` | `https://stellar-sponsored-agent-account.onrender.com` | Sponsored account service URL |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` | Stellar Horizon for balance queries |

The MCP server has no `.env` file of its own — pass variables via your MCP client config or shell environment.
