# Contract test and fixture map

This map shows where `vault-registry` tests live, which shared helpers and
fixtures they use, and where a new test should go. Every path is relative to
[`contract/contracts/vault-registry/`](../contract/contracts/vault-registry/).

`pnpm docs:contract-tests` keeps this map honest (see
[Keeping this map current](#keeping-this-map-current)).

## How the suite is assembled

There is a single test module. [`src/lib.rs`](../contract/contracts/vault-registry/src/lib.rs)
ends with `mod test;`, which loads
[`src/test.rs`](../contract/contracts/vault-registry/src/test.rs). The files
under `src/test/` are **not** Rust submodules. `test.rs` pastes them in at the
bottom with `include!("test/<file>.rs");`.

As a result:

- Every included file shares one namespace with `test.rs`. Helpers like
  `setup()` and `tags()` are available without a `use`. It also means test and
  helper names must be unique across **all** included files. A name clash
  fails to compile with "defined multiple times". Prefix helpers in a new file
  (for example, `op_` in `ttl_operator_lifecycle.rs`).
- **A file under `src/test/` with no `include!` line is never compiled.** Its
  tests never run, and a broken one won't fail CI. The `Compiled` column below
  records which files are included.

## Running tests

From `contract/` (the workspace root):

```bash
cargo test                                  # the whole suite, as CI runs it
cargo test lease_                           # every test whose name contains "lease_"
cargo test storage_footprint_report -- --nocapture   # prints the footprint table
```

From `contract/contracts/vault-registry/`:

```bash
make test        # build the WASM, then cargo test
make footprint   # same as the storage_footprint_report line above
make preflight   # tests + optimized build + WASM size budget + no_std build
```

CI runs `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D
warnings` and `cargo test` (see [`.github/workflows/pr.yml`](../.github/workflows/pr.yml)
and [`.github/workflows/contract-ci.yml`](../.github/workflows/contract-ci.yml)).
Run `cargo fmt --all` and the clippy command locally before you push.

## Shared helpers and fixtures

All of these live in `src/test.rs` unless noted otherwise.

| Helper                                                                         | Use it for                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `setup()`                                                                      | `(Env, creator, client)` with `mock_all_auths()`. This is the default starting point. |
| `setup_strict_auth()`                                                          | Real auth checks. Returns owner, stranger and a registered resource id.               |
| `setup_with_admin()`, `setup_with_settler()`, `setup_with_moderator()`         | A contract with that role already granted.                                            |
| `setup_with_royalty()`, `setup_with_anchor_service()`                          | Royalty and purchase-anchor scenarios.                                                |
| `tags(&env, &["a", "b"])`, `empty_tags(&env)`                                  | Building `Vec<String>` tag arguments.                                                 |
| `register_tagged()`, `register_default()`, `register_priced()`, `register_n()` | Registering fixture resources in one line.                                            |
| `max_len_resource_id()`, `metadata_of_len()`                                   | Boundary-length ids and metadata pointers.                                            |
| `resource_storage_ttl()`, `payment_receipt_ttl()`                              | Reading an entry's live TTL. Compare against `TTL_BUMP_AMOUNT` and related constants. |
| `find_event()`, `topic0_symbol()`, `last_event_id_topic()`                     | Asserting on emitted events.                                                          |
| `assert_registry_invariants()`                                                 | Cross-checking counters and indexes after a sequence of operations.                   |
| `vault_registry_readme()`, `readme_section()`                                  | Doc-drift tests that read the crate `README.md`.                                      |
| `build_*_invoke()`, `setup_with_verifier()` (in `src/test/auth_fixtures.rs`)   | Hand-built `MockAuth` / `MockAuthInvoke` fixtures for exact-signer auth tests.        |

Test-only aliases for private constants (`TTL_DAY_IN_LEDGERS`,
`TTL_BUMP_AMOUNT`, `TTL_LIFETIME_THRESHOLD`) are declared `#[cfg(test)]` at the
bottom of `src/lib.rs`.

Generated and checked-in artifacts:

| Path                            | What it is                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `test_snapshots/`               | JSON ledger snapshots the Soroban SDK writes for each test. Ignored by [`contract/.gitignore`](../contract/.gitignore). Never commit them. |
| `proptest-regressions/test.txt` | Failing seeds recorded by `proptest!` blocks in `test.rs`. They are replayed before new cases. **Commit** new seeds alongside the fix.     |

## Test files

| File                                         | Compiled | Covers                                                                                                            |
| -------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/test.rs`                                | yes      | Core suite: registration, catalog reads, ownership, tags, payments, roles, events, proptests, README drift guards |
| `src/test/anchor_backoff.rs`                 | no       | Anchor attempt cap and retry back-off (#792)                                                                      |
| `src/test/auth_fixtures.rs`                  | yes      | Reusable `MockAuth` builders and accept/reject auth tests (#641)                                                  |
| `src/test/core_catalog.rs`                   | no       | Split-out copy of core catalog tests (most also in `test.rs`)                                                     |
| `src/test/creator_listed_count.rs`           | yes      | `creator_listed_count` (#681)                                                                                     |
| `src/test/creator_page_filtered.rs`          | yes      | `list_by_creator_page_filtered` (#972)                                                                            |
| `src/test/cursor_paging.rs`                  | no       | Stable cursors for the `list_*` family (#794)                                                                     |
| `src/test/flag_details.rs`                   | yes      | `flag_details` / `is_flagged` moderation read (#820)                                                              |
| `src/test/hardening_preflight.rs`            | no       | Boundary hardening (duplicates of `test.rs` tests)                                                                |
| `src/test/leases.rs`                         | no       | Time-limited access leases (#803)                                                                                 |
| `src/test/lifecycle_events.rs`               | yes      | Lifecycle transition event payloads                                                                               |
| `src/test/lifecycle_roles.rs`                | no       | Roles, verification, freeze and repair (most also in `test.rs`)                                                   |
| `src/test/listed_count_matrix.rs`            | yes      | Listed-count transition matrix (#973)                                                                             |
| `src/test/memo_hash.rs`                      | yes      | `register_with_memo` memo hash (#682)                                                                             |
| `src/test/metadata_updates.rs`               | no       | `update_metadata` events (duplicates of `test.rs` tests)                                                          |
| `src/test/moderation_pause.rs`               | no       | Dispute flagging and pause (most also in `test.rs`)                                                               |
| `src/test/partial_refunds.rs`                | no       | Partial refund accounting (#990)                                                                                  |
| `src/test/pause_scope_matrix.rs`             | yes      | What the global pause covers (#1018)                                                                              |
| `src/test/payment_idempotency.rs`            | yes      | Retry-safe `record_payment` (#823)                                                                                |
| `src/test/payment_listing.rs`                | no       | `record_payment` requires a listed resource (#791)                                                                |
| `src/test/payment_pause_scope.rs`            | yes      | Payment pause scope (#1016)                                                                                       |
| `src/test/payments.rs`                       | no       | Escrow payment state (most also in `test.rs`)                                                                     |
| `src/test/properties_events.rs`              | no       | Pagination/tag property tests and event topic lengths (most also in `test.rs`)                                    |
| `src/test/purchase_receipts.rs`              | no       | Purchase receipt buyer normalization (most also in `test.rs`)                                                     |
| `src/test/registry_export.rs`                | no       | Bounded `export_page` (#1073)                                                                                     |
| `src/test/schema_registry.rs`                | no       | `registry_info` discovery metadata (duplicates of `test.rs` tests)                                                |
| `src/test/simulation_mutation_validation.rs` | yes      | Simulation vs. submitted mutation parity (#1017)                                                                  |
| `src/test/stellar_wave_804_805_806_808.rs`   | yes      | Earnings estimate, verifier history, and related (#804–#808)                                                      |
| `src/test/stellar_wave_970_971_975_976.rs`   | yes      | Listing revision counter and related (#970–#976)                                                                  |
| `src/test/stellar_wave_977_978_979_980.rs`   | yes      | Tag-index repair idempotency, maintenance status (#977–#980)                                                      |
| `src/test/stellar_wave_981_982_983_984.rs`   | yes      | Admin recovery guards, role inventory (#981–#984)                                                                 |
| `src/test/storage_footprint.rs`              | yes      | Storage footprint report and budgets. See [`contract-storage-footprint.md`](contract-storage-footprint.md)        |
| `src/test/tag_prefix_search.rs`              | yes      | `search_by_tag_prefix` (#974)                                                                                     |
| `src/test/tags.rs`                           | no       | Tag removal events and `set_tags` validation (most also in `test.rs`)                                             |
| `src/test/tombstone_read.rs`                 | yes      | Read behaviour after tombstoning (#624)                                                                           |

### About the files that are not compiled

As of this map, 16 files under `src/test/` have no `include!`. They fall into
two groups:

- **Duplicates.** `hardening_preflight.rs`, `metadata_updates.rs` and
  `schema_registry.rs` only repeat tests that already run from `test.rs`.
  `core_catalog.rs`, `lifecycle_roles.rs`, `moderation_pause.rs`, `payments.rs`,
  `properties_events.rs`, `purchase_receipts.rs` and `tags.rs` are mostly
  duplicates, plus a few tests found nowhere else.
- **Unique and never run.** `anchor_backoff.rs`, `cursor_paging.rs`,
  `leases.rs`, `partial_refunds.rs`, `payment_listing.rs` and
  `registry_export.rs` hold 48 tests that exist only in those files. They
  currently give no CI protection.

Wiring these in is follow-up work. It is not in scope for this map, and an
uncompiled file may need fixes before it builds. When you include one, flip its
`Compiled` cell to `yes` in the same change. If you delete a duplicate, remove
its row.

## Adding a test

1. **Extending an existing feature?** Add the test to the compiled file that
   already covers it (see the table above).
2. **New feature or issue?** Create `src/test/<topic>.rs`. Start it with a
   header comment naming the issue, like the existing files do. Then:
   - Add `include!("test/<topic>.rs");` at the bottom of `src/test.rs`.
   - Add a row to the table above with `Compiled` set to `yes`.
   - Give file-local helpers a prefix so they cannot collide.
3. Reuse `setup()` and the other helpers rather than writing new `Env`
   boilerplate. Use `setup_strict_auth()` or `auth_fixtures.rs` when the test
   is about who may call something. `mock_all_auths()` hides auth bugs.
4. Changed a stored struct? Run `make footprint` and follow
   [`contract-storage-footprint.md`](contract-storage-footprint.md).
5. Run `cargo test <your_prefix>`, then `cargo test`, `cargo fmt --all` and
   clippy. Finally, run `pnpm docs:contract-tests` from the repo root.

Example: a minimal new file, `src/test/example_topic.rs`:

```rust
// ─── Example topic (#NNNN) ───────────────────────────────────────────────

#[test]
fn example_topic_register_then_count() {
    let (env, creator, client) = setup();
    register_tagged(&env, &creator, &client, "exampleid", &["demo"]);
    assert_eq!(client.count(), 1);
}
```

Then add `include!("test/example_topic.rs");` to `src/test.rs` and a
`| \`src/test/example_topic.rs\` | yes | … |` row here.

## Tests outside the contract crate

These depend on the contract interface. Run them when you change a public
method or type.

| Path                                                                                                                      | Run with                                        | Checks                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| [`packages/registry-client/src/`](../packages/registry-client/src/)                                                       | `pnpm --filter @mindvault/registry-client test` | Generated bindings (`pnpm contract:bindings`) and binding checks |
| [`tests/catalog-filter-parity.test.ts`](../tests/catalog-filter-parity.test.ts) + [`tests/fixtures/`](../tests/fixtures/) | `pnpm test:catalog-parity`                      | Server and MCP catalog filters agree                             |
| [`mcp/fixtures/registry.json`](../mcp/fixtures/registry.json)                                                             | `pnpm --filter @mindvault/mcp test`             | Offline registry fixture used by MCP tests                       |

## Keeping this map current

[`scripts/check-contract-test-map.mjs`](../scripts/check-contract-test-map.mjs)
(`pnpm docs:contract-tests`) fails when any of the following is true:

- a `.rs` file under `src/test/` has no row in the **Test files** table
- a row names a file that no longer exists
- a row's `Compiled` cell disagrees with whether `src/test.rs` actually
  `include!`s the file

The [Docs links workflow](../.github/workflows/docs-links.yml) runs it on
pull requests that touch Markdown or `contract/contracts/vault-registry/src/test*`.

Related: [`contract-upgrade-checklist.md`](contract-upgrade-checklist.md),
[`contract/README.md`](../contract/README.md).
