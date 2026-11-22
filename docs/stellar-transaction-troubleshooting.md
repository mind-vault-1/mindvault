# Troubleshoot a Stellar transaction failure

Start with the operation, network and transaction hash, if one was returned.
For MCP, run `mindvault_network_profile` to verify the network and RPC endpoint.
For an on-chain registry write, run `mindvault_onchain_preflight` to check the
local registry configuration. If you are investigating an x402 challenge or
payment header, see [x402 payment troubleshooting](x402-payment-troubleshooting.md).

## Decision tree

1. **Did signing or simulation stop before submission?**
   - If the wallet declined to sign or reported a network mismatch, verify the
     selected account and network before asking for a signature again.
   - If simulation reported an error, inspect the simulation error and any
     diagnostic events. Check the contract ID, method arguments, authorization
     and account funding. For USDC, check the asset and trustline as applicable.
     Correct the underlying problem, then build and simulate a fresh
     transaction. See [Stellar RPC simulateTransaction](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/simulateTransaction).
2. **Did submission return a response?**
   - With `PENDING` or `DUPLICATE`, look up the existing hash. Submission
     acknowledgement leaves the ledger outcome pending.
   - With `ERROR`, decode `errorResultXdr` and inspect any
     `diagnosticEventsXdr`. A sequence error such as `tx_bad_seq` calls for a
     fresh account sequence after resolving any earlier submission. A fee or
     funding error calls for checking XLM for fees and reserves and reviewing
     the estimated fee.
   - With `TRY_AGAIN_LATER`, a timeout or a lost response, check the known hash
     first. If the outcome is still unknown, reconcile against the original
     submission and payment receipt before building or signing a replacement.
     See [Stellar RPC sendTransaction](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/sendTransaction).
3. **What does the ledger lookup report?** Run `mindvault_tx_status` with
   `{"txHash":"<64-character hex hash>"}`.
   - **`SUCCESS`** — the transaction landed. If MindVault still shows a pending
     registration, query `mindvault_publish_status` with the resource ID and
     check synchronization before submitting again.
   - **`FAILED`** — the transaction landed and failed. Inspect `resultXdr` for
     transaction and operation codes, and use `resultMetaXdr` or RPC diagnostic
     events when available to investigate a contract failure.
   - **`NOT_FOUND`** — confirm the network and hash, allow time for inclusion,
     and check the RPC retention window. Use an explorer or the original
     submission records for older transactions. This status alone leaves
     settlement unresolved.
     See [Stellar RPC getTransaction](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction)
     and [Stellar result codes](https://developers.stellar.org/docs/data/apis/horizon/api-reference/errors/result-codes).

If the failure is still unclear, collect the network, operation, timestamp,
transaction hash if known, status and decoded error code. Use that information
with the [MCP error reference](mcp-error-reference.md) or share it when asking
for support. Keep wallet secrets, API keys and unsubmitted signed XDR private.

## Worked example

After `mindvault_register_onchain` returns a testnet transaction hash, call
`mindvault_tx_status` with the hash. Suppose the first lookup returns
`NOT_FOUND`. Confirm `mindvault_network_profile` shows testnet, allow another
ledger close, and query the same hash again. If the next result is `SUCCESS`,
use `mindvault_publish_status` with the resource ID to check whether MindVault
has recorded the registration. No new registration or payment is needed.
