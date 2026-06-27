# Creator-Signed Registration Flow

This document describes the narrower creator-signed part of the lifecycle: registering an already-verified resource on the vault-registry contract. The server builds an unsigned transaction, the creator signs it (via browser wallet or MCP agent key), and the server submits and persists the result.

For the full create -> verify -> list -> register -> buy lifecycle, see [resource-publish-lifecycle.md](resource-publish-lifecycle.md).

## Motivation

The vault-registry contract requires the creator's authorization to register a resource (`require_auth`). The server cannot sign on behalf of the creator - the creator must sign the transaction themselves. This design supports both web (browser wallet) and MCP (agent key) signing paths.

## Sequence Diagram

```
Creator (Browser/MCP)          Server                     Stellar/Soroban
        |                        |                              |
        |  GET /resources/:id    |                              |
        |  /register/prepare     |                              |
        |----------------------->|                              |
        |                        |  Build unsigned register tx  |
        |                        |  (creator, id, price,        |
        |                        |   metadata)                  |
        |                        |----------------------------->|
        |                        |                              |
        |  { unsignedXdr,        |                              |
        |    networkPassphrase } |                              |
        |<-----------------------|                              |
        |                        |                              |
        |  Sign XDR locally      |                              |
        |  (browser wallet or    |                              |
        |   agent secret key)    |                              |
        |                        |                              |
        |  POST /resources/:id   |                              |
        |  /register             |                              |
        |  { signedXdr }         |                              |
        |----------------------->|                              |
        |                        |  Submit signed tx            |
        |                        |----------------------------->|
        |                        |                              |
        |                        |  tx hash / status            |
        |                        |<-----------------------------|
        |                        |                              |
        |                        |  Poll for confirmation       |
        |                        |----------------------------->|
        |                        |                              |
        |                        |  Update DB:                  |
        |                        |  onchain_status = pending    |
        |                        |  -> registered or failed     |
        |                        |                              |
        |  { id, onchainStatus,  |                              |
        |    txHash }            |                              |
        |<-----------------------|                              |
```

## Two Signing Paths

### Web Path (Browser Wallet)

1. Creator publishes a resource via the web app
2. Server builds the unsigned `register` transaction
3. Server returns `{ unsignedXdr, networkPassphrase }` to the browser
4. Browser uses `@stellar/freighter-api` to prompt the creator to sign via the [Freighter](https://www.freighter.app/) extension
5. Browser sends `{ signedXdr }` back to the server
6. Server submits, confirms, and updates the DB

### MCP Path (Agent Key)

1. Agent publishes a resource via the MCP server
2. Server builds the unsigned `register` transaction
3. Server returns `{ unsignedXdr, networkPassphrase }` to the MCP client
4. MCP server signs directly using the agent's secret key (no browser prompt)
5. MCP server sends `{ signedXdr }` back to the server
6. Server submits, confirms, and updates the DB

## API Shape

### `GET /resources/:id/register/prepare`

Builds an unsigned `register` transaction for the given resource.

**Auth:** API key (authenticated publisher)

**Request:** No body required - the resource's on-chain data is read from the DB.

**Response:**
```json
{
  "unsignedXdr": "<base64-encoded-transaction-xdr>",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "metadata": {
    "resourceId": "resource-id",
    "creator": "G...",
    "price": "0.50",
    "title": "My resource",
    "description": "Optional description"
  }
}
```

**Errors:**
- `400` - Resource must be verified before registering on-chain
- `404` - Resource not found
- `403` - Publisher does not own this resource
- `409` - Resource is already registered on-chain
- `500` - Failed to build register transaction

### `POST /resources/:id/register`

Submits the signed registration transaction and persists the on-chain status.

**Auth:** API key (authenticated publisher)

**Request:**
```json
{
  "signedXdr": "<base64-encoded-signed-transaction-xdr>"
}
```

**Response:**
```json
{
  "id": "resource-id",
  "onchainStatus": "registered",
  "txHash": "<stellar-transaction-hash>"
}
```

**Errors:**
- `400` - Resource must be verified before registering on-chain
- `404` - Resource not found
- `403` - Publisher does not own this resource
- `409` - Resource is already registered on-chain or registration is already in progress
- `502` - Transaction rejected, failed on-chain, or confirmation timed out in the current submit helper

## Implementation Notes

- The prepare endpoint converts the resource's price from USDC string (e.g. `"0.50"`) to stroops (i128, 7 decimals) before passing to the contract
- The prepare endpoint only builds XDR; it does not mutate the DB
- On confirmation, set `onchain_status = "registered"` in the resources table
- On failure or timeout, set `onchain_status = "failed"` and return the error detail
- Set `onchain_status = "pending"` when the submit endpoint is called (before RPC submission)
- A resource with `onchain_status = "failed"` can be retried later

## DB State Transitions

```
none -> pending (submit called)
pending -> registered (tx confirmed on-chain)
pending -> failed (tx failed or confirmation timed out)
failed -> pending (retry: submit called again)
```

## References

- Full lifecycle: `docs/resource-publish-lifecycle.md`
- Existing prepare/submit pattern: `server/src/routes/resources.ts` (set_price endpoints)
- Contract entrypoint: `contract/contracts/vault-registry/src/lib.rs` - `register(creator, id, price, metadata)`
- Generated bindings: `packages/registry-client/src/generated/index.ts`
