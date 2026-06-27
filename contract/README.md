# MindVault Contracts (Soroban)

Soroban smart contracts for MindVault. Today there is one:

## `vault-registry`

An on-chain registry of vault resources. It is the transparent source of truth
for **what** exists in the vault, **who** owns it, and **what it costs** —
anyone can read it directly from the chain without trusting the MindVault API.

Payments themselves do **not** run through this contract. They continue to flow
through x402 and the USDC Stellar Asset Contract (see the root README). The
registry complements that: the server settles payment via x402, and records /
reads the canonical resource entry here.

### Methods

| Function | Auth | Args | Returns | Description |
|----------|------|------|---------|-------------|
| `register(creator, id, price, metadata)` | `creator` | `creator: Address` — the resource owner; `id: String` — unique cuid2; `price: i128` — USDC stroops (> 0); `metadata: String` — pointer (max 512 bytes) | `Result<(), Error>` | Register a new resource. Resources are listed by default. |
| `set_price(id, new_price)` | `creator` | `id: String` — resource cuid2; `new_price: i128` — USDC stroops (> 0) | `Result<(), Error>` | Update the resource price. |
| `update_metadata(id, metadata)` | `creator` | `id: String` — resource cuid2; `metadata: String` — new pointer (max 512 bytes) | `Result<(), Error>` | Update the metadata pointer. |
| `transfer_ownership(id, new_creator)` | `creator` | `id: String` — resource cuid2; `new_creator: Address` — new owner | `Result<(), Error>` | Transfer resource ownership to a new address. |
| `set_listed(id, listed)` | `creator` | `id: String` — resource cuid2; `listed: bool` — listing state | `Result<(), Error>` | Set the listing state (true = listed, false = delisted). |
| `delist(id)` | `creator` | `id: String` — resource cuid2 | `Result<(), Error>` | Convenience; equivalent to `set_listed(id, false)`. |
| `list(start, limit)` | — | `start: u32` — 0‑based index; `limit: u32` — page size (capped at 20) | `Vec<Resource>` | Paginated resource list in insertion order. |
| `get(id)` | — | `id: String` — resource cuid2 | `Result<Resource, Error>` | Read a single resource. Errors `NotFound` if absent. |
| `exists(id)` | — | `id: String` — resource cuid2 | `bool` | Whether a resource is registered. |
| `count()` | — | — | `u32` | Total resources successfully registered (monotonic). |

### Error codes

| Code | Error | Description |
|------|-------|-------------|
| `1` | `AlreadyRegistered` | A resource with the given `id` already exists. |
| `2` | `NotFound` | No resource matches the given `id`. |
| `3` | `InvalidPrice` | Price is `<= 0`. |
| `4` | `MetadataTooLong` | Metadata pointer exceeds `MAX_METADATA_POINTER_LEN` (512 bytes). |

### Events

All events use the topic `(symbol, id)` — the first element identifies the event
kind, the second carries the affected resource id.

| Event | Payload | Triggered by |
|-------|---------|-------------|
| `register` | `creator: Address` | `register()` succeeds |
| `setprice` | `new_price: i128` | `set_price()` succeeds |
| `updmeta` | `()` | `update_metadata()` succeeds |
| `transfer` | `new_creator: Address` | `transfer_ownership()` succeeds |
| `setlisted` | `listed: bool` | `set_listed()` (and `delist()`) succeeds |

### Price units

`price` is an `i128` in **USDC stroops** (7 decimal places).  
Examples: `1_000_000` = 0.10 USDC, `10_000_000` = 1.00 USDC, `500_000` = 0.05 USDC.

### Resource type

```rust
pub struct Resource {
    pub id: String,       // unique cuid2, matches server resource ID
    pub creator: Address, // current owner's Stellar address
    pub price: i128,      // price in USDC stroops (7 decimals)
    pub metadata: String, // pointer (IPFS URI, content hash, or JSON anchor), max 512 bytes
    pub listed: bool,     // whether the resource is available for discovery/purchase
}
```

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_METADATA_POINTER_LEN` | `512` | Maximum length of the metadata pointer in bytes. |

### Breaking change: tags on `register` (v2)

`register` now requires a fifth argument `tags: Vec<String>`. Existing callers must pass
`[]` (empty tags) until they adopt labels. The `Resource` struct gains a `tags` field;
`set_tags` updates tags without touching `metadata`.

**Migration:** redeploy the contract, regenerate TypeScript bindings
(`CONTRACT_WASM=... pnpm contract:bindings`), and update every `register` call site to
include `tags` (use `[]` for resources without labels). Server-side filtering by tag is
a follow-up; tags are stored on-chain for catalog use.

### Develop

```bash
cargo test                                           # run unit tests
stellar contract build --manifest-path Cargo.toml    # build wasm
```

### Deploy (testnet)

```bash
# One-time: create & fund an identity
stellar keys generate deployer --network testnet --fund

stellar contract deploy \
  --wasm target/wasm32v1-none/release/vault_registry.wasm \
  --source deployer \
  --network testnet
```

The command prints the deployed contract ID — wire it into the server config so
the backend can record resources on registration.

### Testnet Deployment

The current canonical testnet deployment:

| Field             | Value                                                          |
|-------------------|----------------------------------------------------------------|
| Contract ID       | `CDQKUIADLO5S5WEHEUTTXX2M45WAHVRU2PBEBD6ZGDKMOP5A72FJ3OD4`     |
| Wasm Hash         | `fa60c0c2086fddf6add8abc7e1b191e1368ed62983f4e967069fc4b4d679c8eb` |
| Deployer Address  | `GDAL5CGX7PU56PS2GJW65JNZSN7VLWI6R7H7E3G2HVS5R6XQQI2NJX34`     |
| Network           | Stellar Testnet (`Test SDF Network ; September 2015`)          |
| Soroban RPC       | `https://soroban-testnet.stellar.org`                          |
| Deployment Date   | 2026-05-27                                                     |
| Explorer          | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CDQKUIADLO5S5WEHEUTTXX2M45WAHVRU2PBEBD6ZGDKMOP5A72FJ3OD4) |

Set `VAULT_REGISTRY_CONTRACT_ID` and `SOROBAN_RPC_URL` in the server `.env`
(see [`server/.env.example`](../server/.env.example)) so the backend can
record/read resources on this contract.

### Emergency pause

See [contract-registry-pause-decision.md](../docs/contract-registry-pause-decision.md)
for the architecture spike on admin pause/unpause. **v1 does not implement pause**
(creator-scoped writes + off-chain ops are sufficient for the current trust model).

### Ideas for contributors

- Optional escrow/refund extension (see the root README's "Not Yet Built").
- A TypeScript binding generated via `stellar contract bindings typescript`
  for the `server/` and `web/` packages to consume.
