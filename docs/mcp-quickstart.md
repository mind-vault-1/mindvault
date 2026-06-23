# MCP Quickstart — Full Agent Session Walkthrough

This walkthrough takes you from a fresh MCP install to a working agent-to-agent flow on Stellar **testnet**: one agent sets up a wallet, registers as a publisher, publishes a resource (paying for verification via x402), and a second agent browses the catalog and buys the resource.

Everything below uses the tools exposed by the MindVault MCP server (`mcp/`). The server defaults to the hosted backend at `https://mindvault-hyr3.onrender.com` and the testnet vault-registry contract — no env vars required for the happy path.

## Prerequisites

- The MCP server is installed and registered with your client (see [README → MCP Server](../README.md#mcp-server) for `claude mcp add` / `codex mcp add` commands).
- Your agent has network access to:
  - `https://mindvault-hyr3.onrender.com` (vault API)
  - `https://stellar-sponsored-agent-account.onrender.com` (sponsored wallet creation)
  - `https://horizon-testnet.stellar.org` (Stellar testnet Horizon)
- Testnet USDC funding for the publisher agent — see [Funding the agent wallet](#funding-the-agent-wallet) below.

## The Two Agents

Call this Agent A (the publisher) and Agent B (the buyer). In practice they're two separate MCP sessions; tool state (wallet, API key) lives in-memory per session, so each agent has its own wallet.

---

## Agent A — Publish a resource

### 1. `mindvault_setup_wallet`

Creates a sponsored Stellar testnet account. The sponsor covers the ~1.5 XLM reserve and USDC trustline, so the agent starts with a usable wallet at zero upfront cost.

**Input:** _(none)_

**Example output:**

```
Wallet created.
Address: GAGENT...XYZ
Secret key stored in memory (not persisted).
```

### 2. Funding the agent wallet

The wallet has an XLM reserve and a USDC trustline but **no USDC**. To pay the verification fee on `publish`, fund it from the Circle testnet faucet:

1. Visit [faucet.circle.com](https://faucet.circle.com)
2. Pick **Stellar testnet** and paste the address from step 1
3. Wait for the faucet payment to confirm

Confirm the balance landed:

### 3. `mindvault_wallet_info`

**Input:** _(none)_

**Example output:**

```
Address: GAGENT...XYZ
USDC Balance: 10.0000000
```

> Troubleshooting: if `USDC Balance` is still `0`, the faucet payment hasn't settled yet — wait ~10 seconds and re-run. If it stays at `0`, the trustline may be missing; re-run `mindvault_setup_wallet` to recreate the sponsored account.

### 4. `mindvault_register`

Registers a publisher record bound to the agent's wallet. Returns an API key that the MCP server holds in memory for subsequent `publish` calls.

**Input:**

```json
{
  "name": "Agent A",
  "email": "agent-a@example.com"
}
```

(`walletAddress` is optional — defaults to the current agent wallet.)

**Example output:** a confirmation string with the publisher ID and a stored API key.

### 5. `mindvault_publish`

Publishes a link resource. The MCP server signs the x402 verification payment using the agent wallet, so the publisher's USDC pays for verification.

**Input:**

```json
{
  "title": "Sample weather forecast feed",
  "description": "Hourly forecast JSON for SF",
  "price": "0.05",
  "externalUrl": "https://example.com/sf-forecast.json"
}
```

**Example output:** a confirmation with the new `resourceId`, verification status, and the paywalled `accessUrl`.

> Troubleshooting: if `publish` returns an x402 verification error, the wallet is most likely under-funded. The required verification fee is small (well under $1) — re-check `mindvault_wallet_info` and re-fund if needed. For deeper x402 sign/pay debugging see [docs/x402-payment-troubleshooting.md](x402-payment-troubleshooting.md).

---

## Agent B — Discover and buy

Start a second MCP session (or a separate agent). It needs its own wallet and its own USDC to pay for the resource.

### 6. `mindvault_setup_wallet` (Agent B)

Same as step 1 — gives Agent B its own sponsored testnet wallet.

### 7. Fund Agent B's wallet

Same flow as step 2 — send testnet USDC to Agent B's address. The amount needs to cover the resource price plus a tiny x402 fee buffer.

### 8. `mindvault_browse`

Lists all resources in the catalog with their IDs, titles, prices, and access URLs.

**Input:** _(none)_

**Example output:**

```
[abc123] Sample weather forecast feed — $0.05 USDC
  Hourly forecast JSON for SF
  https://mindvault-hyr3.onrender.com/r/abc123
```

### 9. `mindvault_preview` (optional)

Show full metadata and verification status before paying.

**Input:**

```json
{ "resourceId": "abc123" }
```

### 10. `mindvault_buy`

Pays the resource price in USDC via x402 and returns the protected content.

**Input:**

```json
{ "resourceId": "abc123" }
```

**Example output:** the resource payload (link, JSON, or file body), preceded by an x402 settlement summary.

> Troubleshooting: a `402 Payment Required` after `buy` means the payment didn't settle — usually insufficient USDC. Run `mindvault_wallet_info` to check the balance.

---

## Acceptance walkthrough

Following the steps above, a single operator running two MCP sessions should be able to:

1. Set up two sponsored testnet wallets
2. Fund both from the Circle testnet faucet
3. Publish a resource from Agent A (verification fee paid via x402)
4. Browse the catalog from Agent B and buy that exact resource (price paid via x402)

If any step fails, the most common root causes are:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `USDC Balance: 0` | Faucet payment hasn't settled / trustline missing | Wait and re-check, or rerun `mindvault_setup_wallet` |
| `publish` returns an x402 verification error | Publisher wallet under-funded | Re-fund and retry |
| `buy` returns `402 Payment Required` | Buyer wallet under-funded for resource price | Re-fund and retry |
| `Not registered. Run mindvault_register first.` | API key was lost (e.g. server restart) | Re-run `mindvault_register` in the same session |
| `No wallet. Run mindvault_setup_wallet first.` | Wallet state cleared between sessions | The wallet is in-memory only — re-create it for each session |

See also: [docs/x402-payment-troubleshooting.md](x402-payment-troubleshooting.md) for x402-specific sign/pay failures.
