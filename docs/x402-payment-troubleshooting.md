# x402 Payment Troubleshooting

Payment and signing failures are the most common support issues in MindVault. This guide covers the top failure modes, how they differ between browser wallets and MCP agents, and how to inspect transactions on Stellar Explorer.

## Quick checklist

Before diving into a specific error, confirm:

1. **Network** — MindVault runs on **Stellar testnet** (`stellar:testnet`). Your wallet, MCP agent, and the server's `NETWORK` env must all match.
2. **USDC balance** — The payer needs enough USDC for the resource price **plus** a small reserve for fees.
3. **USDC trustline** — Classic Stellar accounts must trust the testnet USDC issuer before they can hold or send USDC.
4. **x402-aware client** — Plain `curl` without payment handling will stop at HTTP 402. Use an x402 client (`@x402/fetch`, the MCP server, or a wallet-integrated browser flow).

For a step-by-step browser buyer walkthrough, see [x402 browser payment walkthrough](x402-browser-payment-walkthrough.md).

---

## Symptom → cause → fix

### HTTP 402 returned but the client never retries

**Cause:** The client does not implement the x402 payment flow. A 402 response includes a `PAYMENT-REQUIRED` header with price, destination wallet, network, asset contract, and scheme. The client must sign a Soroban USDC authorization and retry with an `X-Payment` header.

**Fix:**

- **Browser:** Use a wallet-connected flow that signs Soroban auth entries (Freighter via `@creit.tech/stellar-wallets-kit`).
- **Agents / scripts:** Use `@x402/fetch` with an `x402Client` registered for `stellar:testnet`, or the MindVault MCP tools (`mindvault_buy`, `mindvault_publish`).
- **Manual test:** Run `pnpm --filter server e2e` — it implements the full 402 → pay → retry cycle.

```bash
curl -i https://your-server/resources/<id>
# Expect: HTTP/1.1 402 Payment Required
# Header: PAYMENT-REQUIRED: eyJ4NDAy...
```

---

### Bad or expired authorization entry

**Symptoms:** 402 on retry, facilitator `/verify` rejection, or "invalid payment" errors.

**Causes:**

- The signed auth entry was built for a **different price** than the server currently expects (price changed on-chain after signing).
- The auth entry **expired** (Soroban auth entries have a limited ledger window).
- The entry was signed for the **wrong network** or **wrong asset contract**.
- The retry reused an old `X-Payment` header from a previous attempt.

**Fix:**

1. Fetch a fresh 402 response (do not reuse cached payment headers).
2. Sign a new authorization against the current price from the `PAYMENT-REQUIRED` payload.
3. Retry immediately after signing — do not store auth entries for later.
4. Confirm `NETWORK=stellar:testnet` in server config and that your signer uses the testnet passphrase.

---

### Insufficient USDC balance

**Symptoms:** Wallet or facilitator rejects the transfer; Horizon shows balance below required amount.

**Fix:**

1. Check balance on [Stellar Explorer (testnet)](https://stellar.expert/explorer/testnet) or via Horizon:
   ```bash
   curl https://horizon-testnet.stellar.org/accounts/<G-address>
   ```
2. Fund testnet USDC from [faucet.circle.com](https://faucet.circle.com).
3. Ensure the balance covers **price + fees**. Soroban USDC transfers are small but not free.

---

### Missing USDC trustline

**Symptoms:** Account exists but USDC balance is 0 or transfers fail with trustline errors.

**Cause:** Classic Stellar accounts must explicitly trust the USDC issuer before receiving USDC. Sponsored MCP agent accounts establish this automatically; manually created accounts may not.

**Fix:**

- **MCP agents:** Run `mindvault_setup_wallet` — the sponsored account service creates the account and trustline.
- **Manual wallets:** Add a trustline to testnet USDC (issuer from Circle's testnet docs) via Freighter or the Stellar Laboratory.
- Verify on Explorer: open the account → **Balances** → confirm USDC appears.

---

### Wrong network (testnet vs mainnet)

**Symptoms:** Signatures verify locally but facilitator rejects them; transactions never appear on the expected Explorer network.

**Fix:**

1. Server: `NETWORK=stellar:testnet`, `SOROBAN_RPC_URL=https://soroban-testnet.stellar.org`.
2. Wallet: switch Freighter (or other wallet) to **Testnet**.
3. MCP: `NETWORK` is hardcoded to `stellar:testnet` in `mcp/src/index.ts`; do not point agents at mainnet keys.
4. Explorer: use [testnet](https://stellar.expert/explorer/testnet), not public/mainnet.

---

### Facilitator settle errors

**Symptoms:** Payment verifies but settlement fails; server returns 402 or 500 after retry; logs mention facilitator errors.

**Causes:**

- Facilitator downtime or rate limits at `https://www.x402.org/facilitator`.
- Soroban RPC unreachable (settlement submits on-chain).
- Malformed `X-Payment` header (truncated base64, wrong JSON structure).

**Fix:**

1. Check server readiness: `GET /health/ready` — confirms DB and Soroban RPC are up.
2. Retry after a short delay; auth entries expire quickly so you may need a fresh 402 cycle.
3. Inspect the facilitator response in server logs.
4. Override `FACILITATOR_URL` only if you operate a compatible facilitator.

---

### HTTP 429 Too Many Requests

**Symptoms:** `429` with `Retry-After` header on `POST /verify-content` or `POST /resources`.

**Cause:** Rate limits protect paid AI verification and publish endpoints. Limits apply per IP and per wallet/publisher.

**Fix:** Wait for the `Retry-After` seconds indicated in the response. Tune limits via `RATE_LIMIT_*` env vars (see `server/.env.example`) if you operate a high-traffic deployment.

---

## Browser (stellar-wallets-kit) vs MCP / agent signing

| Aspect | Browser (web app) | MCP / agent |
|--------|-------------------|-------------|
| Wallet setup | User connects Freighter, xBull, Albedo, etc. via `@creit.tech/stellar-wallets-kit` | `mindvault_setup_wallet` creates a sponsored testnet account in memory |
| Signing | Wallet kit bridges to x402's `ClientStellarSigner`; user approves in extension | `createEd25519Signer(secretKey)` + `wrapFetchWithPayment` — fully programmatic |
| Payment flow | Manual UI actions (register, buy) trigger signed retries | `mindvault_buy` / `mindvault_publish` handle 402 → sign → retry automatically |
| Trustline | User must fund and trust USDC themselves | Sponsored account service establishes trustline |
| Persistence | Wallet keys stay in the browser extension | Agent secret key is **in-memory only** — lost when MCP process exits |
| Typical failures | User on wrong network in wallet; popup blocked; insufficient balance | Forgot `mindvault_setup_wallet`; stale in-memory wallet; insufficient USDC |

**Browser tip:** If Freighter shows "Wrong network", switch to Testnet in the extension before signing.

**Agent tip:** Always run `mindvault_wallet_info` before `mindvault_buy` or `mindvault_publish` to confirm balance and address.

---

## Inspecting transactions on Stellar Explorer

MindVault payments and registry operations are real on-chain activity on **Stellar testnet**.

### Find an account

1. Open [stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet).
2. Paste the **G-address** (creator wallet, platform `PAY_TO`, or agent wallet).
3. Review **Balances** (USDC trustline + amount) and **History** (payments, contract invocations).

### Find a transaction

- **x402 USDC payments:** Search the payer or recipient G-address → look for **Payment** or Soroban **Invoke Host Function** entries involving USDC.
- **Registry operations** (register, set price, transfer ownership): Search the creator's G-address or use the `onchainTxHash` returned by the API after registration.
- **Verification fees:** Platform wallet (`PAY_TO`) receives USDC when creators or agents call `POST /verify-content`.

### Soroban contract calls

For vault-registry operations, open the transaction → **Operations** → **Invoke Host Function** → inspect contract ID (should match `VAULT_REGISTRY_CONTRACT_ID`) and function name (`register`, `set_price`, etc.).

### Server-side registry status

```bash
curl https://your-server/registry/status
curl https://your-server/resources/<id>/verification
```

Compare DB/on-chain state with the reconciliation script: `pnpm --filter server reconcile` (see [docs/reconciliation.md](reconciliation.md)).

---

## Still stuck?

1. Reproduce with a minimal x402 client (`pnpm --filter server e2e`).
2. Check `/health/ready` for dependency failures.
3. Open a GitHub issue with: network, endpoint, HTTP status, whether browser or agent, and the payer G-address (never post secret keys).
