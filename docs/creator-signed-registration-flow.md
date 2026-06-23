# Creator-Signed Registration Flow

This document describes the end-to-end flow for registering a resource on the vault-registry contract using creator-signed transactions. The server builds an unsigned transaction, the creator signs it (via browser wallet or MCP agent key), and the server submits and persists the result.

## Motivation

The vault-registry contract requires the creator's authorization to register a resource (`require_auth`). The server cannot sign on behalf of the creator — the creator must sign the transaction themselves. This design supports both web (browser wallet) and MCP (agent key) signing paths.

## Sequence Diagram

```
Creator (Browser/MCP)          Server                     Stellar/Soroban
        |                        |                              |
        |  POST /resources/:id   |                              |
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
        |                        |  onchain_status = registered |
        |                        |                              |
        |  { id, status:         |                              |
        |    "confirmed" }       |                              |
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

### `POST /resources/:id/register/prepare`

Builds an unsigned `register` transaction for the given resource.

**Auth:** API key (authenticated publisher)

**Request:** No body required — the resource's on-chain data is read from the DB.

**Response:**
```json
{
  "unsignedXdr": "<base64-encoded-transaction-xdr>",
  "networkPassphrase": "Test SDF Network ; September 2015"
}
```

**Errors:**
- `404` — Resource not found
- `403` — Publisher does not own this resource

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
  "status": "confirmed"
}
```

**Errors:**
- `404` — Resource not found
- `403` — Publisher does not own this resource
- `502` — Transaction rejected or failed on-chain
- `504` — Transaction confirmation timed out

## Implementation Notes

- The prepare endpoint converts the resource's price from USDC string (e.g. `"0.50"`) to stroops (i128, 7 decimals) before passing to the contract
- The submit endpoint follows the same pattern as `POST /resources/:id/price` — submit via RPC, poll for confirmation, update DB
- On confirmation, set `onchain_status = "registered"` in the resources table
- On failure, set `onchain_status = "failed"` and return the error detail
- Set `onchain_status = "pending"` when the prepare endpoint is called (before signing)

## DB State Transitions

```
none → pending (prepare called)
pending → registered (tx confirmed on-chain)
pending → failed (tx failed on-chain)
failed → pending (retry: prepare called again)
```

## References

- Existing prepare/submit pattern: `server/src/routes/resources.ts` (set_price endpoints)
- Contract entrypoint: `contract/contracts/vault-registry/src/lib.rs` — `register(creator, id, price, metadata)`
- Generated bindings: `packages/registry-client/src/generated/index.ts`
