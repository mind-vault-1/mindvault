# Registry Cursor Guarantees and Limits

The vault-registry contract exposes two distinct cursor families for paging
through on-chain resources. They behave differently and appear on different MCP
tools. This document describes both, their limits, their stability guarantees,
and how to use them correctly.

---

## Two cursor families

| Family | Type | Used by | MCP exposure |
|---|---|---|---|
| **Catalog index** | `u32` integer | `mindvault_registry_list`, `mindvault_registry_tag_search` | plain integer |
| **Id cursor** | opaque base64url token | `mindvault_registry_creator_page` | opaque string token |

Both families enforce the same page-size cap. The families are not
interchangeable: passing an id-cursor token to `mindvault_registry_list` or an
integer to `mindvault_registry_creator_page` is a validation error.

---

## Catalog index cursor

### What it is

A `u32` offset into the global registration catalog. Slot 0 is the first
resource ever registered; slot *n* is the *(n+1)*th. The offset is 0-based and
points to the first slot that has not been scanned yet, not to a count of
matched results.

### Which tools use it

| MCP tool | Contract method | First-page value | Continuation value |
|---|---|---|---|
| `mindvault_registry_list` | `list_page` | `start: 0` (or omit) | `next_cursor` from previous response |
| `mindvault_registry_tag_search` | `search_by_tag_prefix` | `cursor: 0` (or omit) | `nextCursor` from previous response |

### Limits

| Constant | Value | Source |
|---|---|---|
| `LIST_PAGE_CAP` | 20 | `contract/contracts/vault-registry/src/lib.rs` line 99 |
| `REGISTRY_LIST_MAX_LIMIT` | 20 | `mcp/src/registryPagination.ts` |
| `REGISTRY_LIST_DEFAULT_LIMIT` | 20 | `mcp/src/registryPagination.ts` |

The `limit` argument is clamped to `LIST_PAGE_CAP` (20) in the contract before
any storage is read. The MCP layer rejects `limit > 20` with a validation error
before the request reaches the contract. Requesting 25 entries does not return
20 silently — it fails immediately.

### End-of-list detection

`next_cursor` is `null` / `None` when the page is the last one. It is a
non-null integer when more slots may contain additional matching entries.

A cursor past the end of the catalog returns an empty page with
`next_cursor: null` — it does not error.

### Stability guarantee

The catalog index cursor is stable across filter changes between pages:

- A resource that is delisted after page 1 is returned is not re-visited on
  page 2.
- A resource registered between page 1 and page 2 at a slot above the cursor
  will be seen on a later page.
- A resource registered at a slot *below* the cursor is not seen on subsequent
  pages (it was already past the scan point).

This is correct for append-only catalog walks. The contract achieves it because
the cursor is a slot index, not a count of matches: if slot 7 is delisted and
the cursor is at slot 8, the scan simply does not revisit slot 7.

### Tag search specifics

`search_by_tag_prefix` (used by `mindvault_registry_tag_search`) also uses a
catalog index cursor, with two additional rules:

- An empty or whitespace-only prefix returns an empty page with
  `next_cursor: null`. The contract does this deliberately: an empty prefix
  would match every tag in the catalog, which is an unbounded read.
- `limit: 0` is clamped to 1 internally. This guarantees the scan always makes
  progress — a client following the returned cursor cannot get stuck on the same
  slot forever.
- Tombstoned resources are skipped: they appear in the global catalog index but
  are not returned by tag searches.
- The returned `nextCursor` is the index of the first catalog slot not yet
  scanned, which may be much higher than the number of matches returned (the
  scan walked over non-matching entries to find matches).

**Prefix normalization** follows the same rules as tag normalization: ASCII
whitespace is trimmed from both ends, and all ASCII letters are lowercased.
`"  DATA  "` resolves the same way as `"data"`.

### Concrete example — paginating the full catalog

```
# Page 1: start at slot 0
tool: mindvault_registry_list
args: { start: 0, limit: 20 }
response: { count: 20, nextCursor: 20, resources: [...] }

# Page 2: resume from slot 20
args: { start: 20, limit: 20 }
response: { count: 15, nextCursor: null, resources: [...] }
# nextCursor is null → end of catalog
```

### Concrete example — tag prefix search across pages

```
# Page 1: search prefix "dat", start scan at slot 0
tool: mindvault_registry_tag_search
args: { prefix: "dat", cursor: 0, limit: 5 }
response: { prefix: "dat", cursor: 0, count: 5, nextCursor: 18, resources: [...] }
# The scan walked slots 0-17 to collect 5 matches; slot 18 is next.

# Page 2: continue from slot 18
args: { prefix: "dat", cursor: 18, limit: 5 }
response: { count: 2, nextCursor: null, resources: [...] }
# End of catalog
```

---

## Id cursor (creator page)

### What it is

An `IdCursor` anchors to the last resource returned on a page by three
coordinates: its **position** in the creator's index, its **resource id**, and
the **creation ledger** at which it was registered. All three are needed to
resume correctly when entries are removed between pages.

The contract defines three variants internally:

| Variant | Meaning |
|---|---|
| `Start` | Beginning of the index — use for the first page |
| `After(position, id, created_at)` | Resume after a specific entry |
| `End` | Past the last entry — an additional call returns empty |

The MCP layer never exposes this internal shape. It wraps every `IdCursor` as
an opaque base64url token before returning it, and unwraps it before sending it
to the contract.

### Which tools use it

| MCP tool | Contract method | First-page value |
|---|---|---|
| `mindvault_registry_creator_page` | `list_by_creator_page_filtered` | omit `cursor` (defaults to `Start`) |

### Token format

The token is base64url-encoded JSON with this shape:

```json
{ "v": 1, "t": "s" }                             // Start
{ "v": 1, "t": "e" }                             // End
{ "v": 1, "t": "a", "p": 7, "i": "res-abc", "c": 12345 }  // After
```

| Field | Type | Meaning |
|---|---|---|
| `v` | integer | Token format version. Currently `1`. |
| `t` | `"s"` / `"e"` / `"a"` | Variant: start, end, after. |
| `p` | integer | Creator-index position of the last returned entry. |
| `i` | string | Resource id of the last returned entry. |
| `c` | integer | Creation ledger of the last returned entry. |

### Limits

| Constant | Value | Source |
|---|---|---|
| `LIST_PAGE_CAP` | 20 | `contract/contracts/vault-registry/src/lib.rs` line 99 |
| `REGISTRY_CURSOR_MAX_LENGTH` | 512 | `mcp/src/registryPagination.ts` |
| `REGISTRY_TAG_MAX_LENGTH` | 32 | `mcp/src/registryPagination.ts` |

A token longer than 512 bytes is rejected by the MCP validation layer. In
practice, the encoded JSON is well under 100 bytes.

### Token versioning

The token carries a version field (`v`). If the token format ever changes —
for example a new field is added or the encoding changes — `CURSOR_VERSION` is
bumped in `mcp/src/registryIdCursor.ts`. A token from an older version is
rejected with:

> Stale registry cursor. The cursor format changed since it was issued; start a new page.

A hand-edited or truncated token is rejected with:

> Invalid registry cursor. Cursors are opaque tokens returned by a previous call; start a new page instead of editing one.

Both errors are actionable: restart the page from the beginning (omit `cursor`).

### Resume logic and stability guarantees

The id cursor tolerates three types of mutation between pages without skipping
or repeating entries:

**Fast path — nothing changed:** if the entry at `position` in the creator
index still has the same id, resume at `position + 1`.

**Entries shifted left:** if one or more entries before the cursor were
tombstoned or transferred away (removing them from the creator index), the
vector shifts left. The contract scans for the entry with `id == last_id` and
resumes after it. No entries are skipped.

**Cursor entry removed:** if the entry the cursor points to was tombstoned or
transferred, its id is gone from the index. The contract falls back to
`created_at` and resumes at the first entry with a creation ledger strictly
greater than the cursor's. This correctly skips entries that were registered in
the same ledger as the removed entry and would otherwise be ambiguous.

**Same-ledger edge case:** if no entry has a later creation ledger (all
remaining entries were registered in the same ledger as the cursor), the
contract resumes at `min(position, total)`, which is the first valid slot.

Result: across any sequence of tombstones and transfers between pages, every
surviving entry appears exactly once and no entry is repeated.

### Filters (creator page)

`mindvault_registry_creator_page` accepts two optional filters:

| Argument | Type | Effect |
|---|---|---|
| `listed` | boolean | `true` = only `Listed` state; `false` = only non-listed states; omit = all |
| `state` | string | One of `Listed`, `Delisted`, `Frozen`, `Disputed`, `Tombstoned` |

The two filters combine with AND. A contradictory pair (`listed: true` with
`state: "Delisted"`) returns an empty page rather than an error. `state:
"Tombstoned"` always returns an empty page because tombstoned resources are
removed from the creator index by the contract before the filter runs.

The cursor returned by a filtered page is valid for a continuation call with
different filters, but the semantics change: the cursor records where in the
creator index the previous page stopped, not where it stopped in the filtered
result set. Changing filters mid-pagination is safe from a correctness
standpoint but may appear to skip entries.

### Concrete example — paginating a creator's resources

```
# Page 1: first page (omit cursor)
tool: mindvault_registry_creator_page
args: { creator: "GA6H...", limit: 3 }
response: {
  creator: "GA6H...",
  count: 3,
  nextCursor: "eyJ2IjoxLCJ0IjoiYSIsInAiOjIsImkiOiJyZXMtYyIsImMiOjg5fQ",
  resources: [{ id: "res-a" }, { id: "res-b" }, { id: "res-c" }]
}

# Page 2: pass the opaque token back unchanged
args: { creator: "GA6H...", cursor: "eyJ2IjoxLCJ0IjoiYSIsInAiOjIsImkiOiJyZXMtYyIsImMiOjg5fQ", limit: 3 }
response: {
  count: 1,
  nextCursor: null,
  resources: [{ id: "res-d" }]
}
# nextCursor is null → end of creator index
```

---

## Common mistakes

**Incrementing the cursor manually.** For the catalog index family, adding
`limit` to the previous `start` value is incorrect when the page contains fewer
than `limit` entries (a filter dropped entries) or when the catalog has gaps.
Always use the `nextCursor` value from the response.

**Parsing or editing the id-cursor token.** The token is opaque. Its contents
are an implementation detail. Parsing the base64url JSON and extracting the
position to pass as an integer does not work: the two cursor families are not
interchangeable.

**Treating `nextCursor: null` as an error.** A null cursor means end-of-list,
not a failure. An empty page with a null cursor is a valid terminal state.

**Reusing a cursor across different creators.** An id cursor records a position
in one specific creator's index. Passing it to a call with a different `creator`
argument produces undefined results.

---

## Limits quick-reference

| Constant | Value | Applies to |
|---|---|---|
| `LIST_PAGE_CAP` | 20 | Maximum entries per page (all listing methods) |
| `REGISTRY_LIST_MAX_LIMIT` | 20 | MCP validation ceiling for `limit` argument |
| `REGISTRY_CURSOR_MAX_LENGTH` | 512 bytes | Maximum id-cursor token length |
| `REGISTRY_TAG_MAX_LENGTH` | 32 chars | Maximum tag or prefix length |

---

## Related docs

- [`docs/mcp-tool-reference.md`](mcp-tool-reference.md) — full tool descriptions for `mindvault_registry_list`, `mindvault_registry_creator_page`, and `mindvault_registry_tag_search`
- [`docs/mcp-tool-arguments.md`](mcp-tool-arguments.md) — per-tool argument contracts
- [`contract/README.md`](../contract/README.md) — contract API reference, constants, and function signatures
- [`docs/registry-client-bindings.md`](registry-client-bindings.md) — TypeScript bindings for the registry client
