# Wallet Connection Troubleshooting

Browser wallet connection and signing issues are common when first using MindVault. This guide covers the problems you may encounter when connecting a Stellar wallet (Freighter) to the web app and how to resolve them.

## Quick checklist

Before diving into a specific error, confirm:

1. **Extension installed** — Freighter must be installed from the [Chrome Web Store](https://chromewebstore.google.com/detail/freighter/bjacdkcmnpnlddgplnaoknjhfdbimmbh) or [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/freighter/).
2. **Extension unlocked** — The extension must be unlocked (not just installed). Open the extension and enter your password.
3. **Correct network** — Freighter must be set to **Stellar Testnet** to match MindVault's demo deployment.
4. **Wallet funded** — The connected account needs testnet XLM (for reserves) and USDC (for payments).

---

## Symptom → cause → fix

### Wallet not installed (`freighterApi` undefined)

**Symptom:** Clicking "Connect wallet" shows _"Freighter wallet not found. Please install the Freighter browser extension."_

**Cause:** The Freighter extension is not installed, or the page hasn't detected it. The web app checks for `window.freighterApi` — this global is only injected when the extension is installed and active.

**Fix:**

1. Install Freighter from the [Chrome Web Store](https://chromewebstore.google.com/detail/freighter/bjacdkcmnpnlddgplnaoknjhfdbimmbh) or [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/freighter/).
2. After installation, reload the MindVault page so the `freighterApi` global becomes available.
3. Click "Connect wallet" again.

**Note:** MindVault plans to support other Stellar wallets (xBull, Albedo) via `@creit.tech/stellar-wallets-kit`. For now, Freighter is the primary supported browser wallet.

---

### Wrong network

**Symptom:** Connection succeeds, but signing fails with _"Wrong network"_ or similar error when trying to register a resource or approve a transaction. The Freighter extension may also show a banner saying the app expects a different network.

**Cause:** Freighter is set to **Mainnet** (Public Global Network) but MindVault runs on **Testnet**. The network passphrase baked into the transaction does not match what Freighter expects.

**Fix:**

1. Open the Freighter extension.
2. Click the network dropdown in the top-left corner (it likely says "Public Global").
3. Switch to **"Testnet"**.
4. Retry the signing action in MindVault.

To verify the correct network after switching, connect your wallet and check the address appears in MindVault's header. If you still see network errors, confirm the server's `NETWORK` env matches (see [server env docs](server-env.md)).

See also: [x402 payment troubleshooting — Wrong network](x402-payment-troubleshooting.md#wrong-network-testnet-vs-mainnet).

For the full browser buyer flow (catalog → 402 → sign → delivery), see [x402 browser payment walkthrough](x402-browser-payment-walkthrough.md).

---

### Rejected signature

**Symptom:** Clicking "Register on-chain" or confirming a price change shows a signing prompt, but after dismissing or rejecting it, the operation fails. The wallet may show the error string returned by Freighter.

**Cause:** The user closed the Freighter popup without signing, or explicitly rejected the signature request. Freighter requires explicit user approval for every transaction.

**Fix:**

1. Click the action again (e.g. "Register on-chain") to re-trigger the signing flow.
2. When Freighter opens, review the transaction details carefully.
3. Click **"Approve"** (not "Reject" and not the browser's close button on the popup).
4. If the popup is blocked by the browser, allow popups from the MindVault site (see [Browser permission issues](#popup-blocked-or-browser-permission-issues) below).

> **Tip:** If you accidentally reject, simply trigger the same action again. There is no penalty for rejection — the transaction is never submitted on-chain.

---

### Missing trustline or insufficient funds

**Symptom:** Signing appears to succeed, but the on-chain operation fails with trustline errors, or the web UI shows errors about failed registration or payment. The Freighter prompt may warn about missing trustline or insufficient balance.

**Cause (trustline):** Classic Stellar accounts must explicitly trust the USDC issuer before they can hold or send USDC. A newly created wallet likely does not have a USDC trustline.

**Cause (funds):** The wallet lacks testnet XLM (for transaction fees) or testnet USDC.

**Fix:**

1. **Add a trustline** in Freighter:
   - Open the extension → **Settings** → **Manage Assets**.
   - Click **"Add asset"** and enter the testnet USDC contract ID (see the deployment runbook or ask the operator).
   - Confirm the trustline transaction in Freighter.
2. **Fund your wallet**:
   - XLM: Use the [Stellar testnet friendbot](https://laboratory.stellar.org/#account-creator?network=testnet) to obtain free testnet XLM.
   - USDC: Get testnet USDC from the [Circle faucet](https://faucet.circle.com).
3. Retry the operation after the trustline is established and funds are confirmed on [Stellar Explorer (testnet)](https://stellar.expert/explorer/testnet).

See also:
- [x402 payment troubleshooting — Missing USDC trustline](x402-payment-troubleshooting.md#missing-usdc-trustline)
- [x402 payment troubleshooting — Insufficient USDC balance](x402-payment-troubleshooting.md#insufficient-usdc-balance)
- [FAQ — What wallet do I need as a creator?](faq.md#what-wallet-do-i-need-as-a-creator)

---

### Popup blocked or browser permission issues

**Symptom:** Clicking "Connect wallet" or a signing button does nothing. No Freighter popup appears. The browser's address bar may show a popup-blocked icon.

**Cause:** Freighter opens a popup window for connection and signing. Browsers block these popups by default if the user hasn't interacted with the page recently, or if popups are blocked globally.

**Fix:**

1. Look for the popup-blocked icon in the address bar (🔇 or similar) and click it.
2. Select **"Always allow popups from app.mindvault.app"** (or whichever MindVault domain you are on).
3. Click "Connect wallet" again.
4. If the issue persists, check your browser's popup blocker settings:
   - **Chrome:** Settings → Privacy and security → Site Settings → Pop-ups and redirects → Allow.
   - **Firefox:** Options → Privacy & Security → Permissions → Block pop-up windows → Exceptions.
   - **Brave:** Shields may block popups — disable Brave Shields for the site, or click the Brave icon → Advanced Controls → allow Popups.

Once popups are allowed, the Freighter prompt should appear on the next connect or signing action.

---

## Error reference

This table summarises the error messages you may see in the MindVault web UI and what they mean.

| UI error message | Scenario | Action |
|---|---|---|
| `Freighter wallet not found. Please install the Freighter browser extension.` | `window.freighterApi` is undefined | [Install wallet](#wallet-not-installed-freighterapi-undefined) and reload |
| `Freighter is not connected. Open the extension and unlock your wallet.` | Extension installed but locked | Open Freighter and unlock |
| `Could not retrieve public key from Freighter.` | Freighter returned no public key | Reconnect or reinstall Freighter |
| `Failed to connect wallet.` | Generic catch-all error | Check browser console; retry |
| `Wrong network` (from Freighter) | Network mismatch — likely Mainnet vs Testnet | [Switch to Testnet](#wrong-network) |
| Popup does not open / nothing happens | Popup blocker or browser permissions | [Allow popups](#popup-blocked-or-browser-permission-issues) |
| Trustline error or missing asset | Account has no USDC trustline | [Add trustline](#missing-trustline-or-insufficient-funds) |
| Insufficient balance / fee error | Not enough XLM or USDC | [Fund wallet](#missing-trustline-or-insufficient-funds) |

---

## Browser (Freighter) vs agent wallets

| Aspect | Browser (Freighter) | MCP / agent |
|--------|---------------------|-------------|
| Key storage | Freighter extension (encrypted) | In-memory only (lost on process exit) |
| Trustline | User must add manually | Created automatically by `mindvault_setup_wallet` |
| Network config | User sets in extension | Hardcoded to testnet |
| Signing | User approves each transaction | Programmatic via secret key |
| Popup required | Yes | No |

See the [x402 payment troubleshooting](x402-payment-troubleshooting.md#browser-stellar-wallets-kit-vs-mcp--agent-signing) guide for a more detailed comparison.

---

## Still stuck?

1. Open your browser's developer console (F12) and look for any Freighter-related errors or warnings.
2. Try disconnecting and reconnecting: click "Disconnect" in the header, then "Connect wallet" again.
3. Check [Stellar Explorer](https://stellar.expert/explorer/testnet) for your account's balance and trustlines.
4. If the problem is related to payment or signing during a resource transaction, see [x402 payment troubleshooting](x402-payment-troubleshooting.md).
5. Open a GitHub issue with: network (testnet/mainnet), browser name and version, the exact error message, and your Stellar G-address (never post your secret key).
