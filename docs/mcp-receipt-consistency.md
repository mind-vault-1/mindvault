# MCP Receipt Consistency and Purchase Recovery

Issue [#1273](https://github.com/mind-vault-1/mindvault/issues/1273).

A receipt answers a narrower question than most agents assume. It says _this
MCP server recorded a purchase attempt and captured whatever the payment
response returned_. It does not, on its own, say that Soroban committed the
payment. Confirmation is a separate observation made by polling the
transaction hash. Keeping those two facts apart is what prevents both failure
modes: paying twice for a purchase that already settled, and abandoning a
purchase that never finished indexing.

Sources: [`mcp/src/purchaseHistory.ts`](../mcp/src/purchaseHistory.ts),
[`mcp/src/settlement.ts`](../mcp/src/settlement.ts),
[`mcp/src/index.ts`](../mcp/src/index.ts), and
[`mcp/src/errorCodes.ts`](../mcp/src/errorCodes.ts).

## What a receipt proves

`mindvault_buy` writes a local record under `~/.mindvault/purchases.json` (or
`MINDVAULT_PURCHASES_FILE`) after the paid fetch returns successfully. The
write is **best effort**: if it fails, the tool only logs
`"MindVault MCP: failed to persist purchase receipt:"` and still returns the
purchase summary. A missing receipt is therefore not evidence that no payment
happened.

Each `PurchaseReceipt` stores:

| Field                  | Meaning                                                  |
| ---------------------- | -------------------------------------------------------- |
| `resourceId`           | Resource that was purchased                              |
| `amount`               | Decimal USDC string                                      |
| `network`              | x402 / Stellar network id, e.g. `stellar:testnet`        |
| `txHash`               | On-chain payment hash, or `null` when none was available |
| `timestamp`            | ISO-8601 instant the receipt was recorded                |
| `receiptRef`           | Server payment id, or `null`                             |
| `title`                | Optional resource title                                  |
| `clientIdempotencyKey` | Internal attempt key, e.g. `buy:abc123:<uuid>`           |
| `profile`              | Local wallet profile, if the receipt was profile-scoped  |

`mindvault_purchase_history` adds two derived fields to each row: `status`
(from `purchaseStatusOf`) and `explorerUrl` (null when there is no `txHash`).
`mindvault_export_receipts` turns the same rows into a
`mindvault.receipt-export/v1` envelope with `purchasedAt`, `currency: "USDC"`,
and `txHash`/`receiptRef`. Neither tool makes a network call. The export has
no `status` or `clientIdempotencyKey` column, so it cannot be used to prove
settlement either; see [mcp-receipt-export.md](mcp-receipt-export.md).

Limits worth knowing:

- `status: "settled"` in the history means **a `txHash` was recorded**. It does
  not mean `mindvault_tx_status` reported `SUCCESS`.
- Receipts are pruned after `MINDVAULT_RECEIPT_RETENTION_DAYS` (90 by default);
  see [mcp-retention.md](mcp-retention.md).
- A store written under a different state-file epoch is dropped as empty, and
  receipts without a `profile` are reported as `(unscoped)` rather than
  attributed to the active wallet.

## How transaction confirmation affects status

`mindvault_buy` returns a `settlement` block next to `txHash`. Its `waitPolicy`
says what the call actually did:

| Policy                  | Behaviour                                                              |
| ----------------------- | ---------------------------------------------------------------------- |
| `return-after-submit`   | Default. Return as soon as the payment response arrives; no polling.   |
| `wait-for-final-result` | Poll `getTransaction` until a terminal status or the bounded deadline. |

`wait: true` is the legacy shorthand for `wait-for-final-result`; `waitPolicy`
wins if both are supplied. `timeoutMs` defaults to 60000 and is clamped to
300000; `intervalMs` defaults to 2000 with a 200 ms minimum.

The snapshot always carries `txHash` and `status`. `status` is `null` only when
no status was read, never omitted:

```json
{
  "polled": true,
  "waitPolicy": "wait-for-final-result",
  "txHash": "c0ffee01",
  "status": "SUCCESS",
  "settled": true,
  "success": true,
  "timedOut": false,
  "cancelled": false,
  "attempts": 2,
  "skipped": false,
  "message": "Payment settled on-chain (status: SUCCESS) after 2 checks."
}
```

Only `SUCCESS` and `FAILED` are terminal. `NOT_FOUND`, `IN_PROGRESS`, and
`UNKNOWN` are non-terminal: polling continues, or a timeout ends the wait with
`timedOut: true` and a message like:

```text
Reached the settlement deadline without a terminal status (last status: NOT_FOUND). Re-check with mindvault_tx_status on c0ffee01.
```

Because the default is `return-after-submit`, the common unconfirmed snapshot
looks like this — `status: null` is "not checked", not "failed":

```json
{
  "polled": false,
  "waitPolicy": "return-after-submit",
  "txHash": null,
  "status": null,
  "settled": false,
  "success": false,
  "timedOut": false,
  "cancelled": false,
  "attempts": 0,
  "skipped": false,
  "message": "Settlement not checked. Pass wait: true to poll until the payment transaction settles."
}
```

When a caller asks to wait but the payment response carried no hash, `skipped`
becomes `true` and the message changes to:

```text
The payment response included no transaction hash, so on-chain settlement could not be polled. Re-check with mindvault_tx_status once a hash is available.
```

`mindvault_tx_status` is the authoritative live check. Pass a `txHash` and read
`status`. An empty hash returns `"Provide a transaction hash to look up."`.
A `NOT_FOUND` result is **not** proof of failure:

```json
{
  "status": "NOT_FOUND",
  "hash": "c0ffee01",
  "message": "Transaction not found on the configured Soroban RPC. It may be unconfirmed, on a different network, or outside the RPC's retention window.",
  "oldestLedger": 1000,
  "latestLedger": 1200
}
```

On a found transaction the response also includes `ledger`,
`ledgerCloseTime`, `applicationOrder`, `feeBump`, `envelopeXdr`, `resultXdr`,
and `resultMetaXdr`. The lookup is read-only and safe to repeat. See
[mcp-timeouts-retries.md](mcp-timeouts-retries.md#transaction-wait-policy) for
the wait-policy mechanics.

## Confirmed, pending, and unknown

The guide's "confirmed" is spelled three different ways in the current API.
Use the field that matches the question you are asking:

| Guide state | Evidence you hold                                             | `mindvault_purchase_history` | `settlement.status`    | `mindvault_tx_status`                 |
| ----------- | ------------------------------------------------------------- | ---------------------------- | ---------------------- | ------------------------------------- |
| Confirmed   | Receipt with hash **and** RPC says `SUCCESS`                  | `status: "settled"`          | `"SUCCESS"`            | `"SUCCESS"`                           |
| Pending     | Receipt with no hash, or a non-terminal transaction status    | `status: "pending"`          | `null` or non-terminal | `NOT_FOUND`, `IN_PROGRESS`, `UNKNOWN` |
| Unknown     | No receipt and no hash; response lost before a record arrived | no matching row              | no buy summary         | nothing to look up                    |

`purchaseStatusOf` currently returns `"settled"` whenever `txHash` is present
and `"pending"` otherwise. The `PurchaseStatus` type also declares
`"unknown"` and `"failed"`, but the classifier never returns `"failed"`, and
the advertised `PURCHASE_HISTORY_OUTPUT_SCHEMA` enum lists only
`["pending", "settled", "failed"]`. Treat `FAILED` from
`mindvault_tx_status` as the authoritative transaction-failure signal rather
than expecting a receipt row to say `status: "failed"`.

### Confirmed

```json
{
  "count": 1,
  "purchases": [
    {
      "resourceId": "abc123",
      "amount": "1.5",
      "network": "stellar:testnet",
      "txHash": "c0ffee01",
      "timestamp": "2026-08-25T11:59:07.000Z",
      "receiptRef": "pay-1",
      "title": "Intro to Stellar Smart Contracts",
      "profile": "default",
      "clientIdempotencyKey": "buy:abc123:6f8e2c10-4b3a-4d21-9f77-1a2b3c4d5e6f",
      "status": "settled",
      "explorerUrl": "https://stellar.expert/explorer/testnet/tx/c0ffee01"
    }
  ]
}
```

With `mindvault_tx_status` reporting `status: "SUCCESS"`, the payment is
settled. Do **not** pay again. If the protected content was not delivered,
re-fetch the resource instead of buying it a second time.

### Pending

A buy that returned before settlement has a hash but no terminal status, or no
hash at all. The receipt below carries `txHash: null`, so the history row says
`status: "pending"`:

```json
{
  "count": 1,
  "purchases": [
    {
      "resourceId": "abc123",
      "amount": "1.5",
      "network": "stellar:testnet",
      "txHash": null,
      "timestamp": "2026-08-25T11:59:07.000Z",
      "receiptRef": null,
      "status": "pending",
      "explorerUrl": null
    }
  ]
}
```

Pending means "the client cannot prove settlement yet". Poll
`mindvault_tx_status` with any hash you have; if there is no hash, wait and
re-check the history before considering another payment. A timeout or a
`NOT_FOUND` response is not evidence that the payment did not land.

### Unknown

The response was lost before a receipt was written, so there is no local row
and possibly no hash. A lookup by a known attempt key returns:

```json
{
  "idempotencyKey": "buy:abc123:6f8e2c10-4b3a-4d21-9f77-1a2b3c4d5e6f",
  "status": "unknown",
  "receipt": null,
  "message": "No purchase attempt with this idempotency key is recorded for this profile. If the original response was lost, the payment may still be in flight; check mindvault_tx_status, or retry mindvault_buy with the same key."
}
```

An empty key is rejected with:

```text
idempotencyKey is required to look up a purchase attempt. Pass the key you sent with mindvault_buy.
```

The lookup is scoped to the active wallet profile, so a receipt recorded under
another profile is never returned.

**Current limitation:** `clientIdempotencyKey` is generated internally as
`buy:<resourceId>:<uuid>` and sent as the `Idempotency-Key` header on the paid
fetch. The `mindvault_buy` input schema does **not** accept an idempotency key,
and the server does not deduplicate buys on that header. The lookup message's
"retry with the same key" is therefore not a supported user-level retry
contract — use the evidence checks below instead of assuming a replayed buy is
free.

## Recovery after an ambiguous submission

1. **Read the error code first.** `structuredContent` carries
   `schema: "mindvault.error/v1"`, `code`, `category`, `retry`, and `action`.
   The payment-relevant cases are:

   | Code                          | Stage / retry             | Action                                                                                                               |
   | ----------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
   | `MV_PAYMENT_REQUIRED`         | `quoted` / safe           | No funds moved. Retry with payment enabled, or raise the auto-pay ceiling.                                           |
   | `MV_PAYMENT_CEILING_EXCEEDED` | `declined` / safe         | No funds moved. Pass maxAutoPayUsdc at least as large as the price, or raise MINDVAULT_MAX_AUTO_PAY_USDC.            |
   | `MV_INSUFFICIENT_FUNDS`       | `declined` / safe         | No funds moved. Fund the wallet and retry.                                                                           |
   | `MV_PAYMENT_REJECTED`         | `submitted` / check first | Do NOT blindly retry — check mindvault_purchase_history and mindvault_tx_status first; the payment may have settled. |

   `safe` means nothing was committed; `check first` means the error alone
   cannot say whether value moved. See
   [mcp-x402-retry-classification.md](mcp-x402-retry-classification.md) and
   [mcp-error-codes.md](mcp-error-codes.md).

2. **Look for a receipt.** Call `mindvault_purchase_history` with the
   `resourceId`. A row with a `txHash` is evidence a payment was submitted;
   a row with `txHash: null` is evidence an attempt was recorded, not that it
   settled. No row means the client cannot prove either way.

3. **Check the hash, if you have one.** Call `mindvault_tx_status` and repeat
   it until it reports `SUCCESS` or `FAILED`, or until you have given up on
   the RPC retention window. `MV_TIMEOUT` by itself maps to no payment stage;
   a timeout during a buy is exactly the ambiguous case this step resolves.

4. **Act on the observation:**

   | Observation                                   | Safe next step                                                               |
   | --------------------------------------------- | ---------------------------------------------------------------------------- |
   | `SUCCESS`                                     | Do not pay again; re-fetch the resource if delivery failed.                  |
   | `FAILED`                                      | The transaction is definitively rejected; fix the cause and retry if needed. |
   | `NOT_FOUND` / `IN_PROGRESS` / `UNKNOWN`       | Wait and re-check with the same hash; do not pay again yet.                  |
   | No receipt, no hash, `MV_PAYMENT_REJECTED`    | Treat as unknown; check history and status before any retry.                 |
   | `MV_PAYMENT_REQUIRED` / ceiling / funds error | No funds moved; fix the named cause, then retry.                             |

For Soroban registry mutations the shape is deliberately different: a
transaction submitted but not confirmed returns `status: "submitted"`,
`txPhase: "submitted"`, `confirmed: false`, a `reason`
(`confirmation_timeout` or `rpc_unavailable`), and a `statusLookup` pointing
at `mindvault_tx_status`. That path uses `onSubmitted` to keep the hash; a
purchase receipt does not. **Do not resubmit** a registry mutation that
returned this shape. See
[mcp-timeouts-retries.md](mcp-timeouts-retries.md#a-submitted-transaction-that-cannot-be-confirmed).

## Coverage

- [`mcp/src/receiptConsistencyDocs.test.ts`](../mcp/src/receiptConsistencyDocs.test.ts)
  — guards this page against drift in the receipt classifier, terminal
  statuses, settlement messages, and payment error actions
- [`mcp/src/purchaseHistory.test.ts`](../mcp/src/purchaseHistory.test.ts) —
  receipt classification and idempotency-key lookup
- [`mcp/src/settlement.test.ts`](../mcp/src/settlement.test.ts) — wait policy,
  bounded polling, and the always-present `txHash`/`status` fields
- [`mcp/src/errorCodes.test.ts`](../mcp/src/errorCodes.test.ts) and
  [`mcp/src/paymentRetry.test.ts`](../mcp/src/paymentRetry.test.ts) — error
  catalog, retry safety, and payment-stage mapping
