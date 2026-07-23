# MCP Smoke Test

An end-to-end smoke script that boots the MindVault MCP server over stdio and
drives the full agent flow — **set up wallet → register → publish → preview →
buy** — exactly as an MCP client would. It exits non-zero the moment any tool
call fails, so it works as a fast pre-release or CI gate for the MCP surface.

Source: [`mcp/scripts/smoke.ts`](../mcp/scripts/smoke.ts) (orchestration core in
[`mcp/src/smoke.ts`](../mcp/src/smoke.ts), mock upstreams in
[`mcp/scripts/mock-server.ts`](../mcp/scripts/mock-server.ts)).

## Running it

```bash
# From the repo root
pnpm --filter @mindvault/mcp smoke              # default: mock target
pnpm --filter @mindvault/mcp smoke -- --target mock
pnpm --filter @mindvault/mcp smoke -- --target testnet

# Or from mcp/
cd mcp && pnpm smoke
```

The target can also be set with `SMOKE_TARGET=mock|testnet`.

## Targets

### `mock` (default)

Runs against an in-process HTTP stub ([`mock-server.ts`](../mcp/scripts/mock-server.ts))
that stands in for the sponsored-account service, Stellar Horizon, and the vault
API. This target needs **no network access, no funded wallet, and no live
backend**, and its output is deterministic — ideal for CI.

The paid endpoints (`/verify-content`, `GET /resources/:id`) return `200`
directly, so the x402 payment wrapper passes through without a real on-chain
payment. Upstreams are addressed via `*.localhost` hosts so the server's own
network-config validation still resolves to testnet.

### `testnet`

Runs against the real hosted backend on Stellar **testnet** (the MCP server's
defaults). The publisher wallet created during the run must hold testnet USDC to
pay the verification fee on publish and the price on buy — fund it from the
[Circle testnet faucet](https://faucet.circle.com) as described in
[mcp-quickstart.md](mcp-quickstart.md#2-funding-the-agent-wallet). Because it
touches live services, this target is slower and not deterministic.

## What it guarantees

- **Non-zero exit on failure.** Any tool result flagged `isError` (or carrying
  the server's `Error:` marker) stops the run and returns exit code `1`. A clean
  run of all five steps returns `0`.
- **Deterministic, safe output.** Failure messages are fixed-format and never
  echo secrets — the smoke driver only surfaces the server's own tool text,
  which excludes wallet secret keys and API keys.
- **Isolation.** The child MCP server runs with `HOME` pointed at a temp
  directory, so the run never reads or writes the operator's real
  `~/.mindvault/state.json`.

## Tests

The orchestration core is unit-tested in
[`mcp/src/smoke.test.ts`](../mcp/src/smoke.test.ts) (happy path, first-failure
short-circuit, soft-error handling, and transport failure) and runs as part of
`pnpm --filter @mindvault/mcp test` and the root `pnpm test`.
