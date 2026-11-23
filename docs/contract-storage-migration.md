# Contract storage migration guide

This guide is for contributors who need to change the persistent state of
`vault-registry` without stranded records or silent breakage for clients. It
covers the read path, defaults, TTL renewal, tests, and the binding updates that
follow a storage change.

For the release steps around a WASM upgrade, see the
[contract upgrade checklist](./contract-upgrade-checklist.md). For the byte
budgets that catch accidental growth, see the
[contract storage footprint guide](./contract-storage-footprint.md).

## 1. Start from the current schema contract

`RESOURCE_SCHEMA_VERSION` and `PREVIOUS_RESOURCE_SCHEMA_VERSION` in
[`lib.rs`](../contract/contracts/vault-registry/src/lib.rs) declare which
versions the deployment can read. `Resource` carries its own `schema_version`,
so an old record stays readable after the contract is upgraded.

`migrate_resource(env, id)` is the guarded upgrade entry point: it requires the
resource creator's auth, loads the record, calls
`ensure_supported_resource_schema`, and saves it. `save` is the migration
boundary — it stamps the current schema version, bumps `version`, updates
`updated_at`, and renews the entry's TTL. A record on an unsupported version is
rejected rather than rewritten with guessed fields.

**Never key a new field on position.** Soroban encodes a `#[contracttype]` enum
as a vec whose first element is a `Symbol` of the _variant name_. Renaming a
`DataKey` variant or changing its arity changes the on-chain key, so old entries
become invisible. The wire-contract tests in
[`test.rs`](../contract/contracts/vault-registry/src/test.rs) pin those names
and arities; keep them green when adding a variant.

## 2. Give existing records explicit defaults

A new field must have a defined value for records written by the previous
version. Prefer a nullable field plus a named default at the read site over a
required field with no fallback:

```rust
// Legacy attestation hashes had no algorithm tag; treat them as sha256.
pub const DEFAULT_ATTESTATION_HASH_ALGORITHM: &str = "sha256";
```

The same pattern appears throughout the registry: `anchor_attempts_state`
starts from a zeroed `AnchorAttempts`, counters such as `CreatorCount` use
`unwrap_or(0)`, and an absent fee config means no platform fee. Apply it to
your field and document the default in
[`contract/README.md`](../contract/README.md) when it is observable through the
API.

For identity fields, a default is not always safe. `PaymentRecipient` was
already declared as the receipt-to-creator binding but was never written, which
let a refund fall back to the _current_ owner after an ownership transfer.
[`settle_payment`](../contract/contracts/vault-registry/src/lib.rs) and the
refund path now write and check that binding at record time; a legacy receipt
with no binding keeps the old fallback, but any receipt written by this version
is rejected when the resource is bound to a different creator. The regression
tests live in
[`test/payment_ownership_binding.rs`](../contract/contracts/vault-registry/src/test/payment_ownership_binding.rs).

## 3. Renew TTL as part of the migration

Soroban persistent entries expire without rent. The registry uses
`DAY_IN_LEDGERS` (17,280), `BUMP_AMOUNT` (30 days), and
`LIFETIME_THRESHOLD` (`BUMP_AMOUNT - DAY_IN_LEDGERS`); `bump_persistent` and
`bump_instance` call `extend_ttl` with that threshold and amount.

A migration that rewrites an entry must renew it in the same write, otherwise a
record can be upgraded and then immediately archivally expired. Do this through
`save`/`bump_persistent` rather than a bare `set`. The constants and the
one-day-of-slack rule are documented in the
[vault-registry README](../contract/contracts/vault-registry/README.md) and
enforced by `readme_documents_ttl_threshold_constants` and
`ttl_threshold_leaves_exactly_one_day_of_slack`.

## 4. Cover the migration with tests

Add cases to the crate's test suite, not just an ad hoc script:

- **Old and new records coexist.** `test/registry_export.rs` checks that the
  export view reports entries still on an older schema. `export_page` reads
  without the schema guard so operators can find them before migrating.
- **Version guards and events.** `test/schema_registry.rs` and
  `test/hardening_preflight.rs` cover version transitions and the `migrate`
  event.
- **Wire compatibility.** The `storage_key_*` tests in `test.rs` catch renamed
  or reshaped keys.
- **Storage growth.** `test/storage_footprint.rs` asserts a byte budget for each
  entry class. If a field legitimately widens `Resource` or `PaymentReceipt`,
  run the report, raise the budget in the test, and update
  [the footprint doc](./contract-storage-footprint.md).

Run the contract suite and the footprint report from the workspace root:

```bash
pnpm contract:test
cd contract/contracts/vault-registry && make footprint
```

`make preflight` in the same crate directory runs the full local gate: tests,
optimized build, and the WASM size budget (159,744 bytes).

## 5. Update bindings and downstream consumers

If the change alters the ABI — a new field in a returned struct, a new method,
or a changed argument — regenerate the TypeScript bindings from the built WASM:

```bash
CONTRACT_WASM=contract/target/wasm32v1-none/release/vault_registry.wasm \
  pnpm contract:bindings
pnpm --filter @mindvault/registry-client test
```

Commit the regenerated `packages/registry-client/src/generated/index.ts` along
with the Rust change. See
[registry-client-bindings.md](./registry-client-bindings.md) for the full
workflow and the deployed-contract check; Phase 5 of the
[upgrade checklist](./contract-upgrade-checklist.md) lists the environment
files that also carry the contract id.

A storage-only change with no ABI difference does not require new bindings, but
still needs the footprint and preflight checks above.

## 6. Compatibility and operational implications

- Old records remain readable until `migrate_resource` is called for them; do
  not assume a deploy migrates state automatically.
- A new default changes what callers see for legacy records. Call it out in the
  PR description when the default is visible through `get` or `export_page`.
- Rewriting storage keys is a breaking change, not a migration. Add variants
  instead of renaming them.
- After deploying, verify the contract id and binding hash before pointing
  `server/`, `web/`, or `mcp/` at the new WASM.

## Related

- [Contract upgrade checklist](./contract-upgrade-checklist.md)
- [Contract storage footprint](./contract-storage-footprint.md)
- [Registry client bindings](./registry-client-bindings.md)
- [`contract/README.md`](../contract/README.md)
