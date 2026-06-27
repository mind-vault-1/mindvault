# Registry-Client Binding Regeneration

The `@mindvault/registry-client` package (`packages/registry-client/`) provides
typed TypeScript bindings for the `vault-registry` Soroban contract. All
consumers — `server/`, `web/`, and `mcp/` — import from this single workspace
package instead of reaching into generated code directly.

This document explains when to regenerate the bindings, how the generation
script works, which files to commit, and how the package is consumed.

## When to regenerate

Regenerate the bindings whenever the **on-chain contract interface changes**:

- A new method is added to the contract (e.g. `set_tags`)
- A method signature changes (new/removed arguments, different return type)
- The `Resource` struct gains or removes a field
- A new error variant is added
- The contract is redeployed to a new contract ID

If a change is limited to internal contract logic (no ABI change), regeneration
is not required.

## How to regenerate

From the repo root:

```bash
pnpm contract:bindings
```

This runs [`scripts/generate-bindings.mjs`](../scripts/generate-bindings.mjs),
which:

1. Calls `stellar contract bindings typescript` to produce raw bindings in a
   temporary directory (`packages/registry-client/bindings-tmp/`).
2. Copies only the generated source (`src/index.ts`) into
   `packages/registry-client/src/generated/index.ts`.
3. Removes the temporary directory.

### Input options

By default the script pulls bindings from the **deployed testnet contract**
using the contract ID hard-coded in the script. Override with environment
variables:

| Variable | Purpose | Example |
|----------|---------|---------|
| `CONTRACT_WASM` | Generate from a local WASM instead of the deployed contract | `CONTRACT_WASM=contract/target/wasm32v1-none/release/vault_registry.wasm` |
| `VAULT_REGISTRY_CONTRACT_ID` | Use a different deployed contract ID | `VAULT_REGISTRY_CONTRACT_ID=CABC...` |
| `STELLAR_NETWORK` | Target network (default `testnet`) | `STELLAR_NETWORK=mainnet` |

The `CONTRACT_WASM` approach is preferred when iterating on the contract locally
because it does not require a deploy:

```bash
pnpm contract:build
CONTRACT_WASM=contract/target/wasm32v1-none/release/vault_registry.wasm pnpm contract:bindings
```

## What to commit

After regeneration, **commit the updated generated file**:

```
packages/registry-client/src/generated/index.ts
```

This file is checked into git so that consumers can build without needing the
Stellar CLI or a network connection. The temporary `bindings-tmp/` directory is
gitignored and should never be committed.

Do not commit any files outside `packages/registry-client/src/generated/`.

## Building the package

After updating the generated bindings, rebuild the package so the compiled
output in `dist/` is up to date:

```bash
pnpm build:registry-client
```

This is also run automatically as part of `pnpm build:server` and `pnpm test`.

## How consumers depend on the package

All three consumers declare a workspace dependency in their `package.json`:

```json
"@mindvault/registry-client": "workspace:*"
```

| Consumer | Dependency declaration | Primary imports |
|----------|----------------------|-----------------|
| `server/` | `"@mindvault/registry-client": "workspace:*"` | `createRegistryClient`, `Client`, `Resource`, network utilities |
| `web/` | `"@mindvault/registry-client": "workspace:*"` | `Resource` type, Stellar Explorer helpers |
| `mcp/` | `"@mindvault/registry-client": "workspace:*"` | `createRegistryClient`, `Client`, `Resource` |

Because this is a pnpm workspace dependency, `pnpm install` links the package
automatically — no publish step is needed.

### Import path

Consumers import from the package name, never from the generated directory:

```ts
import { createRegistryClient, type Resource } from "@mindvault/registry-client";
```

The package's `src/index.ts` re-exports everything from `./generated/index.js`,
so adding a new contract method requires no import-path changes in consumers.

## Typical workflow after a contract change

```bash
# 1. Edit the contract
#    contract/contracts/vault-registry/src/lib.rs

# 2. Run contract tests
pnpm contract:test

# 3. Build the WASM
pnpm contract:build

# 4. Regenerate bindings from the local WASM
CONTRACT_WASM=contract/target/wasm32v1-none/release/vault_registry.wasm pnpm contract:bindings

# 5. Rebuild the TypeScript package
pnpm build:registry-client

# 6. Update consumers if the new method needs to be called
#    (e.g. add a new endpoint in server/)

# 7. Commit the generated file alongside the contract and consumer changes
```

## Further reading

- [`packages/registry-client/README.md`](../packages/registry-client/README.md) — package overview and usage examples
- [`contract/README.md`](../contract/README.md) — contract interface, error codes, and deployment
- [`docs/architecture.md`](architecture.md) — how the registry client fits into the system
- [`docs/deployment-runbook.md`](deployment-runbook.md) — Step 1.6 covers regeneration during deployment
