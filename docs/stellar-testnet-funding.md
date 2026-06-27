# Stellar Testnet Funding Guide

MindVault runs on **Stellar testnet** for development and demo use. Testnet XLM and USDC are free — they have no real-world value and are obtained from public faucets. This guide explains how to create an account, fund it, and verify the balance.

---

## Overview

Every Stellar account needs:

| Resource | Purpose | How to get it |
|----------|---------|---------------|
| **XLM** (lumen) | Account reserve (minimum ~1.5 XLM) + transaction fee (tiny) | Stellar Laboratory friendbot |
| **USDC** | Verification fees, resource purchases, price changes | Circle testnet faucet |
| **USDC trustline** | Permission to hold USDC | Added via Freighter, Laboratory, or `mindvault_setup_wallet` |

> **Soroban accounts** (used by the MCP agent's sponsored wallet) do not need a separate trustline — the SAC can hold USDC directly. **Classic accounts** (browser wallets like Freighter) must add a trustline before receiving USDC.

---

## 1. Create or identify your account

### Browser wallet (Freighter)

If you use Freighter, your account already exists on the Stellar network once you create it inside the extension.

1. Install [Freighter](https://freighter.app) and create a wallet.
2. Switch the network to **Testnet** (click the network dropdown in the top-left of the extension).
3. Copy your **G-address** (starts with `G`).

### MCP sponsored wallet

If you use the MCP server, run `mindvault_setup_wallet` to create a sponsored testnet account. The sponsor covers the XLM reserve and establishes a USDC trustline automatically.

```
mindvault_setup_wallet
→ Wallet created: G…
→ USDC trustline: established
→ Balance: 0 USDC, ~1.5 XLM
```

> The sponsored wallet has an XLM reserve but **zero spendable USDC**. You must fund it from the faucet before publishing or buying.

---

## 2. Fund XLM (reserve + fees)

Most accounts are created with XLM already, but if you need more testnet XLM:

1. Open the [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=testnet).
2. Make sure **"Testnet"** is selected in the network dropdown.
3. Paste your G-address and click **"Get testnet XLM"** (friendbot).
4. Confirm the response — you should see `"status": "ok"` and the XLM balance.

The friendbot funds ~10,000 XLM, which is far more than the reserve and any foreseeable transaction fees.

---

## 3. Add the USDC trustline

### Classic accounts (Freighter)

A trustline tells the Stellar network your account is willing to hold USDC. Without it, USDC transfers to your address will fail.

**Via Freighter:**

1. Open the Freighter extension.
2. Go to **Settings** → **Manage Assets**.
3. Click **"Add asset"**.
4. Enter the testnet USDC contract ID. (The current testnet USDC issuer can be found in the [Circle faucet docs](https://faucet.circle.com) or your MindVault operator.)
5. Confirm the trustline transaction in Freighter.

**Via Stellar Laboratory:**

1. Open the [Stellar Laboratory](https://laboratory.stellar.org/#?network=testnet).
2. Build a **Change Trust** operation with the USDC asset code and issuer.
3. Sign and submit with your Freighter public key.

After the trustline is added, your account can receive USDC.

### Sponsored MCP wallets

The `mindvault_setup_wallet` tool establishes the trustline automatically. Run it again if you need to recreate the wallet.

---

## 4. Fund USDC

Once your account has an XLM reserve and a USDC trustline, fund it with spendable testnet USDC:

1. Visit the [Circle testnet faucet](https://faucet.circle.com).
2. Paste your G-address.
3. Complete any CAPTCHA or rate-limit gate.
4. Wait for the transaction to settle (usually 5–15 seconds).

The faucet sends a small amount of testnet USDC — enough for several verification fees (USDC 0.10 each) and resource purchases.

### Check your balance

**Via Stellar Explorer:**

1. Open [stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet).
2. Paste your G-address.
3. Check **Balances** — you should see a **USDC** entry with your funded amount.

**Via Freighter:**

The extension shows your USDC balance on the main screen after a trustline is established.

**Via MCP:**

Run `mindvault_wallet_info` to see the current balance and address.

---

## 5. Verify everything works

| Check | Browser wallet | MCP / agent |
|-------|----------------|-------------|
| Account exists on testnet | Yes (created in Freighter) | Yes (after `mindvault_setup_wallet`) |
| XLM balance > 1.5 | ~10,000 from friendbot | ~1.5 from sponsor |
| USDC trustline | Must be added manually | Added automatically |
| USDC balance > 0 | From [Circle faucet](https://faucet.circle.com) | From [Circle faucet](https://faucet.circle.com) |

---

## Common failure messages

| Error / symptom | Likely cause | Fix |
|-----------------|--------------|-----|
| `op_no_destination` or account not found | Account does not exist on testnet | Fund XLM via [friendbot](#2-fund-xlm-reserve--fees) |
| `op_no_trust` | No USDC trustline | [Add trustline](#3-add-the-usdc-trustline) |
| `op_underfunded` | Insufficient XLM for reserve or fee | Fund more XLM via [friendbot](#2-fund-xlm-reserve--fees) |
| `op_line_full` or balance cap reached | Trustline limit is too low | Remove the limit when adding the trustline |
| USDC balance shows `0` after faucet | Faucet payment hasn't settled yet | Wait 10–15 seconds and refresh Stellar Explorer |
| USDC balance shows `0` with trustline existing | Never funded from faucet | Visit [faucet.circle.com](https://faucet.circle.com) |
| `mindvault_setup_wallet` fails | Insufficient sponsor XLM | Contact the deployment operator |
| Friendbot returns `400` | The address is on the wrong network (mainnet) | Switch friendbot URL to testnet variant |

---

## Reference links

| Resource | URL |
|----------|-----|
| Freighter browser extension | [freighter.app](https://freighter.app) |
| Circle testnet USDC faucet | [faucet.circle.com](https://faucet.circle.com) |
| Stellar Laboratory (friendbot) | [laboratory.stellar.org](https://laboratory.stellar.org/#account-creator?network=testnet) |
| Stellar Explorer (testnet) | [stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet) |
| x402 payment troubleshooting | [docs/x402-payment-troubleshooting.md](x402-payment-troubleshooting.md) |
| Wallet connection troubleshooting | [docs/wallet-connection-troubleshooting.md](wallet-connection-troubleshooting.md) |
