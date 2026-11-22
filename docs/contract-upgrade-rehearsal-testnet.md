# Contract Upgrade Rehearsal — Testnet

A rehearsal is a full deploy of the vault-registry WASM you intend to ship, performed against testnet with the same commands and configuration the mainnet rollout will use. It catches build, size, binding, and configuration drift before anyone changes the production `VAULT_REGISTRY_CONTRACT_ID`.

> [!IMPORTANT]
> The registry contract is **immutable**. There is no in-place `stellar contract upgrade` step. An "upgrade" means building a new optimized WASM, deploying it as a **new contract**, and repointing `VAULT_REGISTRY_CONTRACT_ID` at the new id. See [`contract-upgrade-checklist.md`](./contract-upgrade-checklist.md) for the full preflight checklist.

This guide is a rehearsal, not a replacement for that checklist: run it from a clean checkout of the commit you plan to release, and record every id and hash it prints.

## 1. Prerequisites

- Node 20+ and pnpm (see [`local-setup.md`](./local-setup.md)), Rust with the `wasm32v1-none` target, and the Stellar CLI (see [`CONTRIBUTING.md`](../CONTRIBUTING.md)).
- A funded `deployer` identity on testnet. `stellar keys generate deployer --network testnet --fund` works on testnet only; see [`stellar-testnet-funding.md`](./stellar-testnet-funding.md) for friendbot and USDC options.
- The current mainnet/testnet deployment record in [`../contract/README.md`](../contract/README.md#testnet-deployment) for comparison.

## 2. Build the candidate WASM

Run the same commands CI runs. From the repository root:

```bash
pnpm contract:test          # cargo test --manifest-path contract/Cargo.toml

cd contract
cargo test
stellar contract build --manifest-path Cargo.toml --optimize
stat -c%s target/wasm32v1-none/release/vault_registry.wasm
stellar contract wasm hash --wasm target/wasm32v1-none/release/vault_registry.wasm
cd ..
```

The size guard in CI uses **159744 bytes** (see [`.github/workflows/contract-ci.yml`](../.github/workflows/contract-ci.yml) and the crate `Makefile`). A larger WASM fails CI even if the deploy itself succeeds, so stop and reduce the size before continuing. Older docs quote smaller budgets; the CI value is authoritative.

## 3. Deploy a fresh testnet instance

```bash
export NETWORK=testnet
export SOROBAN_RPC=https://soroban-testnet.stellar.org
export NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

stellar keys show deployer
stellar account show --network $NETWORK --account $(stellar keys address deployer)
curl -s $SOROBAN_RPC/health | jq .

export NEW_CONTRACT_ID=$(
  stellar contract deploy \
    --wasm target/wasm32v1-none/release/vault_registry.wasm \
    --source deployer \
    --network $NETWORK
)

stellar contract info --network $NETWORK --contract-id $NEW_CONTRACT_ID | jq .wasm_hash
stellar contract invoke --network $NETWORK --id $NEW_CONTRACT_ID -- registry_info
stellar contract invoke --network $NETWORK --id $NEW_CONTRACT_ID -- contract_version
```

The path above is relative to `contract/`; if you run the deploy from the repository root, use `contract/target/wasm32v1-none/release/vault_registry.wasm` instead. Verify that the reported WASM hash matches the hash recorded in step 2.

## 4. Regenerate bindings and exercise the stack

```bash
CONTRACT_WASM=contract/target/wasm32v1-none/release/vault_registry.wasm \
  pnpm contract:bindings

pnpm --filter @mindvault/registry-client test
pnpm --filter @mindvault/registry-client build

VAULT_REGISTRY_CONTRACT_ID=$NEW_CONTRACT_ID pnpm --filter @mindvault/server dev
curl -s http://localhost:4021/health/ready | jq .
curl -s http://localhost:4021/registry | jq .
```

In a second terminal, point the MCP server at the rehearsal id and check the deployment tools:

```bash
VAULT_REGISTRY_CONTRACT_ID=$NEW_CONTRACT_ID STELLAR_NETWORK=testnet \
  pnpm --filter @mindvault/mcp dev
```

Call `mindvault_registry_info` and `mindvault_verify_deployment` with the new id, then stop both processes. Binding regeneration is explained in [`registry-client-bindings.md`](./registry-client-bindings.md); the deployed method set is checked by the registry client's binding drift check.

## 5. Rehearse admin bootstrap and rollback

A fresh contract has no admin or verifiers. Bootstrap them exactly as you would in production, using the new id:

```bash
stellar contract invoke --network $NETWORK --id $NEW_CONTRACT_ID \
  --source deployer -- nominate_new_admin --new_admin <ADMIN_ADDRESS>
stellar contract invoke --network $NETWORK --id $NEW_CONTRACT_ID \
  --source <ADMIN_KEY> -- add_verifier --verifier <VERIFIER_ADDRESS>
```

Record the old and new contract ids, both WASM hashes, and the config values you changed. Rollback is a configuration change, not a contract call: restore the previous `VAULT_REGISTRY_CONTRACT_ID` and restart the server and MCP processes. Data written to the rehearsal id stays there — do not treat it as a migration of production state.

## 6. Sign-off

- CI is green for the release commit, including the WASM size guard and contract tests.
- `registry_info` and `contract_version` on the new testnet id match the candidate build.
- Bindings regenerate cleanly and the diff is committed (or there is no diff).
- Server readiness, registry lookup, and MCP deployment verification all pass against the new id.
- Rollback was performed once and the previous id responded again.

## Related docs

- [`contract-upgrade-checklist.md`](./contract-upgrade-checklist.md) — full preflight and cutover checklist
- [`deployment-runbook.md`](./deployment-runbook.md) — full-stack deployment procedure
- [`registry-client-bindings.md`](./registry-client-bindings.md) — binding generation and freshness checks
- [`stellar-testnet-funding.md`](./stellar-testnet-funding.md) — funding the testnet deployer
- [`../contract/README.md`](../contract/README.md) — contract API, events, and testnet deployment record
- [`contract-method-event-reference.md`](./contract-method-event-reference.md) — published method and event reference generated from bindings
