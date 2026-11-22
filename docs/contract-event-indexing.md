# Consuming vault-registry events

A guide for indexer authors: which events the `vault-registry` contract emits,
what each payload means, what ordering you can rely on, and how to checkpoint
and recover from gaps. The event catalog below is checked against the
contract's `EVENT_SCHEMA` by the test `event_indexing_guide_covers_every_event`
(`contract/contracts/vault-registry/src/test/event_indexing_guide.rs`), so a
new, renamed or removed event fails a test until this page is updated.

Source of truth: [`contract/contracts/vault-registry/src/lib.rs`](../contract/contracts/vault-registry/src/lib.rs).
The README's [Events table](../contract/README.md#events) lists the same topics
in less detail.

## Where events come from

Every event is a Soroban contract event in the transaction meta of a
successful invocation. A failed or reverted call emits nothing, so every
event describes a state change that is committed on-chain. Read events with
Stellar RPC `getEvents`, filtered by the registry's contract id:

```json
{
  "filters": [{ "type": "contract", "contractIds": ["C..."] }],
  "startLedger": 123456,
  "pagination": { "limit": 100 }
}
```

To receive only some events, add a `topics` filter whose first segment is the
event's symbol (for example `register`) and `*` for the remaining segments.

## Encoding

- **`topic[0]`** is always a `Symbol` holding the event name in the catalog
  below. Most names are short symbols (up to 9 characters). `pause_until`,
  `payment_pause`, `payment_pause_until` and `txfrterms` are longer symbols,
  but they decode the same way.
- **`topic[1..]`** carries the subject of the event when there is one (the
  resource id, receipt id, role holder…). The `Extra topics` column lists them.
- **`value`** is the payload, encoded as an `ScVal`. With
  `scValToNative` from `@stellar/stellar-sdk`:
  - a struct (`PriceUpdated { .. }`) becomes an object keyed by field name;
  - a tuple (`(old, new)`) becomes an array;
  - `Option<T>` is `null` for `None`, otherwise the value;
  - `i128` and `u64` become `bigint`, `u32` becomes `number`;
  - `Address` becomes a `G…`/`C…` string, `BytesN<32>` a `Buffer`;
  - an enum with numeric discriminants (`FlagReason`, `LeaseTier`,
    `AnchorFailureReason`, `MaintenanceKind`) is a `u32`; an enum without
    them (`VerificationStatus`, `PaymentState`, `LeaseState`) is a one-element
    array holding the variant name, for example `["Verified"]`.
- **Amounts** (`price`, `amount`, …) are `i128` USDC base units: 7 decimals,
  so `10000000` is 1 USDC.

## Event catalog

`Data` is the payload. `Emitted by` names the contract method; a method that
emits more than one event is listed under [Ordering](#ordering).

### Resources

| Topic       | Extra topics     | Data                                                                                                 | Emitted by                                                                                    |
| ----------- | ---------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `register`  | resource id      | `Resource` (the full stored record)                                                                  | `register`, `register_with_hash`, `register_with_memo`, `register_batch`                      |
| `regmemo`   | resource id      | `memo_hash: BytesN<32>`                                                                              | `register_with_memo`, right after its `register`                                              |
| `setprice`  | —                | `PriceUpdated { id, old_price, new_price, updater, revision }`                                       | `set_price`, `set_price_many` (one event per resource)                                        |
| `updmeta`   | resource id      | `MetadataUpdateEvent { id, old_metadata, new_metadata, revision }`                                   | `update_metadata`, `update_metadata_many`, `set_metadata_pointers` (when the primary changes) |
| `setptrs`   | resource id      | `MetadataPointers { pointers, primary }`                                                             | `set_metadata_pointers`                                                                       |
| `settags`   | resource id      | `(prev_tags: Vec<String>, next_tags: Vec<String>)`                                                   | `set_tags`                                                                                    |
| `setroyal`  | resource id      | `(old_recipient: Option<Address>, new_recipient: Option<Address>)`                                   | `set_royalty_recipient`                                                                       |
| `setlisted` | resource id      | `(old_listed: bool, new_listed: bool)`                                                               | `set_listed`                                                                                  |
| `freeze`    | resource id      | `()`                                                                                                 | `freeze_metadata`                                                                             |
| `reactive`  | resource id      | `()`                                                                                                 | `reactivate_resource`                                                                         |
| `ttlext`    | resource id      | `()`                                                                                                 | `extend_resource_ttl`                                                                         |
| `verify`    | resource id      | `(old_status: VerificationStatus, new_status: VerificationStatus, attestation_hash: Option<String>)` | `set_verification_status`                                                                     |
| `emdelist`  | resource id      | `EmergencyDelistEvent { id, admin, reason }`                                                         | `emergency_delist`                                                                            |
| `reindex`   | `old_count: u32` | `new_count: u32`                                                                                     | `repair_index`                                                                                |
| `retagidx`  | —                | `new_count: u32`, the number of unique ids reindexed                                                 | `repair_tag_index` (not emitted for an empty list)                                            |

### Ownership and terms

| Topic       | Extra topics | Data                                                                                      | Emitted by                                                               |
| ----------- | ------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `transfer`  | resource id  | `(previous_owner: Address, new_owner: Address)`                                           | `transfer_ownership`, `accept_transfer`, `transfer_ownership_with_terms` |
| `propose`   | resource id  | `(owner: Address, proposed: Address)`                                                     | `propose_transfer`                                                       |
| `cancel`    | resource id  | `owner: Address`                                                                          | `cancel_transfer`                                                        |
| `txfrterms` | resource id  | `TransferWithTermsEvent { id, previous_owner, new_owner, terms_hash, attestation_reset }` | `transfer_ownership_with_terms`                                          |
| `setterms`  | creator      | `terms_hash: String`                                                                      | `set_terms_hash`, `transfer_ownership_with_terms`                        |
| `setregt`   | —            | `terms_hash: String`                                                                      | `set_registry_terms_hash`                                                |

### Moderation

| Topic     | Extra topics | Data                                        | Emitted by             |
| --------- | ------------ | ------------------------------------------- | ---------------------- |
| `flag`    | resource id  | `FlagEvent { id, moderator, reason }`       | `flag_resource`        |
| `unflag`  | resource id  | resource id (`String`)                      | `unflag_resource`      |
| `flagrsn` | resource id  | `(moderator: Address, reason_hash: String)` | `set_flag_reason_hash` |

### Payments, refunds and receipts

| Topic       | Extra topics       | Data                                                                                                                                                     | Emitted by                                                                                                                        |
| ----------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `payment`   | receipt id         | `PaymentReceipt { receipt_id, resource_id, payer, amount, state, tx_hash, recorded_at, ledger }`                                                         | `record_payment`, `record_payment_idempotent` (first call only)                                                                   |
| `nomemo`    | —                  | `(receipt_id: String, tx_hash: String)`, a provenance warning                                                                                            | `record_payment`, after its `payment`                                                                                             |
| `settle`    | receipt id         | `PaymentReceipt { .. }` with `state` `Settled`                                                                                                           | `settle_payment`                                                                                                                  |
| `refund`    | refund id          | `RefundReceipt { refund_id, payment_receipt_id, resource_id, recipient, amount, tx_hash, initiated_by, recorded_at, admin_override, remaining_balance }` | `record_creator_refund`, `record_admin_refund`                                                                                    |
| `refwin`    | admin              | `(old_window: u32, new_window: u32)` in ledgers                                                                                                          | `set_refund_window`                                                                                                               |
| `simvalid`  | —                  | `(passed: bool, error_code: Option<u32>)`                                                                                                                | `simulate_record_payment` (only if someone submits it)                                                                            |
| `anchor`    | resource id        | `PurchaseReceiptAnchor { resource_id, buyer, receipt_hash, ledger }`                                                                                     | `anchor_purchase_receipt`, `attempt_anchor_purchase_receipt`, `retry_anchor_purchase_receipt`, `override_purchase_receipt_anchor` |
| `anchrfail` | resource id        | `AnchorFailure { resource_id, buyer, receipt_hash, reason, ledger }`                                                                                     | `attempt_anchor_purchase_receipt`, `retry_anchor_purchase_receipt`                                                                |
| `anchrxhst` | resource id, buyer | `AnchorAttempts { attempts, last_attempt_ledger }`, the final count                                                                                      | `attempt_anchor_purchase_receipt`, when attempts are exhausted                                                                    |
| `lease`     | resource id        | `Lease { resource_id, holder, tier, start_ledger, expiry_ledger, amount, tx_hash, state, recorded_at }`                                                  | `buy_lease`, `record_lease`                                                                                                       |
| `leasesetl` | resource id        | `Lease` with `state` `Active`                                                                                                                            | `settle_lease`                                                                                                                    |
| `leaserevk` | resource id        | `Lease` with `state` `Revoked`                                                                                                                           | `revoke_lease`                                                                                                                    |

### Fees

| Topic      | Extra topics | Data                                                                 | Emitted by                            |
| ---------- | ------------ | -------------------------------------------------------------------- | ------------------------------------- |
| `setfee`   | —            | `FeeConfigUpdated { old_config, new_config }`                        | `set_fee_config`, `set_fee_recipient` |
| `setdest`  | —            | `FeeDestinationUpdated { old_destination, new_destination, ledger }` | `set_fee_destination`                 |
| `claimfee` | —            | `FeesClaimed { claimed_amount, remaining_amount }`                   | `claim_fees`                          |

### Roles and governance

| Topic       | Extra topics | Data                                                             | Emitted by                                                         |
| ----------- | ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `addverif`  | verifier     | `RoleChange { admin, target, granted: true }`                    | `add_verifier`, `rotate_verifier`                                  |
| `rmverif`   | verifier     | `RoleChange { admin, target, granted: false }`                   | `remove_verifier`, `rotate_verifier`                               |
| `verrot`    | old verifier | `VerifierRotation { admin, old_verifier, new_verifier, ledger }` | `rotate_verifier`                                                  |
| `addmod`    | moderator    | `RoleChange { admin, target, granted: true }`                    | `add_moderator`                                                    |
| `rmmod`     | moderator    | `RoleChange { admin, target, granted: false }`                   | `remove_moderator`                                                 |
| `addsettlr` | settler      | `RoleChange { admin, target, granted: true }`                    | `add_settler`                                                      |
| `rmsettlr`  | settler      | `RoleChange { admin, target, granted: false }`                   | `remove_settler`                                                   |
| `setadmin`  | —            | `admin: Address`                                                 | the first `nominate_new_admin` (bootstrap), `bootstrap_dual_admin` |
| `nomadmin`  | —            | `new_admin: Address`, the nominee                                | `nominate_new_admin` once an admin exists                          |
| `nomcncl`   | —            | `(nominee: Address, admin: Address)`                             | `cancel_admin_nomination`                                          |
| `accadmin`  | —            | `new_admin: Address`                                             | `accept_admin`                                                     |
| `setrecov`  | —            | `recovery_admin: Option<Address>`                                | `set_recovery_admin`, `bootstrap_dual_admin`                       |
| `recover`   | —            | `(old_admin: Address, new_admin: Address)`                       | `recover_admin`                                                    |
| `netinit`   | —            | `network_id: BytesN<32>`                                         | `initialize_network` (once per deployment)                         |

### Pause and maintenance

| Topic                 | Extra topics | Data                                                  | Emitted by                                       |
| --------------------- | ------------ | ----------------------------------------------------- | ------------------------------------------------ |
| `pause`               | admin        | `(paused: bool, admin: Address)`                      | `set_paused`, `set_paused_until`                 |
| `pause_until`         | admin        | `(pause_until: u64, admin: Address)`                  | `set_paused_until`                               |
| `payment_pause`       | admin        | `(paused: bool, admin: Address)`                      | `set_payment_paused`, `set_payment_paused_until` |
| `payment_pause_until` | admin        | `(pause_until: u64, admin: Address)`                  | `set_payment_paused_until`                       |
| `mntstat`             | —            | `MaintenanceStatusEvent { kind, reason_code, admin }` | `set_maintenance_status`                         |

Unknown topics will appear as the contract grows. Skip and log them rather
than failing: an indexer that stops on an unknown topic stops following the
registry.

## Payload semantics

- **Events report the committed state after the call.** `new_*` fields and
  full records (`Resource`, `PaymentReceipt`, `Lease`) are what storage holds
  once the transaction is applied. Apply them as upserts.
- **`old_*` fields** are the value before the call. Compare them to what you
  stored: a mismatch means you missed an event for that key (see
  [Detecting gaps](#detecting-gaps)).
- **No-op calls still emit** for some methods: `set_paused` emits on every
  call, including one that does not change the flag, and `set_listed` emits
  with `old_listed == new_listed`. Treat events as idempotent.
- **`revision`** on `setprice` and `updmeta` is the resource's listing
  revision (`get_revision`). It goes up by exactly one per successful price or
  metadata change, and both events share the same counter.
- **Ledger fields** (`ledger`, `recorded_at`) are ledger sequence numbers, not
  timestamps. Use the RPC event's `ledgerClosedAt` for wall-clock time.
- **Role events** carry the admin that made the change. For an audit of
  verifier keys, `verifier_key_history` returns the same changes as a
  paginated read (see the contract README's
  [Verifier key history](../contract/README.md#verifier-key-history)).

## Ordering

- **Within a transaction**, events appear in the order the contract emitted
  them. Calls that emit several events always emit them in this order:

  | Call                                                       | Events, in order                                                      |
  | ---------------------------------------------------------- | --------------------------------------------------------------------- |
  | `rotate_verifier`                                          | `rmverif`, `addverif`, `verrot`                                       |
  | `register_with_memo`                                       | `register`, `regmemo`                                                 |
  | `record_payment` (no memo)                                 | `payment`, `nomemo`                                                   |
  | `set_paused_until`                                         | `pause`, `pause_until`                                                |
  | `set_payment_paused_until`                                 | `payment_pause`, `payment_pause_until`                                |
  | `set_metadata_pointers`                                    | `updmeta` (if the primary changed), `setptrs`                         |
  | `bootstrap_dual_admin`                                     | `setadmin`, `setrecov`                                                |
  | `transfer_ownership_with_terms`                            | `setterms` (if a terms hash is given), `transfer`, `txfrterms`        |
  | `attempt_anchor_purchase_receipt`                          | `anchor` or `anchrfail`, then `anchrxhst` once attempts are exhausted |
  | `set_price_many`, `update_metadata_many`, `register_batch` | one event per item, in input order                                    |

- **Across transactions**, RPC returns events in chain order: by ledger, then
  by the transaction's position in the ledger, then by operation. Each event's
  `id` is unique and sorts in that order, so it is the right checkpoint.
- **Nothing is ordered by wall-clock time.** Two events in one ledger share a
  `ledgerClosedAt`. Order by `id`, never by timestamp.

## Checkpointing

- **Checkpoint the RPC cursor or the last processed event `id`**, not a ledger
  number. Resuming from `ledger + 1` drops the rest of a ledger whose events
  did not fit in one page; resuming from `ledger` replays it.
- **Write the checkpoint in the same database transaction** as the rows the
  page produced. Then a crash either keeps both or neither, and a replay
  re-applies at most one page.
- **Make handlers idempotent**: key derived rows by event `id`, or upsert by
  the subject (resource id, receipt id) and keep the higher `revision`.

## Detecting gaps

A gap is a range of events your indexer never processed. Watch for these:

1. **Retention.** RPC keeps only a recent window of events (about 7 days by
   default, set by the provider). Every `getEvents` response reports
   `oldestLedger`; a checkpoint older than that cannot be resumed from that
   RPC.
2. **Revision jumps.** A `setprice` or `updmeta` whose `revision` is more than
   one above the stored revision for that resource.
3. **`old_*` mismatches.** A `setprice.old_price`, `setlisted.old_listed`,
   `settags.prev_tags`, `transfer.previous_owner` or `verify.old_status` that
   differs from what you stored.
4. **Unknown subjects.** An event for a resource or receipt you never saw a
   `register` or `payment` for.

## Recovering from a gap

Events are a change feed; contract storage is the source of truth. Recover by
reading current state, then resume the feed from the present:

1. Record the RPC's latest ledger, `L`.
2. Re-read the affected state:
   - one resource: `get(id)` and `get_revision(id)`;
   - the catalog: page through `export_page(cursor, limit)` (or `list_page`)
     until `next_cursor` is `None`, and compare with `state_digest` if you
     keep digests;
   - roles: `role_inventory_page` for each role, and `verifier_key_history`
     for the verifier key audit trail;
   - payments and refunds: `get_payment(receipt_id)`, `get_refund(refund_id)`
     and `get_remaining_refundable(receipt_id)` for the receipts you track.
3. Replace the stored rows with what you read, keeping their revisions.
4. Resume `getEvents` with `startLedger: L`. Events between your old
   checkpoint and `L` are already reflected in the state you read; replaying
   the few after `L` is harmless because handlers are idempotent.

## Sample consumer

A minimal poller with `@stellar/stellar-sdk`. `db` stands for your storage;
`applyEvent` is your handler, keyed by topic.

```ts
import { rpc, scValToNative } from "@stellar/stellar-sdk";

const server = new rpc.Server(process.env.SOROBAN_RPC_URL!);
const CONTRACT_ID = process.env.REGISTRY_CONTRACT_ID!;

async function pollOnce(): Promise<void> {
  const checkpoint = await db.loadCheckpoint(); // { cursor?: string; ledger: number }
  const filters = [{ type: "contract" as const, contractIds: [CONTRACT_ID] }];
  const page = checkpoint.cursor
    ? await server.getEvents({ filters, cursor: checkpoint.cursor, limit: 100 })
    : await server.getEvents({ filters, startLedger: checkpoint.ledger, limit: 100 });

  if (checkpoint.ledger < page.oldestLedger) {
    // The RPC no longer has every event since the checkpoint.
    await resyncFromContractState(); // see "Recovering from a gap"
    return;
  }

  await db.transaction(async (tx) => {
    for (const event of page.events) {
      if (await tx.hasProcessed(event.id)) continue; // idempotent replay
      const [name, ...subjects] = event.topic.map((t) => scValToNative(t));
      const data = scValToNative(event.value);
      switch (name) {
        case "setprice": {
          const stored = await tx.resourceRevision(data.id);
          if (stored !== null && data.revision > stored + 1) {
            await tx.markForResync(data.id); // revision jump: missed events
          }
          await tx.upsertPrice(data.id, data.new_price, data.revision);
          break;
        }
        case "register":
          await tx.upsertResource(data); // full Resource record
          break;
        default:
          await applyEvent(tx, name, subjects, data); // log and skip unknown topics
      }
      await tx.markProcessed(event.id);
    }
    // Same transaction as the rows above.
    const last = page.events.at(-1);
    await tx.saveCheckpoint({ cursor: page.cursor, ledger: last?.ledger ?? checkpoint.ledger });
  });
}
```

An RPC can also reject a cursor that has fallen out of its retention window.
Treat that error the same way: recover from contract state, then restart with
`startLedger` set to the latest ledger you recorded before the re-read.
