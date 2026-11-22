# Regenerating and Reviewing Bindings

This document covers the full process for regenerating the TypeScript bindings
for the `vault-registry` Soroban contract and verifying that the result is
correct before committing.

For background on the bindings package and how consumers depend on it, see
[`docs/registry-client-bindings.md`](registry-client-bindings.md).

---

## Prerequisites

- Node.js 20+ and pnpm installed (`pnpm --version`)
- The Stellar CLI installed (`stellar --version`)  
  Install guide: [developers.stellar.org/docs/tools/developer-tools/stellar-cli](https://developers.stellar.org/docs/tools/developer-tools/stellar-cli)
- For WASM-based generation only: a local Rust/Cargo toolchain with the
  `wasm32v1-none` target (`rustup target add wasm32v1-none`)

Dependencies are already installed if you ran `pnpm install` during setup.

---

## When to regenerate

Regenerate whenever the **exported contract interface changes**:

- A method is added or removed
- A method's arguments or return type change
- The `Resource` struct gains or loses a field
- A new error variant is added
- The contract is redeployed at a new contract ID (even with the same WASM)

No regeneration is needed for internal-only changes that leave the ABI
unchanged.

---

## Step 1 — Regenerate the bindings

### Option A: from the deployed testnet contract (default)

```bash
pnpm contract:bindings
```

This pulls the contract spec from the network using the contract ID hardcoded in
`scripts/generate-bindings.mjs`
(`CDQKUIADLO5S5WEHEUTTXX2M45WAHVRU2PBEBD6ZGDKMOP5A72FJ3OD4`, testnet).

Use this when you want to sync to what is live on testnet and do not have a
local WASM build.

### Option B: from a locally built WASM (preferred for contract changes)

```bash
# Build the contract first
pnpm contract:build

# Generate bindings from the local WASM — no network call needed
CONTRACT_WASM=contract/target/wasm32v1-none/release/vault_registry.wasm \
  pnpm contract:bindings
```

This is the preferred path when you are iterating on the contract locally,
because it reflects your working tree exactly and does not depend on a deploy.

### Option C: from a specific deployed contract ID

```bash
VAULT_REGISTRY_CONTRACT_ID=CABC... STELLAR_NETWORK=testnet pnpm contract:bindings
```

Use this when you have deployed a new contract and want to generate bindings
from the new ID before updating the hardcoded default.

### What the script does

`scripts/generate-bindings.mjs` runs `stellar contract bindings typescript`,
which produces a full sub-package in a temporary directory. The script then:

1. Copies only `src/index.ts` from that temporary package into
   `packages/registry-client/src/generated/index.ts`.
2. Deletes the temporary directory.
3. Runs Prettier on the generated file so the output is always formatted
   consistently (CI enforces formatting, so skipping this step would fail the
   format check).

---

## Step 2 — Review the diff

```bash
git diff packages/registry-client/src/generated/index.ts
```

Look for:

- **New methods** added to the client class — expected when the contract gained
  a new function.
- **Removed methods** — expected when a function was removed; verify that no
  consumer (`server/`, `web/`, `mcp/`) still calls it.
- **Changed argument or return types** — check whether callers need updates.
- **Changed error variants** — check `packages/registry-client/src/errors.ts`
  and any consumer code that pattern-matches on error codes.
- **Contract ID change** — the generated file embeds the contract ID it was
  generated against. Confirm it matches the intended deployment.
- **Unexpected changes** — if the diff is larger than expected, regenerate from
  the WASM (`Option B`) to rule out a network-side inconsistency.

If the diff is empty, either no interface change happened or the generation
failed silently. Check the script's output for errors before proceeding.

---

## Step 3 — Rebuild the package

```bash
pnpm build:registry-client
```

This compiles the updated `src/generated/index.ts` into `dist/`. All consumers
link to `dist/`, so the rebuild is required before running any tests that
exercise the registry client.

---

## Step 4 — Run the tests

```bash
pnpm --filter @mindvault/registry-client test
```

The `bindingCheck.test.ts` suite compares the installed binding method set
against what is in the generated file. A failure here typically means the build
in Step 3 is out of sync.

Then run the full test suite to catch any consumer breakage:

```bash
pnpm test
```

If a consumer calls a method that was removed or renamed, the TypeScript
compiler will flag it during `build:registry-client` or the consumer's own
build step.

---

## Step 5 — Verify against the deployed contract (optional but recommended)

If you generated from a local WASM (`Option B`), the bindings reflect the WASM
but not necessarily the deployed contract. After deploying the new WASM, verify
that the two match:

```ts
import { checkContractBindings } from "@mindvault/registry-client";

const result = await checkContractBindings({
  contractId: "CDQKUIADLO5S5WEHEUTTXX2M45WAHVRU2PBEBD6ZGDKMOP5A72FJ3OD4",
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  network: "testnet",
});

console.log(result.status); // "match" | "mismatch" | "error"
console.log(result.message);
```

The result is deterministic and secret-free. On a `mismatch`, the message names
the drifting methods and suggests the fix:

- **Bindings expect methods the contract lacks** — the deployed contract is
  behind; redeploy `vault-registry` from the current source.
- **Contract exposes methods the bindings lack** — the bindings are stale;
  re-run `pnpm contract:bindings` and rebuild.

The MCP server also exposes this check without writing any code:

```
mindvault_registry_info
```

The `bindingCheck.status` field in the response shows the current compatibility
status at any time.

---

## Step 6 — Commit

Commit exactly one file:

```
packages/registry-client/src/generated/index.ts
```

The generated file is committed so that consumers can build without the Stellar
CLI or a network connection. Never commit the temporary
`packages/registry-client/bindings-tmp/` directory (it is gitignored).

Commit alongside any contract changes, consumer updates, or contract ID updates
that motivated the regeneration.

---

## Example: full workflow after a contract change

```bash
# 1. Edit the contract
#    contract/contracts/vault-registry/src/lib.rs

# 2. Run contract tests
pnpm contract:test

# 3. Build the WASM
pnpm contract:build

# 4. Regenerate bindings from the local WASM
CONTRACT_WASM=contract/target/wasm32v1-none/release/vault_registry.wasm \
  pnpm contract:bindings

# 5. Review the diff
git diff packages/registry-client/src/generated/index.ts

# 6. Rebuild the TypeScript package
pnpm build:registry-client

# 7. Run all tests
pnpm test

# 8. Commit
git add packages/registry-client/src/generated/index.ts
git commit -m "chore: regenerate registry-client bindings for <change summary>"
```

---

## Troubleshooting

**`stellar: command not found`**  
Install the Stellar CLI: [developers.stellar.org/docs/tools/developer-tools/stellar-cli](https://developers.stellar.org/docs/tools/developer-tools/stellar-cli).

**`CONTRACT_WASM not found`**  
Run `pnpm contract:build` first to produce the WASM at
`contract/target/wasm32v1-none/release/vault_registry.wasm`.

**Network call fails (timeout or RPC error)**  
Use `Option B` (local WASM) to skip the network entirely. If you need to target
the network, check that `SOROBAN_RPC_URL` is reachable.

**Prettier format check fails in CI**  
The script runs Prettier automatically after generation. If CI still flags the
file, regenerate locally (the Prettier version must match the one in
`devDependencies`) and commit the result.

**Tests pass but the MCP `mindvault_registry_info` shows `mismatch`**  
The bindings were generated from a WASM that differs from the currently deployed
contract. Either redeploy the contract from the current source, or regenerate
the bindings from the deployed contract ID using `Option A` or `Option C`.

---

## Related docs

- [`docs/registry-client-bindings.md`](registry-client-bindings.md) — package overview, consumer import patterns, and the full binding verification API
- [`docs/contract-upgrade-checklist.md`](contract-upgrade-checklist.md) — Phase 5 covers bindings as part of the full contract upgrade workflow
- [`docs/deployment-runbook.md`](deployment-runbook.md) — Step 1.6 covers bindings during a full stack deploy
- [`contract/README.md`](../contract/README.md) — contract API reference, error codes, and events
