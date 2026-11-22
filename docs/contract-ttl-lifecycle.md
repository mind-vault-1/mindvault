# Contract storage and TTL lifecycle (operator guide)

This guide is for people who run a `vault-registry` deployment. It explains
which ledger entries the contract keeps alive by itself, which ones it does
not, and how to check, extend and restore entries with the Stellar CLI.

Contract developers want the policy constants and the reasons behind them.
Those are in
[`contract/contracts/vault-registry/README.md` → Storage TTL threshold constants](../contract/contracts/vault-registry/README.md#storage-ttl-threshold-constants).
For entry sizes and rent budgets, see
[`contract-storage-footprint.md`](contract-storage-footprint.md).

## The lifecycle in one paragraph

Every Soroban ledger entry has a **live-until ledger**. While the current
ledger is at or below it, the entry is live and can be read. Once the current
ledger passes it, a persistent entry is **archived**. It still exists, but any
transaction that touches it fails until someone pays to **restore** it.
`vault-registry` never uses temporary storage, so nothing it writes is ever
deleted outright by expiry. Entries are only archived, and can always be
restored. See Stellar's
[State Archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
documentation for the protocol-level rules.

## Policy values

All values are in ledgers. They are defined in
[`src/lib.rs`](../contract/contracts/vault-registry/src/lib.rs) and assume
about 5 seconds per ledger.

| Constant             | Ledgers | About   | Effect                                                             |
| -------------------- | ------: | ------- | ------------------------------------------------------------------ |
| `BUMP_AMOUNT`        | 518,400 | 30 days | A refresh sets the entry's remaining TTL to this.                  |
| `LIFETIME_THRESHOLD` | 501,120 | 29 days | A refresh does nothing while the remaining TTL is above this.      |
| `DAY_IN_LEDGERS`     |  17,280 | 1 day   | The gap between the two, so at most one refresh per entry per day. |

In code, every refresh is `extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT)`,
through the `bump_persistent` and `bump_instance` helpers.

## Storage classes

| Class      | What lives there                                                                                                                           | Archives…                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Instance   | `Count`, `CreatorCount`, `TagCount`, `TopTags`, `Admin`, role grants, `FeeConfig`, pause flags. See the footprint table for the full list. | All together, as one entry. The whole contract stops working. |
| Persistent | One entry per key: `Resource(id)`, `Index(n)`, `TagIndex(tag)`, `CreatorResources(creator)`, receipts, leases, and so on.                  | One key at a time.                                            |
| Temporary  | Not used.                                                                                                                                  | —                                                             |

Instance storage is refreshed by most admin and registration calls through
`bump_instance`. An instance refresh also extends the contract's code (WASM)
entry, per the
[`soroban-sdk` instance storage docs](https://docs.rs/soroban-sdk/22.0.0/soroban_sdk/storage/struct.Instance.html#method.extend_ttl).

## What refreshes what

A read or write refreshes only the entries listed here. Everything in this
table is pinned by tests in
[`src/test/ttl_operator_lifecycle.rs`](../contract/contracts/vault-registry/src/test/ttl_operator_lifecycle.rs),
so if the contract changes, the tests fail until this table is updated.

| Call                               | Refreshes                                                                     | Does **not** refresh                       |
| ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| `register` and other writes        | Every entry it writes: `Resource`, `Index(n)`, `TagIndex`, `CreatorResources` | —                                          |
| `get`, `get_owner`                 | Nothing                                                                       | `Resource`                                 |
| `get_many`, `get_owner_many`       | `Resource` for each id found                                                  | —                                          |
| `list_page`, `list`                | `Index(n)` and `Resource` for each visited slot                               | —                                          |
| `list_by_tag`                      | `Resource` for each returned id                                               | `TagIndex(tag)`                            |
| `list_by_creator`                  | `Resource` for each returned id                                               | `CreatorResources(creator)`                |
| `extend_resource_ttl(creator, id)` | `Resource(id)` only, and emits a `ttlext` event                               | `Index(n)`, `TagIndex`, `CreatorResources` |
| `get_payment_receipt`              | `PaymentIndex` and the `PaymentReceipt` it points to                          | —                                          |

What this means for operators:

- **A popular resource stays alive. Its indexes might not.** `list_by_tag`
  keeps the resources it returns alive, but not the `TagIndex` entry it read
  them from. A tag that nobody has registered or re-tagged against in 30 days
  archives. After that, `list_by_tag` for that tag fails until the entry is
  restored. `CreatorResources` works the same way for creators who haven't
  written anything recently.
- **`extend_resource_ttl` is not a full keep-alive.** It is creator-callable
  and refreshes only the `Resource` entry.
- **Single `get` calls are free reads.** Monitoring that polls `get` does not
  keep anything alive. Use `get_many` if you want the side effect.

## Inspect an entry's TTL

Contract keys are `DataKey` enum values. A unit variant encodes as
`{"vec":[{"symbol":"<Variant>"}]}`, and a variant with fields encodes as
`{"vec":[{"symbol":"<Variant>"}, <field>, …]}`. Encode the key to XDR, then
fetch the entry. The example uses the testnet contract from
[`vault-registry/README.md`](../contract/contracts/vault-registry/README.md).

```bash
CONTRACT=CDQKUIADLO5S5WEHEUTTXX2M45WAHVRU2PBEBD6ZGDKMOP5A72FJ3OD4
NET=(--rpc-url https://soroban-testnet.stellar.org \
     --network-passphrase "Test SDF Network ; September 2015")

# Persistent entry: DataKey::Resource("<id>")
KEY=$(echo '{"vec":[{"symbol":"Resource"},{"string":"<resource-id>"}]}' \
  | stellar xdr encode --type ScVal)
stellar ledger entry fetch contract-data --contract "$CONTRACT" \
  --key-xdr "$KEY" "${NET[@]}" --output json \
  | jq '{latest: .latestLedger,
         live_until: .entries[0].liveUntilLedgerSeq,
         remaining: (.entries[0].liveUntilLedgerSeq - .latestLedger)}'

# Instance storage, which every call depends on
stellar ledger entry fetch contract-data --contract "$CONTRACT" \
  --instance "${NET[@]}" --output json \
  | jq '{remaining: (.entries[0].liveUntilLedgerSeq - .latestLedger)}'
```

Running the instance query against testnet on 2026-11-21 returned:

```json
{ "latest": 5844026, "live_until": 5961915, "remaining": 117889 }
```

That is 117,889 ledgers, or about 6.8 days, at 17,280 ledgers per day.

Other keys follow the same pattern:

| Entry                  | Key JSON                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `Index(0)`             | `{"vec":[{"symbol":"Index"},{"u32":0}]}`                   |
| `TagIndex("dataset")`  | `{"vec":[{"symbol":"TagIndex"},{"string":"dataset"}]}`     |
| `CreatorResources(G…)` | `{"vec":[{"symbol":"CreatorResources"},{"address":"G…"}]}` |

Tags are stored lowercased, so encode the normalized form.

## Extend entries ahead of expiry

Anyone can pay to extend any entry. No contract auth is involved, so the
operator's own funded account works. `--ledgers-to-extend` is the number of
ledgers past the current ledger. Use `518400` to match the contract's own
refresh.

```bash
# Instance and code: run this first, it is the one that takes the whole contract down
stellar contract extend --id "$CONTRACT" --ledgers-to-extend 518400 \
  --source-account <operator> "${NET[@]}"

# A single persistent entry
stellar contract extend --id "$CONTRACT" --key-xdr "$KEY" \
  --durability persistent --ledgers-to-extend 518400 \
  --source-account <operator> "${NET[@]}"
```

A creator who wants to keep only their own `Resource` entry alive, through the
contract, can call `extend_resource_ttl`.

The CLI reference for these commands is
[`stellar contract extend`](https://developers.stellar.org/docs/tools/cli/stellar-cli#stellar-contract-extend).
Verified with `stellar` 25.1.0.

## Restore an archived entry

If a call fails because an entry in its footprint is archived, restore it,
then retry:

```bash
stellar contract restore --id "$CONTRACT" --key-xdr "$KEY" \
  --durability persistent --source-account <operator> "${NET[@]}"

# Archived instance (every call fails): omit --key-xdr
stellar contract restore --id "$CONTRACT" --source-account <operator> "${NET[@]}"
```

A restored entry comes back with the network's minimum persistent TTL, not
30 days. Extend it straight away, as above. Recent protocol versions can also
restore archived entries automatically as part of an invocation. The explicit
`restore` above works either way. See
[State Archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
and [`stellar contract restore`](https://developers.stellar.org/docs/tools/cli/stellar-cli#stellar-contract-restore).

## Suggested routine

1. **Weekly:** check the instance entry's `remaining` TTL. Extend it if it is
   under about 14 days (241,920 ledgers).
2. **Monthly**, or before a release: walk `Index(0..Count)`, every tag
   reported by `top_tags`, and active creators. Extend any entry under 7 days.
3. **On a failed call:** restore the archived key, extend it, then retry.
4. **Before an upgrade:** extend the instance entry first, so a slow rollout
   cannot let it lapse. See
   [`contract-upgrade-checklist.md`](contract-upgrade-checklist.md).

## Compatibility and operational notes

- This guide documents current behaviour. It does not change the contract or
  its storage layout, so existing deployments are unaffected.
- Rent is paid by whoever submits the transaction that extends or restores an
  entry. Budget operator XLM for both. Per-entry sizes are in
  [`contract-storage-footprint.md`](contract-storage-footprint.md).
- `--ledgers-to-extend` is capped by the network's `max_entry_ttl`. A higher
  value is rejected.
