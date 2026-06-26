# Delist strategy: off-chain vs contract method

Issue #37 asked whether delist should stay off-chain (DB `listed=false` only) or also
use an on-chain contract method. This document records the decision: **use both**.

## Background

The `vault-registry` contract records each resource's `listed` boolean. The server
stores a mirror `listed` column in the `resources` table for fast catalog queries.

## Options

### Option A: Off-chain delist only

- `DELETE /resources/:id` sets `resources.listed = false` in Postgres.
- No on-chain mutation — the contract still shows `listed: true`.
- Catalog queries (filtered on `listed = true`) are fast.
- Reconcile script (`server/scripts/reconcile.ts`) reports listing drift.

**Downside**: On-chain state diverges from off-chain. Anyone reading the contract
directly sees stale listing status.

### Option B: On-chain delist only

- `DELIST` / `set_listed(id, false)` on the Soroban contract.
- Server reads must check the contract rather than a local index.
- Latency and RPC cost for every catalog query.

**Downside**: No fast local catalog listing without a local cache or index.

### Option C: Dual delist (chosen)

- **On-chain**: `set_listed(id, false)` / `delist(id)` via Soroban — provides
  transparent, authoritative listing state on-chain.
- **Off-chain**: Server sets `listed = false` in Postgres on `DELETE /resources/:id`
  for fast catalog queries.
- **Reconciliation**: The `reconcile.ts` script detects on-chain vs off-chain
  listing drift; the event listener (issue #90) keeps the DB in sync when mutations
  happen directly on-chain.

## Decision

**Use both on-chain and off-chain delist** — the contract provides transparency and
authoritative state, while the DB provides fast indexed queries for the catalog.

The contract's `set_listed` / `delist` methods (already implemented) are the
on-chain mechanism. The server's `delistResource` (issue #19) handles the
off-chain side, setting `listed = false` in DB and cleaning up storage, and
(issue #218) now also triggers the on-chain delist so chain state matches the API.

## On-chain sync behaviour (issue #218)

`delistResource` calls `delistOnChain(id)` after the DB delist. Because
`DELETE /resources/:id` carries no client wallet signature, the call is signed
server-side with the registry keypair (the same pattern the legacy on-chain
register flow uses) and is **best-effort**:

- Resources whose `onchainStatus` is not `registered` were never written to the
  contract, so the chain call is skipped and they delist DB-only.
- If the chain call fails (RPC outage, creator-auth mismatch, NotFound), the DB
  delist still stands and the failure is logged under `event:
"delist_onchain_sync"`. The reconcile script and event listener (issue #90)
  remain the backstop that converges any residual drift.

## Implementation

| Layer    | Method                                                 | Status             |
| -------- | ------------------------------------------------------ | ------------------ |
| Contract | `set_listed(id, listed)`                               | Implemented        |
| Contract | `delist(id)` (convenience)                             | Implemented        |
| Server   | `DELETE /resources/:id` → `listed = false`             | Implemented        |
| Server   | `delistResource` → on-chain `delist(id)` (best-effort) | Implemented (#218) |
| Server   | Event listener syncs on-chain → DB                     | Issue #90          |
