# Local Testnet Reset and Reseed Guide

This guide explains how to wipe your local development state and return to a
clean, working environment. Use it when you need a fresh catalog, want to test
the full registration flow from scratch, or have drifted into an inconsistent
state.

---

## Choosing a reset scope

| Scope | What it clears | When to use |
|---|---|---|
| **Partial** | DB rows + storage objects | Most common — fresh catalog without touching wallets or env |
| **Full** | DB + storage + new wallets + `.env` wallet vars | Wallets are compromised, leaked, or you need a completely fresh identity |
| **MCP only** | Local MCP agent state files | Agent wallet or API key is wrong; server stays running |

---

## Partial reset (DB + storage, keep wallets)

This is the most common reset. It clears all catalog data and uploaded files
while keeping your Stellar wallets and `.env` unchanged.

### 1. Truncate the database

Open the [Supabase SQL editor](https://supabase.com/dashboard) for your project
and run:

```sql
-- Dependent tables first (foreign keys: verifications and payments reference resources)
TRUNCATE TABLE payments   RESTART IDENTITY CASCADE;
TRUNCATE TABLE verifications RESTART IDENTITY CASCADE;
TRUNCATE TABLE resources  RESTART IDENTITY CASCADE;
TRUNCATE TABLE publishers RESTART IDENTITY CASCADE;
```

This removes all rows and resets sequences. The schema (tables, enum types,
indexes) remains in place, so you do not need to re-run migrations.

> **Alternative — drop and recreate the project**: if you want to also clear the
> migration history, delete the Supabase project and create a new one, then
> update `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_KEY` in
> `server/.env` with the new project's credentials. Re-run `make migrate` to
> recreate the schema from scratch.

### 2. Clear storage objects

In the Supabase dashboard go to **Storage → resources bucket**. Select all
objects and delete them, or use the Supabase JavaScript client from your
terminal (requires Node.js and `server/.env` to be loaded):

```bash
# One-liner using the Supabase CLI — replace <project-ref> with yours
supabase storage rm "ss:///resources" --project-ref <project-ref> --recursive
```

If you do not have the Supabase CLI installed you can delete objects from the
dashboard: **Storage → resources → select all → Delete**.

Uploaded file blobs are stored at paths like `{resourceId}/{filename}`. After
truncating the DB, these objects are orphaned; you do not need them but they
will accumulate storage if not cleared.

### 3. Reseed the catalog

```bash
make seed
```

This runs `server/scripts/seed.ts`, which creates one seed publisher
(`seed-dev@mindvault.local`) and five sample resources. It is idempotent: if
the seed publisher already exists, it skips any resource whose title is already
present. Because you truncated the DB in step 1, this run inserts everything
fresh.

To also register the seed resources on the Stellar testnet vault registry (requires
a funded `REGISTRY_SECRET_KEY` in `server/.env`):

```bash
make seed ONCHAIN=1
```

### 4. Restart the server

```bash
make dev
```

The server caches the catalog for a short TTL (`CATALOG_CACHE_TTL_MS`, default
10 seconds). After a restart the cache is empty and the new seed data is served
immediately.

---

## Full reset (new wallets)

Use this when you need entirely fresh Stellar identities — for example, your
secret keys were committed by mistake, or you want a clean on-chain history.

### 1. Complete the partial reset (steps 1–2 above)

Clear the DB and storage first so the new wallet address is consistent from the
start.

### 2. Generate new wallets

```bash
make wallets
```

This runs `server/scripts/generate-wallet.ts`, prints a new keypair, and funds
it with 10,000 testnet XLM via Friendbot. Run it **twice** — once for the
platform wallet (`PAY_TO`) and once for the agent wallet (`AGENT_SECRET_KEY`).

```
=== Stellar Testnet Wallet ===
Public Key:  GNEW...
Secret Key:  SNEW...
Funded with 10,000 XLM on testnet.
```

### 3. Update `server/.env`

Replace the wallet variables with the new values:

```env
PAY_TO=GNEW...              # First run's public key
AGENT_SECRET_KEY=SNEW...   # Second run's secret key
```

If you are also replacing the registry deployer wallet, update
`REGISTRY_SECRET_KEY` as well.

### 4. Add a USDC trustline for the new agent wallet

```bash
make setup-usdc
```

This adds a USDC trustline to the account identified by `AGENT_SECRET_KEY`.
Then fund it with testnet USDC from the [Circle testnet faucet](https://faucet.circle.com).

For the platform wallet (`PAY_TO`), connect Freighter, switch to testnet, and
add the trustline manually (or use Stellar Laboratory). Fund it from the Circle
faucet too if the platform wallet needs to receive or spend USDC directly.

> See [docs/stellar-testnet-funding.md](stellar-testnet-funding.md) for full
> trustline and faucet instructions.

### 5. Reseed

```bash
make seed
```

The seed publisher is created with the wallet address from `PAY_TO`, so it now
points to your new platform wallet.

### On-chain registry entries

The old wallet's on-chain registrations in the vault registry contract persist
on testnet — the Stellar network has no reset. These orphaned entries are
harmless; they are owned by the old key and cannot be modified with the new one.
If you need a clean on-chain slate, deploy a fresh vault-registry contract (see
[docs/contract-upgrade-checklist.md](contract-upgrade-checklist.md)) and update
`VAULT_REGISTRY_CONTRACT_ID` in `server/.env`.

---

## MCP-only reset (agent state files)

The MCP server persists agent state locally. These files are on your machine and
are unrelated to the server or Supabase.

| File | Contents | Reset command |
|---|---|---|
| `~/.mindvault/state.json` | Active wallet keypair + publisher API key (per profile) | `rm ~/.mindvault/state.json` |
| `~/.mindvault/purchases.json` | Local purchase receipts | `rm ~/.mindvault/purchases.json` |

After deleting `state.json`, the MCP server starts with no wallet. Run
`mindvault_setup_wallet` to provision a new sponsored testnet account, then
`mindvault_register` to re-register as a publisher.

The audit log (if enabled via `MINDVAULT_AUDIT_LOG_FILE`) is at whatever path
you configured. It is not cleared by any of the above resets; delete or rotate
it separately if needed.

> The MCP `mindvault_reset` tool clears the in-memory wallet and API key for the
> current session without deleting the file. Use it to log out within a live
> session. To permanently clear persisted state, delete the file as above.

---

## Quick-reference command summary

```bash
# ── Partial reset ──────────────────────────────────────────────────────────
# 1. Truncate all tables (run in Supabase SQL editor)
TRUNCATE TABLE payments, verifications, resources, publishers RESTART IDENTITY CASCADE;

# 2. Clear storage (dashboard or Supabase CLI)
supabase storage rm "ss:///resources" --project-ref <ref> --recursive

# 3. Reseed
make seed
# or with on-chain registration:
make seed ONCHAIN=1

# ── Full reset (new wallets) ───────────────────────────────────────────────
# Generate platform wallet (run twice for two separate wallets)
make wallets
# After updating server/.env with new keys:
make setup-usdc       # USDC trustline for AGENT_SECRET_KEY
# Then reseed:
make seed

# ── MCP only ──────────────────────────────────────────────────────────────
rm ~/.mindvault/state.json         # wallet + API key
rm ~/.mindvault/purchases.json     # purchase receipts
```

---

## Compatibility notes

- **Drizzle migration history** is not affected by a DB truncate. The
  `__drizzle_migrations` table tracks which migrations have run; truncating
  application tables does not touch it. If you drop and recreate the Supabase
  project, run `make migrate` to replay all migrations from the journal
  (`server/drizzle/meta/_journal.json`).

- **Enum types** (`resource_type`, `verification_status`, `onchain_status_enum`)
  live at the schema level. A truncate preserves them. Only a full DROP or
  project delete removes them.

- **`make seed` idempotency**: the seed script skips resources whose title
  already exists for the seed publisher (`seed-dev@mindvault.local`). After a
  truncate + reseed cycle the check always creates fresh rows because the
  publisher row was also removed.

- **Testnet USDC balance**: clearing the DB and storage does not affect on-chain
  balances. Your wallet's USDC and XLM persist on the Stellar testnet regardless
  of local resets.

---

## Related docs

- [Local Setup Guide](local-setup.md) — first-time setup from a fresh clone
- [Supabase Setup](supabase-setup.md) — project creation, credentials, and storage bucket
- [Stellar Testnet Funding](stellar-testnet-funding.md) — Friendbot XLM, Circle USDC faucet, trustlines
- [Reconciliation](reconciliation.md) — detect drift between DB and on-chain registry after a partial reset
- [Contract Upgrade Checklist](contract-upgrade-checklist.md) — deploy a fresh vault-registry contract for a clean on-chain slate
