# Install Verification (`mindvault_verify_install`)

`mindvault_verify_install` is a self-diagnostic tool that confirms the MindVault
MCP server is installed and configured correctly. It is the right first call
when connecting a new agent or diagnosing a configuration problem.

All checks are **local and synchronous** — no network calls are made, no wallet
is required, and no funds are at risk.

## Usage

Once the server is connected to your MCP client, call the tool with no arguments:

```
mindvault_verify_install
```

A passing install looks like:

```
✓ MindVault MCP install OK.

✓ Node.js v20.11.0 (>= v20 required) ✓
✓ STELLAR_NETWORK: unset (defaults to testnet)
✓ MINDVAULT_URL: unset (default hosted backend in use)
✓ SPONSORED_ACCOUNT_URL: unset (default service in use)
✓ VAULT_REGISTRY_CONTRACT_ID: unset (testnet default in use)
✓ No obvious secret-key variable names found in the MCP process environment.
```

A failing install names every problem:

```
✗ MindVault MCP install has issues.

✗ Node.js v18.20.0 is below the minimum v20. Upgrade Node.js.
✓ STELLAR_NETWORK: unset (defaults to testnet)
✓ MINDVAULT_URL: unset (default hosted backend in use)
✓ SPONSORED_ACCOUNT_URL: unset (default service in use)
✓ VAULT_REGISTRY_CONTRACT_ID: unset (testnet default in use)
✓ No obvious secret-key variable names found in the MCP process environment.

1 check(s) failed. Fix the items marked ✗ above, then try again.
See docs/mcp-client-configs.md for install instructions.
```

## Checks

| Check                        | What it verifies                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `node_version`               | Node.js ≥ v20 (the package engine requirement)                                            |
| `STELLAR_NETWORK`            | Value is `testnet`, `mainnet`, `pubnet`, `public`, or absent (defaults to testnet)        |
| `MINDVAULT_URL`              | When set, must be an absolute `http(s)://` URL                                            |
| `SPONSORED_ACCOUNT_URL`      | When set, must be an absolute `http(s)://` URL                                            |
| `VAULT_REGISTRY_CONTRACT_ID` | Required on mainnet; when set on testnet, must match the `C` + 55 base32 char format      |
| `no_plaintext_secrets`       | No environment variable whose name contains `secret`, `private_key`, or `mnemonic` is set |

## Tips

- **Run it after every config change.** If you change `STELLAR_NETWORK` or add a
  custom URL override, call `mindvault_verify_install` again to confirm the
  update was picked up correctly.

- **Mainnet requires a contract ID.** If `STELLAR_NETWORK=mainnet` and
  `VAULT_REGISTRY_CONTRACT_ID` is unset, the check fails. Deploy vault-registry
  and set the variable before using any on-chain tools.

- **Secrets do not belong in the MCP config.** The server never reads
  `AGENT_SECRET_KEY`, `PRIVATE_KEY`, or similar variables from the env — wallets
  are managed through `mindvault_setup_wallet`. If you have set one of these
  variables in your MCP client config, remove it.

- **For deeper diagnosis**, follow up with `mindvault_network_profile` (reports
  the resolved network config and any URL overrides) and `mindvault_registry_health`
  (makes live reachability checks against the API, Horizon, and Soroban RPC).

## Related

- [Client configs](mcp-client-configs.md) — copy-ready configs for every MCP client
- [Network profile tool](mcp-client-configs.md#environment-variables) — resolved runtime config
- [Smoke test](mcp-smoke-test.md) — end-to-end scenario over a real server process
- [Error reference](mcp-error-reference.md) — structured tool error shapes
