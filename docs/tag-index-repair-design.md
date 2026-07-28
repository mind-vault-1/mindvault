# ADR: Tag Index Repair Design

**Status:** Accepted — `list_by_tag`, `DataKey::TagIndex`, and
`repair_tag_index` shipped in this PR. The design constraints below were
written as a pre-ship ADR and have been validated by the 25 tag-discovery
tests in `src/test.rs`.

## Context

`vault-registry` stores discovery tags inline on each resource —
`Resource.tags: Vec<String>` — set at `register` and replaceable wholesale by
the creator via `set_tags`. There is currently no secondary index mapping a
tag to the resource ids that carry it, on-chain or off-chain:

- **On-chain**: the only derived (non-canonical) indexes today are the
  pagination pair (`DataKey::Count`/`DataKey::Index(u32)`, repaired by
  `repair_index` — see [`index-repair.md`](index-repair.md)) and the
  per-creator pair (`DataKey::CreatorResources`/`CreatorCount`, which backs
  `list_by_creator`/`creator_resource_count` and has no repair method of its
  own yet — flagged as a follow-up in index-repair.md's "What this does not
  solve"). Nothing derives a tag-keyed index.
- **Off-chain**: the server's `resources` table
  ([`server/src/db/schema.ts`](../server/src/db/schema.ts)) has no `tags`
  column at all. Tag-based filtering isn't possible through the API today;
  the only way to see a resource's tags is to read `Resource.tags` directly
  (via `get`/`list*`).

`set_tags` validates against `MAX_TAGS` (8) and `MAX_TAG_LEN` (32 bytes,
`validate_tags` in `src/lib.rs`) and emits a `settags` event carrying
`(prev_tags: Vec<String>, next_tags: Vec<String>)` — the full before/after
tag set, not a diff — so an off-chain listener can already reconstruct each
resource's current tag state purely from event replay, without needing to
call `get`. `validate_tags` is invoked from exactly two call sites —
`register` and `set_tags` — and nowhere in a read path (`get`, `list`,
`list_page`, `list_listed`, `list_by_creator`); tightening the limits in a
future contract version therefore cannot retroactively invalidate tags
already committed to storage. This is the "changed across contract versions"
concern the issue names, and it's addressed in
[Migration notes](#migration-notes-tag-rule-changes-across-contract-versions)
below.

If tag-based discovery (`list_by_tag`) becomes a product need, it will
require a derived index shaped like `DataKey::TagIndex(tag: String) ->
Vec<String>` (resource ids), built the same way `CreatorResources` already
is. That index is subject to exactly the same drift risk `index-repair.md`
documents for the pagination pair — a future migration, a code path writing
`Resource` without going through `register`/`set_tags`, or a bug in the
index-maintenance code could desync it from `Resource.tags`. This ADR
defines the repair contract now, before the index exists, so an eventual
implementation has no ambiguity about authority, inputs, or migration
behavior to resolve under pressure after a real drift incident.

## Decision

When a tag index ships, pair it with a single admin-gated repair method
following the exact shape `repair_index` already established:

```rust
pub fn repair_tag_index(env: Env, ids: Vec<String>) -> Result<(), Error>
```

- **Authorization**: admin-only, using the same admin as `repair_index` and
  `add_verifier`/`remove_verifier` (see
  [`architecture.md`](architecture.md#roles-admin-and-verifier)). Errors
  `AdminNotSet` if no admin has ever been set. Not verifier-accessible —
  repairing a derived index is a structural/integrity operation, not
  content-verification, and one call can touch tag entries spanning many
  creators, so it stays scoped to the same authority `repair_index` uses
  rather than the per-resource `creator` authority `set_tags` uses.
- **Input**: an explicit `Vec<String>` of resource ids to (re)index — the
  same shape `repair_index` takes, for the same reason (Soroban contracts
  cannot enumerate their own storage keys, so _which ids exist_ must always
  come from outside: event replay, the server's reconciliation report, or a
  `list`/`list_page` snapshot).
- **Key difference from `repair_index`**: the caller does **not** supply tag
  values. `Resource.tags` is already canonical on-chain data, so the repair
  reads each id's current tags directly from `Resource(id)` storage while
  rebuilding — it does not trust or accept externally supplied tag content.
  A tag index is a pure function of already-canonical on-chain state (`id ->
tags`); unlike the pagination index, the contract does not need to be told
  _what_ the correct tag associations are, only _which ids_ to refresh.
- **Validation**: every id must already exist as a `Resource` (`NotFound`
  otherwise), matching `repair_index`. Unlike `repair_index`,
  `repair_tag_index` does not need a `DuplicateInRepair`-style check: a
  pagination index is positional (a duplicate id would silently overwrite
  one slot with another, corrupting order), while a tag index has set
  semantics per tag (re-indexing the same id twice is idempotent, not
  corrupting) — so duplicate ids in the input are harmless and may be
  allowed rather than rejected.
- **Effect**: for each input id, remove it from the `TagIndex` entry of any
  tag it no longer carries, then ensure it is present in the `TagIndex`
  entry of every tag it currently carries. `Resource.tags` is read for its
  current value only — never written, never deleted — the same
  derived-vs-canonical boundary `repair_index` maintains for the pagination
  index.
- **Events**: a structured event (e.g. `("retagidx", ids.len())`) so
  operators and off-chain audit tooling can see when and how broad a repair
  ran, mirroring `repair_index`'s `reindex` event.

## Migration notes: tag rule changes across contract versions

- **Tightening `MAX_TAGS`/`MAX_TAG_LEN`** needs no migration step. Because
  `validate_tags` only runs on write (`register`, `set_tags`), resources
  written under a looser limit keep their tags exactly as stored. A
  `repair_tag_index` run after such a change must index whatever is actually
  in `Resource.tags`, even values that would be rejected if submitted fresh
  under the new limits — the repair implementation must not re-validate tags
  it reads, only the shape it's given as input (the id list itself). Getting
  this wrong would silently strand pre-existing resources out of tag-based
  discovery the moment limits tighten, which is exactly the kind of
  regression this ADR exists to head off.
- **Loosening `MAX_TAGS`/`MAX_TAG_LEN`** is fully backward compatible — no
  action needed; existing tags already satisfy the wider bounds.
- **Changing tag semantics** (e.g. introducing case-folding, or replacing
  freeform strings with a controlled taxonomy) is a _content_ migration, not
  an index repair, and is out of scope for `repair_tag_index` — the same
  boundary `index-repair.md` draws between rebuilding a derived pointer
  table and migrating canonical data. Any such change should bump
  `RESOURCE_SCHEMA_VERSION` (see its doc comment in `src/lib.rs`) so clients
  calling `registry_info()` can detect it, plus its own dedicated migration
  tooling — not something a generic tag-index repair should attempt.

## Why a tag index would be safe to rebuild

- **Self-healing from canonical data**: same argument as `repair_index`'s
  "No canonical data loss" — `repair_tag_index` never writes `Resource`, so
  a bad repair (wrong id subset) can always be corrected by re-running it.
- **No third source of truth needed**: reconstructing _which ids to repair_
  can come from either of the two sources `repair_index` already relies on
  (an authoritative id list, or full event replay of `register`/`settags` —
  validated empirically by
  `register_then_settags_events_reconstruct_current_tags` in `src/test.rs`,
  added alongside this ADR). A tag index does not need tag _content_ to be
  supplied externally at all, since that content is always already on-chain.
- **Bounded blast radius**: identical to `repair_index` — cannot register,
  delete, or mutate a resource's price, metadata, listing, ownership, or
  verification status. Its only power would be over the tag index.

## What this does not solve

- It does not detect drift automatically — same limitation `repair_index`
  has today. An operator (or off-chain audit tooling) still needs to notice
  a `TagIndex` entry disagreeing with `Resource.tags` and trigger a repair.
- It does not cover the still-unaddressed `CreatorResources`/`CreatorCount`
  repair gap `index-repair.md` already flags — that remains a separate,
  independent follow-up.

## Tests

`register_then_settags_events_reconstruct_current_tags` in
[`contract/contracts/vault-registry/src/test.rs`](../contract/contracts/vault-registry/src/test.rs)
registers several resources, mutates their tags through multiple `set_tags`
calls (including removing all tags and re-adding a different set), then
replays only the `register`/`settags` events — never calling `get` — to
reconstruct each resource's current tag set, and asserts the reconstruction
matches `Resource.tags` exactly. This is the empirical basis for this ADR's
"no third source of truth needed" claim.

The following additional tests were added alongside the implementation:

- `register_with_tags_builds_tag_index` — index populated at register time.
- `register_without_tags_leaves_tag_index_empty` — no phantom entries.
- `tag_normalization_lowercase_on_register` — tags stored and indexed in lowercase.
- `set_tags_updates_index_remove_and_add` — index stays in sync on replacement.
- `set_tags_empty_removes_from_all_indexes` — clearing tags removes all entries.
- `list_by_tag_returns_multiple_resources_in_order` — insertion-order preserved.
- `list_by_tag_pagination_start_offset` — `start` parameter works correctly.
- `list_by_tag_start_beyond_end_returns_empty` — no panic or NotFound.
- `list_by_tag_unknown_tag_returns_empty` — graceful empty return.
- `list_by_tag_limit_capped_at_20` — cap enforced silently.
- `duplicate_tags_in_register_indexed_once` — idempotent add.
- `set_tags_same_tag_twice_does_not_duplicate_in_index` — idempotent via set_tags.
- `repair_tag_index_rebuilds_from_resource_tags` — repair is a safe no-op on correct state.
- `repair_tag_index_rejects_unknown_id` — NotFound for unregistered ids.
- `repair_tag_index_before_admin_set_fails` — AdminNotSet guard.
- `repair_tag_index_duplicate_ids_are_idempotent` — duplicates silently de-duped.
- `repair_tag_index_emits_retagidx_event` — event carries id count.
- `tag_index_consistent_after_mixed_operations` — correctness after register + set_tags.
- `register_rejects_too_many_tags`, `empty_tag_rejected`, `tag_too_long_rejected`,
  `tag_at_max_len_accepted`, `exactly_max_tags_accepted` — boundary validation.
- `set_tags_normalizes_tags_and_event_carries_normalized_form` — event carries lowercase form.
- `list_by_tag_returns_full_resource_structs` — full Resource returned, not just ids.
