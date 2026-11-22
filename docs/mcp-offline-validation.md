# Local-Only MCP Validation and Offline Limitations

Some MCP tools and checks run entirely on the local machine with no network
calls. Others require upstream services (Horizon, Soroban RPC, the MindVault
API, or the x402 facilitator). This document lists which checks fall into each
category and how to invoke offline mode where available.

---

## Tools that run entirely offline

These tools make no outbound network calls. They are safe to run in an
air-gapped or offline environment, in a CI pipeline, or before any wallet is
funded.

### `mindvault_verify_install`

Runs seven local checks synchronously. No wallet is required. No network calls
are made.

```
mindvault_verify_install
```

| Check name | What it verifies | Requires network? |
| ----------------------------- | ---------------------------------------------------------------- | ----------------- |
| `node_version` | Node.js ≥ v20 (the package engine requirement) | No |
| `mcp_sdk_version` | `@modelcontextprotocol/sdk` ≥ 1.12.1 | No — reads local `package.json` |
| `STELLAR_NETWORK` | Value is `testnet`, `mainnet`, `pubnet`, `public`, or absent (defaults to testnet) | No |
| `MINDVAULT_URL` | When set, must be a valid `http(s)://` URL | No — format check only |
| `SPONSORED_ACCOUNT_URL` | When set, must be a valid `http(s)://` URL | No — format check only |
| `HORIZON_URL` | When set, must be a valid `http(s)://` URL | No — format check only |
| `SOROBAN_RPC_URL` | When set, must be a valid `http(s)://` URL | No — format check only |
| `VAULT_REGISTRY_CONTRACT_ID` | Required on mainnet; must match `C` + 55 base32 chars when set | No |
| `no_plaintext_secrets` | No env var whose name contains `secret`, `private_key`, or `mnemonic` is set | No |

`mindvault_verify_install` does **not** connect to Horizon, Soroban RPC, or the
MindVault API. It cannot confirm that a configured `MINDVAULT_URL` is reachable,
that the Stellar network is online, or that the vault-registry contract is
deployed and matches a known manifest. For those checks, use
`mindvault_verify_deployment` (see below).

### `mindvault_preflight`

Validates the configured contract ID, Stellar network, x402 network, and
supported resource schema versions using local configuration only. Source:
`mcp/src/tools.ts` — described as "purely local and read-only — no network
calls".

```
mindvault_preflight
```

| Check | Requires network? |
| --------------------------------- | ----------------- |
| Contract ID format | No |
| `STELLAR_NETWORK` recognised value | No |
| x402 network derived from env | No |
| Resource schema version range | No |

---

## Catalog fallback cache (offline browsing)

When the MindVault API is unreachable, `mindvault_browse` and
`mindvault_search` fall back to a local snapshot written by the catalog cache
(`mcp/src/catalogCache.ts`). The snapshot is populated at MCP server startup
(best-effort) and can also be refreshed manually:

```
mindvault_prewarm_catalog
```

The fallback snapshot has two age thresholds controlled by environment
variables:

| Variable | Default | Meaning |
| --------------------------------------- | ------- | --------------------------------------------------------------- |
| `MINDVAULT_CATALOG_STALENESS_WARNING_S` | —       | Age (seconds) at which a staleness warning is added to results |
| `MINDVAULT_CATALOG_MAX_AGE_S` | —       | Age past which the snapshot is withheld entirely |

When no snapshot is available and the API is unreachable, `mindvault_browse`
and `mindvault_search` will fail with a network error rather than return stale
data.

---

## Checks that require upstream services

The following checks and tools connect to at least one upstream service and
will fail or return partial results without network access.

### `mindvault_verify_deployment`

Calls Soroban RPC (`getNetwork`, `getContractWasmByContractId`) and simulates
two contract reads (`registry_info()`, `contract_version()`). Requires a
reachable Soroban RPC endpoint. Fully read-only — no signing, no wallet.

| What is checked | Requires |
| -------------------------------- | ------------------------------ |
| Network passphrase (matches env) | Soroban RPC `getNetwork` |
| Contract ID on-chain | Soroban RPC `getContractWasm…` |
| `contract_version` / crate ver | Soroban RPC simulation |
| `resource_schema_version` | Soroban RPC simulation |
| WASM hash | Soroban RPC WASM download |

### Payment and publishing tools

All tools that sign or submit transactions, buy resources, publish resources,
or look up purchase history from the registry require the MindVault API and/or
Stellar/Soroban RPC:

| Tool | Requires |
| ----------------------------------- | ---------------------------------------------------- |
| `mindvault_buy` | MindVault API, x402 Facilitator, Stellar/Soroban |
| `mindvault_publish` | MindVault API, x402 Facilitator, Stellar/Soroban |
| `mindvault_buy_lease` | MindVault API, x402 Facilitator, Stellar/Soroban |
| `mindvault_tx_status` | Horizon RPC |
| `mindvault_wallet_info` | Horizon (balance check) |
| `mindvault_wallet_balances` | Horizon (per-profile balance) |
| `mindvault_lease_status` | Soroban RPC (contract read) |
| `mindvault_browse` / `mindvault_search` | MindVault API (falls back to local cache on failure) |

### Wallet tools with local state

These tools interact with `~/.mindvault/state.json` locally but may also call
Horizon to confirm on-chain state:

| Tool | Local | Upstream |
| --------------------------------- | ----------- | ---------------------- |
| `mindvault_setup_wallet` | Writes state | Sponsored-account service, Stellar |
| `mindvault_import_wallet` | Writes state | None (dry-run first step) |
| `mindvault_list_profiles` | Reads state | None |
| `mindvault_wallet_allowance` | Reads receipts | None (derived estimate) |

---

## Running offline validation in CI

To validate configuration without a network connection (e.g. in a CI step that
runs before a deployment):

```bash
# Install dependencies
pnpm install

# Run install checks — no network calls
npx @modelcontextprotocol/inspector --cli node mcp/dist/index.js \
  --tool mindvault_verify_install

# Or via the MCP server directly for scripting
node -e "
  import('./mcp/src/verifyInstall.js').then(({ verifyInstall, formatVerifyInstall }) => {
    const result = verifyInstall(process.env);
    console.log(formatVerifyInstall(result));
    process.exit(result.ok ? 0 : 1);
  });
"
```

The exit code is `0` on a full pass and `1` on any failed check, making it
usable as a CI gate.

---

## Summary: offline vs. network-required checks

| Capability | Offline? |
| --------------------------------------- | -------- |
| `mindvault_verify_install` | ✓ Fully offline |
| `mindvault_preflight` | ✓ Fully offline |
| Catalog fallback cache (stale browse) | ✓ With a warm snapshot |
| `mindvault_verify_deployment` | ✗ Soroban RPC required |
| Any payment or publishing tool | ✗ MindVault API + Stellar required |
| Wallet balance checks | ✗ Horizon required |
| Live catalog search | ✗ MindVault API required |

---

## See also

- [Install verification (`mindvault_verify_install`)](mcp-verify-install.md) — full check reference
- [Deployment verification (`mindvault_verify_deployment`)](mcp-deployment-verification.md) — on-chain comparison
- [Catalog cache](mcp-catalog-cache.md) — offline catalog fallback detail
- [Environment variables](mcp-env-variables.md) — all supported env vars with defaults
