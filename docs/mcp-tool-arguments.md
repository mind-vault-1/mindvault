# MCP Tool Arguments — Validation Contract

Every MindVault MCP tool validates its arguments against an explicit schema
before it does any work. Nothing reaches a handler — no HTTP request, no
payment signature, no state write — until the whole argument bag has passed.

This page is the contract agent clients can code against: what each tool
accepts, what a rejection looks like, and which values are normalized.

- Specs live in [`mcp/src/validation.ts`](../mcp/src/validation.ts) (`TOOL_ARGUMENT_SPECS`).
- Advertised metadata lives in [`mcp/src/tools.ts`](../mcp/src/tools.ts) (`TOOL_DEFINITIONS`).
- Tests enforce that the two agree, so a new tool cannot ship unvalidated.

---

## Rules that apply to every tool

| Rule                       | Behavior                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Argument bag               | Must be a JSON object. `null`/omitted is treated as `{}`.                                                                              |
| Unknown arguments          | **Rejected**, not ignored — a typo is reported instead of silently dropping the value.                                                 |
| Missing required arguments | Rejected, naming each missing field.                                                                                                   |
| Strings                    | Trimmed before use; empty (or whitespace-only) is rejected.                                                                            |
| Booleans ("flags")         | Accept `true`/`false`, `1`/`0`, and the strings `true/false`, `yes/no`, `on/off`, `1/0` (case-insensitive). Anything else is rejected. |
| Digests                    | Accept the fixed metadata hash format — see [MCP metadata hash format](mcp-metadata-hash.md).                                          |
| Multiple problems          | Reported together in one error, in schema order.                                                                                       |
| Determinism                | The same invalid call always produces the same message.                                                                                |
| Secrets                    | Rejected values are never echoed back — messages describe the field and the expected shape only.                                       |

---

## Error shape

A rejected call comes back as a normal MCP tool result with `isError: true` and
a single text block:

```
Error: Invalid arguments for mindvault_publish: price is malformed. Expected a
non-negative decimal amount in USDC, e.g. "5.00". externalUrl is required.
Expected an http(s) URL, e.g. https://example.com/data.json.
```

An unrecognized tool name is reported the same way:

```
Error: Unknown tool: mindvault_by. Available tools: mindvault_agent_status, mindvault_backup_state, …
```

Each issue carries a stable code (`unknown_argument`, `missing_required`,
`wrong_type`, `empty_string`, `too_short`, `too_long`, `pattern_mismatch`,
`not_in_enum`, `invalid_hash`, `not_an_object`) for clients that want to branch
on the failure rather than parse prose.

---

## Per-tool arguments

`confirmMainnet` (flag, optional) is accepted by every mutating tool and is
**required on mainnet** unless `MINDVAULT_ALLOW_MAINNET=1` is set on the server
— see [mainnet guardrails](mainnet-deployment-checklist.md).

| Tool                           | Argument               | Required | Accepted values                                 |
| ------------------------------ | ---------------------- | -------- | ----------------------------------------------- |
| `mindvault_setup_wallet`       | `profile`              | no       | letters, digits, dot, dash, underscore (1–64)   |
| `mindvault_wallet_info`        | —                      | —        | takes no arguments                              |
| `mindvault_use_profile`        | `name`                 | yes      | letters, digits, dot, dash, underscore (1–64)   |
| `mindvault_list_profiles`      | —                      | —        | takes no arguments                              |
| `mindvault_browse`             | —                      | —        | takes no arguments                              |
| `mindvault_search`             | `query`                | yes      | 1–256 characters                                |
|                                | `minPrice`, `maxPrice` | no       | decimal USDC string, e.g. `"5.00"`              |
|                                | `verificationStatus`   | no       | `pending`, `verified`, `rejected`, `skipped`    |
|                                | `resourceType`         | no       | `file`, `link`                                  |
| `mindvault_preview`            | `resourceId`           | yes      | letters, digits, dot, dash, underscore (≤128)   |
| `mindvault_batch_catalog_lookup` | `resourceIds`        | yes      | comma-separated resource ids (≤20 ids, ≤3000 chars total) |
| `mindvault_register`           | `name`                 | yes      | 1–128 characters                                |
|                                | `email`                | yes      | email address (≤254)                            |
|                                | `walletAddress`        | no       | Stellar public key (`G…`, 56 chars)             |
| `mindvault_publish`            | `title`                | yes      | 1–256 characters                                |
|                                | `description`          | no       | ≤2048 characters                                |
|                                | `price`                | yes      | decimal USDC string                             |
|                                | `externalUrl`          | yes      | `http(s)://…` (≤2048)                           |
| `mindvault_buy`                | `resourceId`           | yes      | resource id                                     |
| `mindvault_register_onchain`   | `resourceId`           | yes      | resource id                                     |
| `mindvault_update_metadata`    | `resourceId`           | yes      | resource id                                     |
|                                | `metadata`             | yes      | pointer (ipfs://, ar://, http(s)://, etc. ≤512) |
| `mindvault_set_price`          | `resourceId`           | yes      | resource id                                     |
|                                | `price`                | yes      | decimal USDC amount (e.g. `"10.00"`)            |
| `mindvault_transfer_ownership` | `resourceId`           | yes      | resource id                                     |
|                                | `newCreator`           | yes      | Stellar public key (`G…`, 56 chars)             |
| `mindvault_set_listed`         | `resourceId`           | yes      | resource id                                     |
|                                | `listed`               | yes      | boolean (`true`/`false`)                        |
| `mindvault_agent_status`       | —                      | —        | takes no arguments                              |
| `mindvault_registry_info`      | —                      | —        | takes no arguments                              |
| `mindvault_network_profile`    | —                      | —        | takes no arguments                              |
| `mindvault_check_bindings`     | —                      | —        | takes no arguments                              |
| `mindvault_verify_install`     | —                      | —        | takes no arguments                              |
| `mindvault_check_consistency`  | `resourceId`           | yes      | resource id                                     |
|                                | `expectedMetadataHash` | no       | [metadata digest](mcp-metadata-hash.md)         |
| `mindvault_registry_lookup`    | `resourceId`           | yes      | resource id                                     |
| `mindvault_registry_list`      | `start`                | no       | integer ≥ 0 (default 0)                         |
|                                | `limit`                | no       | integer 1–20 (default 20; contract cap)         |
| `mindvault_tx_status`          | `txHash`               | yes      | sha256 digest (64 hex chars)                    |
| `mindvault_reset`              | `all`                  | no       | flag — clears every profile                     |
| `mindvault_backup_state`       | `passphrase`           | yes      | 8–512 characters                                |
| `mindvault_restore_state`      | `blob`                 | yes      | backup blob (`v1:…`)                            |
|                                | `passphrase`           | yes      | 8–512 characters                                |
| `mindvault_metrics`            | `reset`                | no       | flag — clears counters after reading            |

### Why resource ids are restricted

`resourceId` is interpolated into API paths (`/resources/:id/meta`). Restricting
it to `[A-Za-z0-9._-]` means a crafted id can never change which endpoint the
server calls.

---

## Normalization

Handlers receive normalized values, so a tool behaves identically whichever
accepted spelling the agent used:

| Argument kind          | Normalization                 |
| ---------------------- | ----------------------------- |
| string                 | trimmed                       |
| enum                   | trimmed, compared exactly     |
| flag                   | coerced to a real boolean     |
| `txHash`               | lowercased bare hex           |
| `expectedMetadataHash` | canonical `sha256:<hex>` form |

---

## Behavior notes

Two tools used to answer an invalid call with a friendly sentence instead of an
error. They now fail like every other invalid call, so an agent can rely on
`isError` rather than string-matching prose:

- `mindvault_search` with an empty `query` → `Invalid arguments…` (was
  `"Provide a non-empty search query."`)
- `mindvault_tx_status` with an empty `txHash` → `Invalid arguments…` (was
  `"Provide a transaction hash to look up."`)

Valid calls are unaffected.
