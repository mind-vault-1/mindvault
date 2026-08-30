# MCP Offline Catalog Cache

`browse`, `search` and `preview` depend on the MindVault catalog API. When that
service is unreachable — DNS failure, refused connection, timeout — they fall
back to the last snapshot captured from a successful read, labelled with its
age. Mutating and payment tools never consult the cache.

The lifetime of those snapshots is configurable
([#573](https://github.com/mind-vault-1/mindvault/issues/573)).

## Configuration

| Variable                             | Default          | Description                                                 |
| ------------------------------------ | ---------------- | ----------------------------------------------------------- |
| `MINDVAULT_CATALOG_CACHE_TTL_MS`     | `86400000` (24h) | Age at which a snapshot starts carrying a staleness warning |
| `MINDVAULT_CATALOG_CACHE_MAX_AGE_MS` | `0` (unlimited)  | Age past which a snapshot is not served at all              |

```json
{
  "mcpServers": {
    "mindvault": {
      "command": "node",
      "args": ["/absolute/path/to/mindvault/mcp/dist/index.js"],
      "env": {
        "MINDVAULT_CATALOG_CACHE_TTL_MS": "3600000",
        "MINDVAULT_CATALOG_CACHE_MAX_AGE_MS": "86400000"
      }
    }
  }
}
```

With nothing set the behaviour is unchanged from before #573: warn after 24
hours, never withhold.

## Two limits, because "stale" and "useless" are different questions

**Past the TTL** a snapshot is still served, with a warning:

```
⚠ Offline catalog snapshot served (cached 2 day ago) — stale; results may be
outdated. Confirm a specific resource on-chain with mindvault_registry_lookup
when freshness matters.
```

Offline, a day-old catalog beats no catalog. The agent is told what it is
holding and can decide.

**Past the max age** the snapshot is withheld entirely and the tool fails as if
no cache existed. That is what an operator wants when acting on outdated
pricing is worse than failing — an expired snapshot is dropped rather than
merely hidden, so the memory is released and a later call cannot resurrect it.

`MINDVAULT_CATALOG_CACHE_MAX_AGE_MS=0` disables the second limit, which is the
default.

## Choosing values

- **Fast-moving catalog, agent can retry** — lower the TTL so the warning
  appears sooner: `MINDVAULT_CATALOG_CACHE_TTL_MS=900000` (15 min).
- **Payments driven off catalog prices** — set a max age. A stale price is a
  wrong price, and a warning the model may ignore is not a control.
- **Long offline sessions** — raise the TTL so a genuinely useful snapshot is
  not labelled alarming: `MINDVAULT_CATALOG_CACHE_TTL_MS=604800000` (7 days).

Setting a max age **below** the TTL would make the TTL unreachable — the
snapshot would vanish before it was ever labelled stale. The stricter intent
wins: the TTL is pulled down to match, rather than one setting being silently
ignored.

A malformed or negative value falls back to the default rather than failing
startup. An offline cache is a resilience feature; a typo in its tuning must
not stop the server from serving.

## Scope

The cache is in memory for the lifetime of the server process — the same scope
as profile state. There is deliberately no filesystem use, which keeps "no
cache present" deterministic and independent of anything an earlier run left
behind.

## Coverage

- [`mcp/src/catalogCache.test.ts`](../mcp/src/catalogCache.test.ts) — snapshot
  capture, retrieval and labelling
- [`mcp/src/catalogCacheTtl.test.ts`](../mcp/src/catalogCacheTtl.test.ts) —
  configuration parsing, the TTL/max-age interaction, expiry and eviction
