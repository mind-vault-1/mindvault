# MCP Server Status Resource

The MindVault MCP server exposes its active network, registry contract, tool
capability version, and operational status as a read-only MCP resource at
`mindvault://server/status` (#1064). An agent can check which network it is
about to spend on, or whether the tool list it cached is still current, with a
plain `resources/read`. That needs no tool call and has no side effects.

Source: [`mcp/src/serverStatusResource.ts`](../mcp/src/serverStatusResource.ts),
wired up in [`mcp/src/index.ts`](../mcp/src/index.ts).

## Reading it

`resources/list` returns the status resource first, ahead of the catalog
entries (`mindvault://resource/<id>`):

```json
{
  "uri": "mindvault://server/status",
  "name": "MindVault server status",
  "mimeType": "application/json"
}
```

`resources/read` with that URI returns one `application/json` text content:

```json
{
  "schema": "mindvault.server-status/v1",
  "server": { "name": "mindvault", "version": "1.0.0" },
  "network": {
    "stellarNetwork": "testnet",
    "x402Network": "stellar:testnet",
    "mainnet": false
  },
  "registry": {
    "contractId": "CB…",
    "networkPassphrase": "Test SDF Network ; September 2015"
  },
  "capabilities": {
    "toolCapabilityVersion": "sha256:3f9a0c1e7b2d4a65",
    "toolCount": 58
  },
  "status": {
    "mode": "live",
    "readOnly": false,
    "walletConfigured": true,
    "publisherRegistered": false
  }
}
```

| Field                                | Meaning                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `network.stellarNetwork`             | `testnet` or `mainnet` — the network of the active profile.                 |
| `network.x402Network`                | CAIP-2 id used for x402 payments (`stellar:testnet` / `stellar:pubnet`).    |
| `network.mainnet`                    | `true` when calls spend real funds.                                         |
| `registry.contractId`                | The vault-registry Soroban contract the server reads and writes.            |
| `registry.networkPassphrase`         | The passphrase transactions are signed for.                                 |
| `capabilities.toolCapabilityVersion` | Hash of the advertised tool surface (see below).                            |
| `capabilities.toolCount`             | Number of tools ListTools advertises right now.                             |
| `status.mode`                        | `mock` under `MINDVAULT_MOCK`, otherwise `live`.                            |
| `status.readOnly`                    | `MINDVAULT_READ_ONLY` is on; mutating and paying tools are withheld.        |
| `status.walletConfigured`            | The active profile has a wallet. The address itself is not included.        |
| `status.publisherRegistered`         | The active profile has a publisher API key. The key itself is not included. |

### Tool capability version

`toolCapabilityVersion` is `sha256:` followed by the first 16 hex characters of
a SHA-256 over every advertised tool's name, `inputSchema`, `outputSchema`, and
`annotations`, in name order. It is identical across restarts for the same
surface. It changes when a tool is added, removed, or changes its contract, or
when read-only mode withholds tools. Description wording is excluded, because
rewording a description doesn't change the contract. An agent that cached
`tools/list` can compare this value to decide whether to fetch the list again.

## Guarantees

- **Read-only.** The document is built from live configuration on every read.
  No tool, request, or argument writes to it.
- **Current.** After `mindvault_use_profile`, `mindvault_switch_network_profile`,
  `mindvault_import_wallet`, `mindvault_setup_wallet`, or any other call that
  changes these values, the next read reflects the change.
- **No secrets or wallet identity.** It never contains secret keys, API keys,
  wallet addresses, or profile names. Profile names are free-form and can name a
  person, so they are excluded. It also never contains RPC or Horizon URLs,
  which can carry a provider key; `mindvault_network_profile` still reports
  those to an agent that needs them. Wallet state appears only as the booleans
  above.

## Change notifications

The server advertises `resources: { "subscribe": true }`. A client that sends
`resources/subscribe` for `mindvault://server/status` is sent
`notifications/resources/updated` with that URI after any tool call that
changed the document. A call that leaves it unchanged sends no notification.
`resources/unsubscribe` stops them.

Only the status resource supports subscriptions. Subscribing to a catalog URI
(`mindvault://resource/<id>`) fails with `InvalidParams`.

## Tests

[`mcp/src/serverStatusResource.test.ts`](../mcp/src/serverStatusResource.test.ts)
covers the version hash and the builders. It also drives the real server over
the SDK in-memory transport: listing, reading, following a profile change
without exposing the wallet or profile name, following a mainnet switch with a
subscriber notification, sending no notification for a no-op call, and
rejecting catalog subscriptions.

## Related docs

- [mcp-quickstart.md](mcp-quickstart.md) — catalog resources
- [mcp-wallet-profiles.md](mcp-wallet-profiles.md)
- [mcp-tool-reference.md](mcp-tool-reference.md) — `mindvault_network_profile`, `mindvault_registry_info`
