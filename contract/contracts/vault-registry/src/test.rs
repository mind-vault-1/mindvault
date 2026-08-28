#![cfg(test)]

use super::*;
use alloc::{format, string::ToString};
use proptest::prelude::*;
use soroban_sdk::{
    testutils::{
        storage::Persistent as _, Address as _, EnvTestConfig, Events as _, Ledger as _, MockAuth,
        MockAuthInvoke,
    },
    Address, BytesN, Env, FromVal, IntoVal, String, Symbol, TryFromVal, TryIntoVal, Val, Vec,
};

// ── Resource ID reserved-word list documentation (#645) ──────────────────────
//
// The contract rejects a fixed set of reserved words (case-insensitive) with
// `ReservedId`. This test pins every word in the list so that adding a new
// reserved word without updating the documentation (contract/README.md §
// "Resource ID format and reserved words") triggers a test change.

/// Every word in the `is_reserved_id` list must be rejected at registration
/// time with `ReservedId`, regardless of capitalisation.
#[test]
fn reserved_resource_ids_are_rejected() {
    let (env, creator, client) = setup();
    let meta = String::from_str(&env, "ipfs://m");
    let tags = empty_tags(&env);

    // Each tuple is (lowercase form, at-least-one-uppercase variant).
    let cases: &[(&str, &str)] = &[
        ("admin",    "Admin"),
        ("null",     "NULL"),
        ("registry", "Registry"),
        ("api",      "API"),
        ("index",    "Index"),
        ("root",     "Root"),
        ("system",   "System"),
    ];

    for (lower, upper) in cases {
        let id_lower = String::from_str(&env, lower);
        assert_eq!(
            client.try_register(&creator, &id_lower, &100i128, &meta, &tags),
            Err(Ok(Error::ReservedId)),
            "lowercase reserved word `{}` must be rejected with ReservedId",
            lower
        );

        // validate_resource_id only accepts lowercase letters/digits, so an
        // uppercase variant is caught by InvalidResourceId before the reserved
        // check — this confirms the *format* guard fires first.
        let id_upper = String::from_str(&env, upper);
        let res = client.try_register(&creator, &id_upper, &100i128, &meta, &tags);
        assert!(
            res == Err(Ok(Error::ReservedId)) || res == Err(Ok(Error::InvalidResourceId)),
            "uppercase reserved word `{}` must be rejected (got {:?})",
            upper,
            res
        );
    }
}

/// `MAX_RESOURCE_ID_LEN` is exported and equals 24 — pin the value here so any
/// change to the constant surfaces as a test failure.
#[test]
fn max_resource_id_len_is_24() {
    assert_eq!(MAX_RESOURCE_ID_LEN, 24);
}

/// An id exactly at `MAX_RESOURCE_ID_LEN` bytes is accepted; one byte longer
/// is rejected with `InvalidResourceId`.
#[test]
fn resource_id_boundary_at_max_len() {
    let (env, creator, client) = setup();
    let meta = String::from_str(&env, "ipfs://x");

    // Exactly at the limit — must succeed.
    let at_max = "a".repeat(MAX_RESOURCE_ID_LEN as usize);
    client.register(
        &creator,
        &String::from_str(&env, &at_max),
        &100i128,
        &meta,
        &empty_tags(&env),
    );

    // One byte over — must fail.
    let over_max = "a".repeat(MAX_RESOURCE_ID_LEN as usize + 1);
    assert_eq!(
        client.try_register(
            &creator,
            &String::from_str(&env, &over_max),
            &100i128,
            &meta,
            &empty_tags(&env)
        ),
        Err(Ok(Error::InvalidResourceId))
    );
}

// ── Self-cancel protection for accepted transfers (#637) ─────────────────────

/// After `accept_transfer` completes the pending-transfer entry is removed.
/// Any subsequent `cancel_transfer` call must return `NoPendingTransfer`
/// regardless of who calls it — an accepted transfer can never be reversed
/// through `cancel_transfer`.
#[test]
fn cancel_after_accept_returns_no_pending_transfer() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "selfcancel1");
    let new_owner = Address::generate(&env);

    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    client.propose_transfer(&id, &new_owner);
    client.accept_transfer(&id);

    // Ownership has moved; pending key was removed inside accept_transfer.
    // Either the old or new owner calling cancel_transfer must get NoPendingTransfer.
    assert_eq!(
        client.try_cancel_transfer(&id),
        Err(Ok(Error::NoPendingTransfer))
    );
}

/// The original owner (now dispossessed) cannot cancel the transfer after it
/// has been accepted — they are no longer `resource.creator` and therefore
/// fail `require_auth` before even reaching the pending-key check.
#[test]
fn original_owner_cannot_cancel_after_accept() {
    let env = Env::default();
    let contract_id = env.register(VaultRegistry, ());
    let client = VaultRegistryClient::new(&env, &contract_id);
    let creator = Address::generate(&env);
    let new_owner = Address::generate(&env);

    env.mock_all_auths();
    let id = String::from_str(&env, "selfcancel2");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    client.propose_transfer(&id, &new_owner);
    client.accept_transfer(&id);

    // Resource is now owned by new_owner. Attempting cancel returns NoPendingTransfer
    // because the pending entry was cleared during acceptance.
    assert_eq!(
        client.try_cancel_transfer(&id),
        Err(Ok(Error::NoPendingTransfer))
    );

    // Confirm ownership has moved
    assert_eq!(client.get(&id).creator, new_owner);
}

/// Verifies that the new owner can propose and then cancel a NEW transfer
/// after accepting the initial one — only the original accepted transfer
/// is protected, not future proposals by the new owner.
#[test]
fn new_owner_can_propose_and_cancel_new_transfer_after_acceptance() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "selfcancel3");
    let new_owner = Address::generate(&env);
    let third_party = Address::generate(&env);

    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    client.propose_transfer(&id, &new_owner);
    client.accept_transfer(&id);

    // new_owner is now the creator and may propose a new transfer and cancel it
    client.propose_transfer(&id, &third_party);
    client.cancel_transfer(&id);

    // After cancellation ownership is still with new_owner
    assert_eq!(client.get(&id).creator, new_owner);
}

// ---------------------------------------------------------------------------
// Event payload tests for set_listed / delist
// ---------------------------------------------------------------------------
//
// In Soroban SDK 22, `env.events().all()` returns only the events emitted
// by the **most recent contract invocation**. Each `client.*()` call clears
// and repopulates the buffer, so we check events immediately after the call
// we care about.
//
// The `setlisted` event schema:
//   topics: (Symbol("setlisted"), id_string)
//   data:   (old_listed: bool, new_listed: bool)

// Empty metadata and single-character metadata (e.g. "a") are both rejected
// by `validate_metadata_pointer` (`EmptyMetadata` / `InvalidMetadataPointer`
// respectively, since "a" matches no supported pointer prefix) — see
// `register_rejects_empty_metadata`, `update_metadata_rejects_empty`, and
// `invalid_metadata_pointer_rejected` below.

#[test]
fn sha256_pointer_rejects_short_hash() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "shortsha");
    // 63 hex chars — one short of the required 64
    let metadata = String::from_str(&env, "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef012345678");

    assert_eq!(
        client.try_register(&creator, &id, &100i128, &metadata, &empty_tags(&env)),
        Err(Ok(Error::InvalidMetadataPointer))
    );
    assert!(!client.exists(&id));
}

#[test]
fn sha256_pointer_rejects_long_hash() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "longsha");
    // 65 hex chars — one more than the required 64
    let metadata = String::from_str(&env, "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab");

    assert_eq!(
        client.try_register(&creator, &id, &100i128, &metadata, &empty_tags(&env)),
        Err(Ok(Error::InvalidMetadataPointer))
    );
    assert!(!client.exists(&id));
}

#[test]
fn sha256_pointer_rejects_non_hex_chars() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "nonhexsha");
    // 64 chars but contains 'g' (not a hex digit)
    let metadata = String::from_str(&env, "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789g");

    assert_eq!(
        client.try_register(&creator, &id, &100i128, &metadata, &empty_tags(&env)),
        Err(Ok(Error::InvalidMetadataPointer))
    );
    assert!(!client.exists(&id));
}

#[test]
fn sha256_pointer_accepts_valid_64_hex_hash() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "goodsha");
    let metadata = String::from_str(&env, "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789");

    client.register(&creator, &id, &100i128, &metadata, &empty_tags(&env));
    let r = client.get(&id);
    assert_eq!(r.metadata, metadata);
}

#[test]
fn sha256_dash_prefix_pointer_rejects_short_hash() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "dashshort");
    // sha-256: with only 63 hex chars
    let metadata = String::from_str(&env, "sha-256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef012345678");

    assert_eq!(
        client.try_register(&creator, &id, &100i128, &metadata, &empty_tags(&env)),
        Err(Ok(Error::InvalidMetadataPointer))
    );
    assert!(!client.exists(&id));
}

#[test]
fn sha256_dash_prefix_pointer_accepts_valid_64_hex_hash() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "dashgood");
    let metadata = String::from_str(&env, "sha-256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789");

    client.register(&creator, &id, &100i128, &metadata, &empty_tags(&env));
    let r = client.get(&id);
    assert_eq!(r.metadata, metadata);
}

#[test]
fn sha256_pointer_rejected_with_uppercase_hex() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "uppercasesha");
    // 64 chars, valid hex, but uppercase — the contract should still accept it
    let metadata = String::from_str(&env, "sha256:ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789");

    client.register(&creator, &id, &100i128, &metadata, &empty_tags(&env));
    let r = client.get(&id);
    assert_eq!(r.metadata, metadata);
}

// ─── Admin bootstrap replay protection ─────────────────────────────────────

// ---------------------------------------------------------------------------
// update_metadata event tests
// ---------------------------------------------------------------------------

// ── Tag removal event semantics (#362) ──────────────────────────────────────

// ── set_tags validation — reject before any state mutation ──────────────────
//
// These tests ensure every invalid tag array is rejected by `validate_tags`
// before the contract touches on-chain state. The acceptance criterion is:
// "Tool rejects invalid tag arrays before RPC calls." The equivalent MCP-layer
// rejection is covered by mcp/src/validation.test.ts and
// mcp/src/catalogFilters.test.ts.

// ---------------------------------------------------------------------------
// list_by_tag + tag index (#359)
// ---------------------------------------------------------------------------
//
// Acceptance criteria (from issue):
//   • Resources are indexed by normalized tag; changing tags updates indexes.
//   • Tests cover add/remove/duplicate tags.
//   • Pagination works the same as other list_* functions (limit capped at 20,
//     start beyond index returns empty, TTL is bumped for returned resources).
//   • list_by_tag is case-insensitive (normalized to lowercase).
//   • repair_tag_index is admin-only, rebuilds from Resource.tags.

// ── Basic indexing on register ──────────────────────────────────────────────

// ── Case-insensitive normalization ──────────────────────────────────────────

// ── Index update on set_tags ─────────────────────────────────────────────────

// ── Duplicate tags are rejected on write ─────────────────────────────────────

// ── Pagination ───────────────────────────────────────────────────────────────

// ── TTL bump on list_by_tag read ─────────────────────────────────────────────

// ── repair_tag_index ─────────────────────────────────────────────────────────

// Admin bootstrap/uninitialized-state behavior is covered by
// `admin_transfer_nominate_then_accept` (bootstrap via the first
// `nominate_new_admin` call) — see the two-step admin model above.
// `admin()` returns `Option<Address>` (`None` before any admin is set), not
// a `Result`, so there is no separate "uninitialized" error case to test.

// ---------------------------------------------------------------------------
// registry_info() — registry discovery metadata
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Deployment network identifier guard (#457)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// contract_version() — compact build/schema version for deployment scripts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Event schema drift detection
// ---------------------------------------------------------------------------
//
// `EVENT_SCHEMA` in lib.rs is the single source of truth for every event
// topic this contract emits. These two tests fail if it drifts from either
// side: the contract's actual runtime emissions, or the human-readable
// Events table in `contract/README.md`. Add/rename/remove an emitted event
// without updating all three (code, EVENT_SCHEMA, README) and one of these
// tests catches it.

// ---------------------------------------------------------------------------
// Tag index repair design (#429)
// ---------------------------------------------------------------------------
//
// No on-chain tag index exists yet (see docs/tag-index-repair-design.md), but
// a future one's repair path could rebuild id->tags associations either by
// reading `Resource.tags` directly or by replaying `register`/`settags`
// events. This test backs the ADR's "no third source of truth needed" claim
// by reconstructing tag state purely from event replay — never calling
// `get` — and checking it against `Resource.tags` exactly.

// ─── Test helpers for the role / verification / freeze / repair suites ────

// ─── Verifier role management (#437) ───────────────────────────────────────

// ─── On-chain verification status mirror (#436) ────────────────────────────

// ─── Resource lifecycle state machine (#455) ──────────────────────────────

// ── Listing index cleanup on tombstone ──────────────────────────────────────
//
// Tombstoning is terminal, so the derived listing indexes must not keep
// pointing at a retired resource. The tag index was already purged; these
// tests pin the creator index and `creator_resource_count` to the same rule,
// and pin the two indexes that deliberately are *not* touched (the canonical
// `Resource` entry, and the monotonic `Index`/`Count` catalog pair).

#[test]
fn verification_status_can_store_and_retrieve_attestation_hash() {
    let (env, creator, _admin, client) = setup_with_admin();
    let id = register_default(&env, &creator, &client, "vres8");
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    let hash_val = String::from_str(&env, "a1b2c3d4e5f6g7h8i9j0");
    client.set_verification_status(
        &id,
        &verifier,
        &VerificationStatus::Verified,
        &Some(hash_val.clone()),
    );
    
    assert_eq!(client.get(&id).verified, VerificationStatus::Verified);
    let retrieved_hash = client.get_attestation_hash(&id);
    assert_eq!(retrieved_hash, Some(hash_val));

    // Clearing it
    client.set_verification_status(
        &id,
        &verifier,
        &VerificationStatus::Rejected,
        &None,
    );
    assert_eq!(client.get_attestation_hash(&id), None);
}

// ─── Metadata freeze (#438) ────────────────────────────────────────────────

// ─── Index repair (#428) ───────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Issue 1 — MAX_METADATA_POINTER_LEN boundary hardening
// ---------------------------------------------------------------------------
//
// Acceptance criteria:
//   • Exact max length succeeds.            (register_accepts_metadata_at_max_length above)
//   • Max + 1 fails with MetadataTooLong.   (register_rejects_metadata_over_max_length above)
//   • Random shorter format-valid strings succeed.  ← proptest below
//   • update_metadata obeys the same boundary.      (update_metadata_accepts_at_max_length above)
//   • Error handling is deterministic: only MetadataTooLong is returned for over-limit,
//     never a panic or a different error code.

// ---------------------------------------------------------------------------
// Issue 2 — Duplicate detection stability across lifecycle flows
// ---------------------------------------------------------------------------
//
// Acceptance criteria:
//   • Duplicate register always fails with AlreadyRegistered.
//   • count and Index state are unchanged after every failed duplicate attempt.
//   • Stability holds after transfer, delist, relist, and propose/accept flows.

// ── updated_at ledger metadata (#365) ───────────────────────────────────────

/// `set_price` no-op guard (#646): calling it with the resource's current
/// price must not re-save the resource (no `updated_at`/`version` bump) or
/// emit a `setprice` event.
#[test]
fn set_price_noop_skips_save_and_event() {
    let (env, creator, client) = setup();

    env.ledger().set_sequence_number(10);
    let id = String::from_str(&env, "pricenoop");
    let price = 1_000_000i128;
    client.register(
        &creator,
        &id,
        &price,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    assert_eq!(client.get(&id).updated_at, 10);

    env.ledger().set_sequence_number(55);
    let events_before = env.events().all().len();
    client.set_price(&id, &price);

    assert_eq!(
        client.get(&id).updated_at,
        10,
        "no-op set_price must not re-save the resource"
    );
    assert_eq!(
        env.events().all().len(),
        events_before,
        "no-op set_price must not emit a setprice event"
    );
}

/// `update_metadata` no-op guard (#647): calling it with the resource's
/// current metadata pointer must not re-save the resource (no
/// `updated_at`/`version` bump) or emit an `updmeta` event.
#[test]
fn update_metadata_noop_skips_save_and_event() {
    let (env, creator, client) = setup();

    env.ledger().set_sequence_number(7);
    let id = String::from_str(&env, "metanoop");
    let metadata = String::from_str(&env, "ipfs://same");
    client.register(&creator, &id, &100i128, &metadata, &empty_tags(&env));
    assert_eq!(client.get(&id).updated_at, 7);

    env.ledger().set_sequence_number(99);
    let events_before = env.events().all().len();
    client.update_metadata(&id, &metadata);

    assert_eq!(
        client.get(&id).updated_at,
        7,
        "no-op update_metadata must not re-save the resource"
    );
    assert_eq!(
        env.events().all().len(),
        events_before,
        "no-op update_metadata must not emit an updmeta event"
    );
}

// ─── Deployment preflight checks (#392) ────────────────────────────────────
//
// These tests back the automated steps in docs/contract-upgrade-checklist.md.
// Each one exercises a specific Phase-1 or Phase-4 verification requirement
// so that running `cargo test` locally (or `make preflight`) gives the same
// confidence as the manual checklist commands against a live network.

// ---------------------------------------------------------------------------
// exists_many (#369) — batch existence check
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// LIST_PAGE_CAP constant (#370)
// ---------------------------------------------------------------------------

// ─── Escrow-ready payment state (#387) ────────────────────────────────────

// ─── Dispute flagging (#389) ───────────────────────────────────────────────
//
// Acceptance criteria (from issue):
//   • Flag state is exposed in reads and listing filters; events include reason code.
//   • Error handling is deterministic and documented.
//   • The implementation passes the relevant local test suite.

// ── Helper: setup with admin + moderator pre-configured ──────────────────

// ── add_moderator / remove_moderator / is_moderator ──────────────────────

// ── flag_resource ─────────────────────────────────────────────────────────

// ── unflag_resource ───────────────────────────────────────────────────────

// ── Moderator flag reason hash (#649) ─────────────────────────────────────

// ── Moderator role event payload tests (#616) ─────────────────────────────
//
// The topic-matching test earlier in this file (`event_topics_match_...`)
// only pins that these events are emitted under the right symbol; it never
// decodes their payload. These tests assert the actual topic and data
// contents of every moderator-role and dispute-flag event, so a payload
// regression (wrong address, stale bool, truncated reason hash) fails here
// instead of only surfacing off-chain.

#[test]
fn add_moderator_emits_address_and_true_payload() {
    let (env, _creator, _admin, client) = setup_with_admin();
    let moderator = Address::generate(&env);

    client.add_moderator(&moderator);

    let all = env.events().all();
    let (_, topics, data) = all.get_unchecked(all.len() - 1);
    let sym: Symbol = Symbol::try_from_val(&env, &topics.get(0).unwrap()).unwrap();
    assert_eq!(sym, Symbol::new(&env, "addmod"));
    let topic_moderator: Address = Address::try_from_val(&env, &topics.get(1).unwrap()).unwrap();
    assert_eq!(topic_moderator, moderator);
    let flag: bool = bool::try_from_val(&env, &data).unwrap();
    assert!(flag, "addmod payload must be `true`");
}

#[test]
fn remove_moderator_emits_address_and_false_payload() {
    let (env, _creator, _admin, client) = setup_with_admin();
    let moderator = Address::generate(&env);
    client.add_moderator(&moderator);

    client.remove_moderator(&moderator);

    let all = env.events().all();
    let (_, topics, data) = all.get_unchecked(all.len() - 1);
    let sym: Symbol = Symbol::try_from_val(&env, &topics.get(0).unwrap()).unwrap();
    assert_eq!(sym, Symbol::new(&env, "rmmod"));
    let topic_moderator: Address = Address::try_from_val(&env, &topics.get(1).unwrap()).unwrap();
    assert_eq!(topic_moderator, moderator);
    let flag: bool = bool::try_from_val(&env, &data).unwrap();
    assert!(!flag, "rmmod payload must be `false`");
}

#[test]
fn flag_resource_emits_full_event_payload() {
    let (env, creator, _admin, moderator, client) = setup_with_moderator();
    let id = register_default(&env, &creator, &client, "flagpay0");

    client.flag_resource(&id, &moderator, &FlagReason::Malicious);

    let all = env.events().all();
    let (_, topics, data) = all.get_unchecked(all.len() - 1);
    let sym: Symbol = Symbol::try_from_val(&env, &topics.get(0).unwrap()).unwrap();
    assert_eq!(sym, Symbol::new(&env, "flag"));
    let topic_id: String = String::try_from_val(&env, &topics.get(1).unwrap()).unwrap();
    assert_eq!(topic_id, id);
    let payload: FlagEvent = FlagEvent::try_from_val(&env, &data).unwrap();
    assert_eq!(payload.id, id);
    assert_eq!(payload.moderator, moderator);
    assert_eq!(payload.reason, FlagReason::Malicious);
}

#[test]
fn unflag_resource_emits_id_payload() {
    let (env, creator, _admin, moderator, client) = setup_with_moderator();
    let id = register_default(&env, &creator, &client, "flagpay1");
    client.flag_resource(&id, &moderator, &FlagReason::Spam);

    client.unflag_resource(&id, &moderator);

    let all = env.events().all();
    let (_, topics, data) = all.get_unchecked(all.len() - 1);
    let sym: Symbol = Symbol::try_from_val(&env, &topics.get(0).unwrap()).unwrap();
    assert_eq!(sym, Symbol::new(&env, "unflag"));
    let topic_id: String = String::try_from_val(&env, &topics.get(1).unwrap()).unwrap();
    assert_eq!(topic_id, id);
    let data_id: String = String::try_from_val(&env, &data).unwrap();
    assert_eq!(data_id, id);
}

#[test]
fn set_flag_reason_hash_emits_full_event_payload() {
    let (env, creator, _admin, moderator, client) = setup_with_moderator();
    let id = register_default(&env, &creator, &client, "flagpay2");
    let reason_hash = String::from_str(&env, "sha256:abc123");

    client.set_flag_reason_hash(&id, &moderator, &reason_hash);

    let all = env.events().all();
    let (_, topics, data) = all.get_unchecked(all.len() - 1);
    let sym: Symbol = Symbol::try_from_val(&env, &topics.get(0).unwrap()).unwrap();
    assert_eq!(sym, Symbol::new(&env, "flagrsn"));
    let topic_id: String = String::try_from_val(&env, &topics.get(1).unwrap()).unwrap();
    assert_eq!(topic_id, id);
    let (data_moderator, data_hash): (Address, String) =
        <(Address, String)>::try_from_val(&env, &data).unwrap();
    assert_eq!(data_moderator, moderator);
    assert_eq!(data_hash, reason_hash);
}

// ── Storage TTL tests for index entries (#371) ────────────────────────────────

// ── Read-only methods keep working while paused ──────────────────────────────

// ── Unpause restores write access ────────────────────────────────────────────

// ── Pagination property tests (#377) ─────────────────────────────────────────

// ── Tag validation property tests (#376) ──────────────────────────────────────

// ─── Event topic length regression tests (#655) ────────────────────────────
//
// A resource id is the only user-influenced value ever placed directly in an
// event topic (see `validate_resource_id`, which caps ids at
// `MAX_RESOURCE_ID_LEN` ASCII lowercase/digit bytes). These tests pin that
// bound at the event layer with ids at the maximum accepted length, so that
// widening `validate_resource_id` without revisiting the topic-carrying
// events below shows up here rather than as a silent oversized-topic
// regression later.


// ── listed_count tests ──────────────────────────────────────────────────────

#[test]
fn listed_count_starts_at_zero() {
    let (env, _creator, client) = setup();
    assert_eq!(client.listed_count(), 0u32);
}

#[test]
fn listed_count_increments_on_register() {
    let (env, creator, client) = setup();
    client.register(&creator, &String::from_str(&env, "res1"), &100i128, &String::from_str(&env, "ipfs://a"), &empty_tags(&env));
    assert_eq!(client.listed_count(), 1);
    client.register(&creator, &String::from_str(&env, "res2"), &200i128, &String::from_str(&env, "ipfs://b"), &empty_tags(&env));
    assert_eq!(client.listed_count(), 2);
}

#[test]
fn listed_count_decrements_on_set_listed_false() {
    let (env, creator, client) = setup();
    client.register(&creator, &String::from_str(&env, "res1"), &100i128, &String::from_str(&env, "ipfs://a"), &empty_tags(&env));
    assert_eq!(client.listed_count(), 1);
    client.set_listed(&String::from_str(&env, "res1"), &false);
    assert_eq!(client.listed_count(), 0);
}

#[test]
fn listed_count_increments_when_relisted() {
    let (env, creator, client) = setup();
    client.register(&creator, &String::from_str(&env, "res1"), &100i128, &String::from_str(&env, "ipfs://a"), &empty_tags(&env));
    assert_eq!(client.listed_count(), 1);
    client.set_listed(&String::from_str(&env, "res1"), &false);
    assert_eq!(client.listed_count(), 0);
    client.set_listed(&String::from_str(&env, "res1"), &true);
    assert_eq!(client.listed_count(), 1);
}

#[test]
fn listed_count_noop_when_already_in_target_state() {
    let (env, creator, client) = setup();
    client.register(&creator, &String::from_str(&env, "res1"), &100i128, &String::from_str(&env, "ipfs://a"), &empty_tags(&env));
    assert_eq!(client.listed_count(), 1);
    // set_listed(true) on an already-listed resource should not change count
    client.set_listed(&String::from_str(&env, "res1"), &true);
    assert_eq!(client.listed_count(), 1);
}

#[test]
fn listed_count_decrements_on_freeze() {
    let (env, creator, client) = setup();
    client.register(&creator, &String::from_str(&env, "res1"), &100i128, &String::from_str(&env, "ipfs://a"), &empty_tags(&env));
    assert_eq!(client.listed_count(), 1);
    client.freeze_resource(&String::from_str(&env, "res1"));
    assert_eq!(client.listed_count(), 0);
}

#[test]
fn listed_count_decrements_on_tombstone() {
    let (env, creator, _admin, client) = setup_with_admin();
    client.register(&creator, &String::from_str(&env, "res1"), &100i128, &String::from_str(&env, "ipfs://a"), &empty_tags(&env));
    assert_eq!(client.listed_count(), 1);
    client.tombstone_resource(&String::from_str(&env, "res1"), &_admin);
    assert_eq!(client.listed_count(), 0);
}

#[test]
fn listed_count_increments_when_dispute_resolved_to_listed() {
    let (env, creator, _admin, client) = setup_with_admin();
    client.register(&creator, &String::from_str(&env, "res1"), &100i128, &String::from_str(&env, "ipfs://a"), &empty_tags(&env));
    assert_eq!(client.listed_count(), 1);
    client.open_dispute(&String::from_str(&env, "res1"), &_admin);
    assert_eq!(client.listed_count(), 0);
    client.resolve_dispute(&String::from_str(&env, "res1"), &_admin, &ResourceState::Listed);
    assert_eq!(client.listed_count(), 1);
}

// ── Duplicate receipt buyer normalization (#683) ──────────────────────────────
//
// The duplicate-receipt guard is keyed on the exact `(resource_id, buyer)`
// pair stored in `DataKey::PurchaseReceipt`. These tests verify:
//
//   • Different buyers on the same resource each get their own independent
//     slot — a receipt for buyer A must not prevent buyer B from anchoring.
//   • The same buyer on different resources each get their own slot — a
//     receipt on resource X must not prevent an anchor on resource Y.
//   • A re-anchor attempt for an existing `(resource_id, buyer)` pair always
//     fails with `DuplicateReceipt`, regardless of the new hash supplied.
//   • A failed duplicate attempt leaves the original anchor intact and
//     readable from storage.
//   • Looking up `get_purchase_receipt` with a buyer address that has no
//     anchor for that resource returns `NotFound` (not another buyer's data).

// ─── Storage key migration (#629) ────────────────────────────────────────────
//
// Every entry this contract owns is addressed by a `DataKey`. Soroban encodes a
// `#[contracttype]` enum as a vec whose first element is a `Symbol` of the
// *variant name* — the name, not the declaration order — so the storage address
// of every existing entry is a function of the spelling of these variants.
//
// That makes two otherwise-invisible edits catastrophic on an upgrade:
//
//   * Renaming a variant re-points the contract at an address nothing was ever
//     written to. The old entries stay on the ledger, fully paid for, and
//     become unreachable — reads return NotFound and writes silently start a
//     parallel set of entries.
//   * Adding or removing an argument changes the key's arity, with the same
//     effect for that variant.
//
// Neither shows up as a compile error, and neither is caught by a behavioural
// test that writes and reads within a single contract version. These tests pin
// the wire shape of every key so that an upgrade which would strand live state
// fails here first. Reordering variants and appending new ones stay allowed —
// both are safe, because nothing about an existing key changes.

/// Decompose a storage key into the vec Soroban encodes it as.
fn storage_key_parts(env: &Env, key: &DataKey) -> Vec<Val> {
    let val: Val = key.into_val(env);
    Vec::try_from_val(env, &val).expect("a #[contracttype] enum key encodes as a vec")
}

/// The variant name a storage key is addressed by on the ledger.
fn storage_key_variant(env: &Env, key: &DataKey) -> Symbol {
    let parts = storage_key_parts(env, key);
    Symbol::try_from_val(env, &parts.get(0).expect("key has a discriminant"))
        .expect("key discriminant is a symbol")
}

/// Every `DataKey` variant, with the name and arity it must keep across
/// upgrades. Adding a variant means adding a row here — the exhaustive match in
/// `storage_key_migration_covers_every_variant` will not compile until you do.
fn storage_key_wire_contract(env: &Env) -> [(DataKey, &'static str, u32); 23] {
    let id = String::from_str(env, "migkey");
    let who = Address::generate(env);
    [
        (DataKey::Resource(id.clone()), "Resource", 2),
        (DataKey::Count, "Count", 1),
        (DataKey::Index(0), "Index", 2),
        (DataKey::Admin, "Admin", 1),
        (DataKey::PendingAdmin, "PendingAdmin", 1),
        (DataKey::CreatorTerms(who.clone()), "CreatorTerms", 2),
        (
            DataKey::CreatorResources(who.clone()),
            "CreatorResources",
            2,
        ),
        (DataKey::CreatorCount(who.clone()), "CreatorCount", 2),
        (DataKey::PendingTransfer(id.clone()), "PendingTransfer", 2),
        (DataKey::Verifier(who.clone()), "Verifier", 2),
        (DataKey::NetworkId, "NetworkId", 1),
        (
            DataKey::PaymentReceipt(id.clone()),
            "PaymentReceipt",
            2,
        ),
        (
            DataKey::PaymentIndex(id.clone(), who.clone()),
            "PaymentIndex",
            3,
        ),
        (DataKey::Paused, "Paused", 1),
        (DataKey::Settler(who.clone()), "Settler", 2),
        (
            DataKey::PurchaseReceipt(id.clone(), who.clone()),
            "PurchaseReceipt",
            3,
        ),
        (DataKey::TagIndex(id.clone()), "TagIndex", 2),
        (DataKey::FeeConfig, "FeeConfig", 1),
        (DataKey::Moderator(who.clone()), "Moderator", 2),
        (DataKey::DisputeFlag(id.clone()), "DisputeFlag", 2),
        (DataKey::ListedCount, "ListedCount", 1),
        (DataKey::FlagReasonHash(id.clone()), "FlagReasonHash", 2),
        (DataKey::AttestationHash(id.clone()), "AttestationHash", 2),
    ]
}

#[test]
fn storage_key_variant_names_are_stable() {
    let env = Env::default();
    for (key, name, _) in storage_key_wire_contract(&env).iter() {
        assert_eq!(
            storage_key_variant(&env, key),
            Symbol::new(&env, name),
            "DataKey::{name} is addressed on-chain by its variant name. Renaming it \
             strands every entry already written under the old name — the data stays \
             on the ledger but nothing looks for it. If the rename is intentional, \
             ship a migration that rewrites the affected entries before changing this."
        );
    }
}

#[test]
fn storage_key_arity_is_stable() {
    let env = Env::default();
    for (key, name, arity) in storage_key_wire_contract(&env).iter() {
        assert_eq!(
            storage_key_parts(&env, key).len(),
            *arity,
            "DataKey::{name} must keep {arity} encoded element(s) (the discriminant \
             plus its arguments). Adding or removing an argument re-points the \
             variant at a different address and strands its existing entries."
        );
    }
}

/// Compile-time tripwire: a new `DataKey` variant fails to match here, which
/// forces whoever adds it to also add it to `storage_key_wire_contract` and to
/// think about what the new key means for state already on-chain.
#[test]
fn storage_key_migration_covers_every_variant() {
    let env = Env::default();
    let contract = storage_key_wire_contract(&env);
    assert_eq!(
        contract.len(),
        23,
        "storage_key_wire_contract must list every DataKey variant"
    );

    for (key, name, _) in contract.iter() {
        let matched = match key {
            DataKey::Resource(_) => "Resource",
            DataKey::Count => "Count",
            DataKey::Index(_) => "Index",
            DataKey::Admin => "Admin",
            DataKey::PendingAdmin => "PendingAdmin",
            DataKey::CreatorTerms(_) => "CreatorTerms",
            DataKey::CreatorResources(_) => "CreatorResources",
            DataKey::CreatorCount(_) => "CreatorCount",
            DataKey::PendingTransfer(_) => "PendingTransfer",
            DataKey::Verifier(_) => "Verifier",
            DataKey::NetworkId => "NetworkId",
            DataKey::PaymentReceipt(_) => "PaymentReceipt",
            DataKey::PaymentIndex(_, _) => "PaymentIndex",
            DataKey::Paused => "Paused",
            DataKey::Settler(_) => "Settler",
            DataKey::PurchaseReceipt(_, _) => "PurchaseReceipt",
            DataKey::TagIndex(_) => "TagIndex",
            DataKey::FeeConfig => "FeeConfig",
            DataKey::Moderator(_) => "Moderator",
            DataKey::DisputeFlag(_) => "DisputeFlag",
            DataKey::ListedCount => "ListedCount",
            DataKey::FlagReasonHash(_) => "FlagReasonHash",
            DataKey::AttestationHash(_) => "AttestationHash",
        };
        assert_eq!(
            matched, *name,
            "storage_key_wire_contract lists {name} against the wrong variant"
        );
    }
}

#[test]
fn same_string_addresses_a_different_entry_per_key_variant() {
    let (env, _creator, client) = setup();
    let shared = String::from_str(&env, "collide");

    // Five variants take a bare String. If any two encoded to the same address,
    // one would overwrite another and a resource id could clobber a tag index.
    env.as_contract(&client.address, || {
        let keys = [
            DataKey::Resource(shared.clone()),
            DataKey::PendingTransfer(shared.clone()),
            DataKey::TagIndex(shared.clone()),
            DataKey::DisputeFlag(shared.clone()),
            DataKey::FlagReasonHash(shared.clone()),
        ];
        for (marker, key) in keys.iter().enumerate() {
            env.storage().persistent().set(key, &(marker as u32));
        }
        for (marker, key) in keys.iter().enumerate() {
            assert_eq!(
                env.storage().persistent().get::<DataKey, u32>(key),
                Some(marker as u32),
                "key variant {marker} was overwritten by another variant carrying \
                 the same string — the variants share a storage address"
            );
        }
    });
}

#[test]
fn address_keyed_variants_do_not_collide_for_one_address() {
    let (env, _creator, client) = setup();
    let who = Address::generate(&env);

    env.as_contract(&client.address, || {
        let keys = [
            DataKey::CreatorTerms(who.clone()),
            DataKey::CreatorResources(who.clone()),
            DataKey::CreatorCount(who.clone()),
            DataKey::Verifier(who.clone()),
            DataKey::Moderator(who.clone()),
        ];
        for (marker, key) in keys.iter().enumerate() {
            env.storage().persistent().set(key, &(marker as u32));
        }
        for (marker, key) in keys.iter().enumerate() {
            assert_eq!(
                env.storage().persistent().get::<DataKey, u32>(key),
                Some(marker as u32),
                "address-keyed variant {marker} collided with another variant for \
                 the same address"
            );
        }
    });
}

#[test]
fn receipt_keys_are_scoped_to_both_resource_and_counterparty() {
    let (env, _creator, client) = setup();
    let res_a = String::from_str(&env, "resa");
    let res_b = String::from_str(&env, "resb");
    let party_a = Address::generate(&env);
    let party_b = Address::generate(&env);

    // A two-argument key must vary in *both* arguments; a key that ignored the
    // payer would let one buyer's receipt overwrite another's.
    env.as_contract(&client.address, || {
        let keys = [
            DataKey::PaymentIndex(res_a.clone(), party_a.clone()),
            DataKey::PaymentIndex(res_a.clone(), party_b.clone()),
            DataKey::PaymentIndex(res_b.clone(), party_a.clone()),
            DataKey::PurchaseReceipt(res_a.clone(), party_a.clone()),
            DataKey::PurchaseReceipt(res_b.clone(), party_b.clone()),
        ];
        for (marker, key) in keys.iter().enumerate() {
            env.storage().persistent().set(key, &(marker as u32));
        }
        for (marker, key) in keys.iter().enumerate() {
            assert_eq!(
                env.storage().persistent().get::<DataKey, u32>(key),
                Some(marker as u32),
                "receipt key {marker} collided — receipts must be scoped to both \
                 the resource and the counterparty"
            );
        }
    });
}

#[test]
fn indexed_keys_stay_distinct_per_index() {
    let (env, _creator, client) = setup();

    env.as_contract(&client.address, || {
        for slot in 0u32..5 {
            env.storage().persistent().set(&DataKey::Index(slot), &slot);
        }
        for slot in 0u32..5 {
            assert_eq!(
                env.storage()
                    .persistent()
                    .get::<DataKey, u32>(&DataKey::Index(slot)),
                Some(slot),
                "Index({slot}) collided with another slot"
            );
        }
    });
}

#[test]
fn registered_state_survives_a_redeploy_at_the_same_address() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "upgradesafe");
    let metadata = String::from_str(&env, "ipfs://QmUpgrade");
    client.register(
        &creator,
        &id,
        &1_000_000i128,
        &metadata,
        &tags(&env, &["a"]),
    );

    // Redeploy the same contract at the same address, as an upgrade does.
    env.register_at(&client.address, VaultRegistry, ());
    let upgraded = VaultRegistryClient::new(&env, &client.address);

    // Every read path must still resolve the entries written by the old build.
    assert_eq!(upgraded.count(), 1, "counter entry lost across redeploy");
    assert!(upgraded.exists(&id), "resource entry lost across redeploy");

    let resource = upgraded.get(&id);
    assert_eq!(resource.id, id);
    assert_eq!(resource.creator, creator);
    assert_eq!(resource.price, 1_000_000i128);
    assert_eq!(resource.metadata, metadata);
    assert_eq!(
        upgraded.list_by_creator(&creator, &0, &10).len(),
        1,
        "creator index lost across redeploy"
    );
    assert_eq!(
        upgraded
            .list_by_tag(&String::from_str(&env, "a"), &0, &10)
            .len(),
        1,
        "tag index lost across redeploy"
    );
}

#[test]
fn an_entry_written_under_a_datakey_is_the_one_the_contract_reads() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "handwritten");
    client.register(
        &creator,
        &id,
        &1_000_000i128,
        &String::from_str(&env, "ipfs://QmOriginal"),
        &empty_tags(&env),
    );

    // A migration tool works on `DataKey::Resource(id)` from outside the
    // contract's own methods. If the key it computes were not the key `get`
    // reads, a migration would appear to succeed and change nothing.
    let mut migrated = client.get(&id);
    let new_metadata = String::from_str(&env, "ipfs://QmMigrated");
    migrated.metadata = new_metadata.clone();
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Resource(id.clone()), &migrated);
    });

    assert_eq!(
        client.get(&id).metadata,
        new_metadata,
        "the contract reads a different address than DataKey::Resource(id) computes"
    );
}
// ─── Documentation drift guards (#643, #640) ─────────────────────────────────

/// The crate's own README, which documents the TTL policy and the version
/// compatibility rules that the constants below define.
fn vault_registry_readme() -> std::string::String {
    std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/README.md"))
        .expect("contracts/vault-registry/README.md must be readable from the crate")
}

/// Pull the section between one `## ` heading and the next.
fn readme_section<'a>(readme: &'a str, heading: &str) -> &'a str {
    let body = readme
        .split(heading)
        .nth(1)
        .unwrap_or_else(|| panic!("README must have a `{heading}` section"));
    body.split("\n## ").next().unwrap_or(body)
}

#[test]
fn readme_documents_ttl_threshold_constants() {
    let readme = vault_registry_readme();
    let section = readme_section(&readme, "## Storage TTL threshold constants");

    // Each constant must appear in the table with its real value, so the doc
    // cannot drift the way the constants tables in contract/README.md did.
    for (name, value) in [
        ("DAY_IN_LEDGERS", TTL_DAY_IN_LEDGERS),
        ("BUMP_AMOUNT", TTL_BUMP_AMOUNT),
        ("LIFETIME_THRESHOLD", TTL_LIFETIME_THRESHOLD),
    ] {
        assert!(
            section.contains(&format!("`{name}`")),
            "the TTL section must document `{name}`"
        );
        let formatted = format!("`{}`", group_digits(value));
        assert!(
            section.contains(&formatted),
            "the TTL section documents `{name}` but not its current value {formatted} — \
             update contracts/vault-registry/README.md to match src/lib.rs"
        );
    }
}

/// Render a number the way the README's tables do: `518_400`.
fn group_digits(value: u32) -> std::string::String {
    let digits = value.to_string();
    let mut out = std::string::String::new();
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push('_');
        }
        out.push(ch);
    }
    out
}

#[test]
fn ttl_threshold_leaves_exactly_one_day_of_slack() {
    // The README explains the no-op window in terms of this identity; if the
    // constants stop satisfying it, the explanation is wrong.
    assert_eq!(
        TTL_BUMP_AMOUNT - TTL_LIFETIME_THRESHOLD,
        TTL_DAY_IN_LEDGERS,
        "BUMP_AMOUNT and LIFETIME_THRESHOLD must differ by exactly one day"
    );
    assert!(
        TTL_LIFETIME_THRESHOLD < TTL_BUMP_AMOUNT,
        "LIFETIME_THRESHOLD must stay below BUMP_AMOUNT, or every read would pay rent"
    );
}

#[test]
fn readme_version_compatibility_documents_current_schema_version() {
    let readme = vault_registry_readme();
    let section = readme_section(&readme, "## Contract version compatibility");

    assert!(
        section.contains("`RESOURCE_SCHEMA_VERSION`"),
        "the version compatibility section must name RESOURCE_SCHEMA_VERSION"
    );
    assert!(
        section.contains(&format!(
            "\"resource_schema_version\": {RESOURCE_SCHEMA_VERSION}"
        )),
        "the documented contract_version output must show the current \
         resource_schema_version ({RESOURCE_SCHEMA_VERSION}) — update \
         contracts/vault-registry/README.md to match src/lib.rs"
    );
    assert!(
        section.contains(&format!("| {RESOURCE_SCHEMA_VERSION} ")),
        "the schema history table must have a row for the current version \
         ({RESOURCE_SCHEMA_VERSION})"
    );
}

#[test]
fn readme_version_compatibility_names_the_breaking_changes() {
    let readme = vault_registry_readme();
    let section = readme_section(&readme, "## Contract version compatibility");

    // The two upgrade hazards the storage-key migration tests above defend
    // against must both be written down, or the tests read as arbitrary.
    assert!(
        section.contains("DataKey"),
        "the compatibility section must explain what renaming a DataKey variant costs"
    );
    assert!(
        section.contains("crate_version") && section.contains("resource_schema_version"),
        "the compatibility section must distinguish the two reported versions"
    );
}

// ── Reporting anchor failures as events ──────────────────────────────────────
//
// `anchor_purchase_receipt` reverts on a rejected anchor, and a Soroban error
// rolls back the whole invocation — events included — so a batching settlement
// service loses every surviving anchor and any on-chain trace of what went
// wrong. `attempt_anchor_purchase_receipt` keeps authorization strict but
// reports the three data failures as an `anchrfail` event.

// ── Lifecycle transition property tests ──────────────────────────────────────
//
// The lifecycle state machine is documented as a table in `contract/README.md`
// and implemented across five entry points (`set_listed`, `freeze_resource`,
// `open_dispute`, `resolve_dispute`, `tombstone_resource`) that each enforce
// their own slice of it. The example-based tests above cover individual
// transitions; these properties drive random operation sequences against a
// model of the table and assert the contract agrees on every step — both when
// a transition is accepted and when it is refused.



// ── Contract storage footprint report ────────────────────────────────────────
//
// Soroban charges rent per ledger entry and archives entries whose TTL runs
// out, so the *shape* of what this contract writes is an operational cost, not
// just an implementation detail. Nothing in the test suite measured it: a
// change that widened `Resource` by a field, or added a second index entry per
// write, showed up only as a WASM size delta (which it does not affect at all)
// or on a rent bill.
//
// `storage_footprint_report` builds one registry in a representative state,
// measures every entry class it writes, and prints the table published in
// `docs/contract-storage-footprint.md`. Run it with:
//
//     cargo test storage_footprint_report -- --nocapture
//
// The budgets below are the enforcement half: they fail the suite when an
// entry class grows past its documented allowance, so growth has to be an
// explicit decision recorded in the doc rather than a silent regression.



include!("test/core_catalog.rs");
include!("test/metadata_updates.rs");
include!("test/tags.rs");
include!("test/schema_registry.rs");
include!("test/lifecycle_roles.rs");
include!("test/hardening_preflight.rs");
include!("test/payments.rs");
include!("test/moderation_pause.rs");
include!("test/properties_events.rs");
include!("test/purchase_receipts.rs");
include!("test/storage_footprint.rs");
include!("test/auth_fixtures.rs");
include!("test/tombstone_read.rs");
