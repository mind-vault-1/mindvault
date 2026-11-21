// ─── Atomic batch tag replacement via set_tags (#1260) ─────────────────────
//
// `set_tags` is the single validated call a creator uses to replace a
// resource's whole tag set. These tests pin down its atomicity contract:
//
//   1. Every check runs before the first storage write: pause, id format,
//      full-set normalization and validation (count, length, empty or
//      whitespace-only, duplicates after normalization), existence, creator
//      authorization and lifecycle state. A rejected call leaves the
//      resource, its raw `TagIndex` memberships, `list_by_tag`,
//      `list_by_tag_page` and `search_by_tag_prefix` exactly as they were.
//      Each rejection test proves this with a before/after `AtrSnapshot`
//      that probes both the current tags and the tags the call tried to add.
//   2. A successful call commits the normalized set, and every tag search
//      reflects exactly that set: nothing stale, nothing missing
//      (`check_tag_index` stays clean across a multi-step sequence).
//   3. Index maintenance is diff-based: tags kept across a replacement are not
//      touched, so the resource keeps its insertion-order position under them.
//
// Soroban also rolls back every storage write of an invocation that returns
// an error, so the rejection tests pin the externally observable guarantee.
// That `set_tags` issues no write before its checks complete is a property of
// its phase structure, not something a black-box test can distinguish.

/// Copy a Soroban string into a Rust string so tests can derive probes.
fn atr_rust_string(value: &String) -> alloc::string::String {
    let mut buf = alloc::vec![0u8; value.len() as usize];
    value.copy_into_slice(&mut buf);
    alloc::string::String::from_utf8(buf).unwrap()
}

/// Raw `TagIndex` contents for `tag`, read straight from contract storage.
/// Empty when the key is absent.
fn atr_index_ids(env: &Env, client: &VaultRegistryClient, tag: &str) -> alloc::vec::Vec<String> {
    let key = DataKey::TagIndex(String::from_str(env, tag));
    let ids: Option<Vec<String>> = env.as_contract(&client.address, || {
        env.storage().persistent().get::<DataKey, Vec<String>>(&key)
    });
    ids.map(|v| v.iter().collect()).unwrap_or_default()
}

/// Whether a `TagIndex` key exists for `tag` at all.
fn atr_index_has(env: &Env, client: &VaultRegistryClient, tag: &str) -> bool {
    let key = DataKey::TagIndex(String::from_str(env, tag));
    env.as_contract(&client.address, || env.storage().persistent().has(&key))
}

/// Resource ids returned by `list_by_tag(tag, 0, 20)`.
fn atr_tag_ids(env: &Env, client: &VaultRegistryClient, tag: &str) -> alloc::vec::Vec<String> {
    client
        .list_by_tag(&String::from_str(env, tag), &0, &20)
        .iter()
        .map(|r| r.id)
        .collect()
}

/// Resource ids on the first `list_by_tag_page(tag, Start, 20)` page.
fn atr_tag_page_ids(env: &Env, client: &VaultRegistryClient, tag: &str) -> alloc::vec::Vec<String> {
    client
        .list_by_tag_page(&String::from_str(env, tag), &IdCursor::Start, &20)
        .items
        .iter()
        .map(|r| r.id)
        .collect()
}

/// Resource ids returned by `search_by_tag_prefix(prefix, 0, 20)`.
fn atr_prefix_ids(
    env: &Env,
    client: &VaultRegistryClient,
    prefix: &str,
) -> alloc::vec::Vec<String> {
    client
        .search_by_tag_prefix(&String::from_str(env, prefix), &0, &20)
        .items
        .iter()
        .map(|r| r.id)
        .collect()
}

/// Resource ids observed for each probed tag or prefix, labelled by probe.
type AtrProbeIds = alloc::vec::Vec<(alloc::string::String, alloc::vec::Vec<String>)>;

/// Everything a rejected `set_tags` must leave untouched.
#[derive(Debug, PartialEq)]
struct AtrSnapshot {
    tags: Vec<String>,
    version: u32,
    state: ResourceState,
    index: AtrProbeIds,
    by_tag: AtrProbeIds,
    by_tag_page: AtrProbeIds,
    by_prefix: AtrProbeIds,
}

fn atr_snapshot(
    env: &Env,
    client: &VaultRegistryClient,
    id: &String,
    tags_to_probe: &[&str],
    prefixes: &[&str],
) -> AtrSnapshot {
    let resource = client.get(id);
    let per_tag = |read: &dyn Fn(&str) -> alloc::vec::Vec<String>| -> AtrProbeIds {
        tags_to_probe
            .iter()
            .map(|t| (alloc::string::String::from(*t), read(t)))
            .collect()
    };
    AtrSnapshot {
        tags: resource.tags,
        version: resource.version,
        state: resource.state,
        index: per_tag(&|t| atr_index_ids(env, client, t)),
        by_tag: per_tag(&|t| atr_tag_ids(env, client, t)),
        by_tag_page: per_tag(&|t| atr_tag_page_ids(env, client, t)),
        by_prefix: prefixes
            .iter()
            .map(|p| {
                (
                    alloc::string::String::from(*p),
                    atr_prefix_ids(env, client, p),
                )
            })
            .collect(),
    }
}

/// Probe set for a rejected call: the normalized form of every tag `subject`
/// carries plus every non-empty normalized tag the call tried to write, and as
/// prefixes each probe and its first byte.
fn atr_probes(
    client: &VaultRegistryClient,
    subject: &String,
    attempt: &[&str],
) -> (
    alloc::vec::Vec<alloc::string::String>,
    alloc::vec::Vec<alloc::string::String>,
) {
    let mut probes: alloc::vec::Vec<alloc::string::String> = alloc::vec::Vec::new();
    let current = client.get(subject).tags;
    let candidates = current
        .iter()
        .map(|t| atr_rust_string(&t))
        .chain(attempt.iter().map(|t| alloc::string::String::from(*t)));
    for raw in candidates {
        let norm = raw.trim().to_ascii_lowercase();
        if !norm.is_empty() && !probes.contains(&norm) {
            probes.push(norm);
        }
    }
    let mut prefixes: alloc::vec::Vec<alloc::string::String> = alloc::vec::Vec::new();
    for p in probes.iter() {
        for candidate in [alloc::string::String::from(&p[..1]), p.clone()] {
            if !prefixes.contains(&candidate) {
                prefixes.push(candidate);
            }
        }
    }
    (probes, prefixes)
}

/// Call `set_tags(target, attempt)`, require exactly `expected`, and require
/// that `subject`'s snapshot (resource plus every probed index and search) is
/// identical before and after the rejected call.
fn atr_expect_rejected(
    env: &Env,
    client: &VaultRegistryClient,
    subject: &String,
    target: &String,
    attempt: &[&str],
    expected: Error,
) {
    let (probes, prefixes) = atr_probes(client, subject, attempt);
    let probes: alloc::vec::Vec<&str> = probes.iter().map(|s| s.as_str()).collect();
    let prefixes: alloc::vec::Vec<&str> = prefixes.iter().map(|s| s.as_str()).collect();

    let before = atr_snapshot(env, client, subject, &probes, &prefixes);
    assert_eq!(
        client.try_set_tags(target, &tags(env, attempt)),
        Err(Ok(expected)),
        "set_tags({attempt:?}) must be rejected with {expected:?}"
    );
    let after = atr_snapshot(env, client, subject, &probes, &prefixes);
    assert_eq!(
        before, after,
        "a rejected set_tags({attempt:?}) must not change tags, TagIndex or any tag search"
    );
}

/// Assert that `tag` resolves to exactly `expected` (in order) through the raw
/// index, `list_by_tag` and `list_by_tag_page`.
fn atr_assert_tag_is(env: &Env, client: &VaultRegistryClient, tag: &str, expected: &[&String]) {
    let expected: alloc::vec::Vec<String> = expected.iter().map(|s| (*s).clone()).collect();
    assert_eq!(atr_index_ids(env, client, tag), expected, "TagIndex({tag})");
    assert_eq!(
        atr_tag_ids(env, client, tag),
        expected,
        "list_by_tag({tag})"
    );
    assert_eq!(
        atr_tag_page_ids(env, client, tag),
        expected,
        "list_by_tag_page({tag})"
    );
}

/// Assert that `tag` has no index key and no search results.
fn atr_assert_tag_gone(env: &Env, client: &VaultRegistryClient, tag: &str) {
    assert!(
        !atr_index_has(env, client, tag),
        "TagIndex({tag}) must be removed once no resource carries it"
    );
    assert!(
        atr_tag_ids(env, client, tag).is_empty(),
        "list_by_tag({tag})"
    );
    assert!(
        atr_tag_page_ids(env, client, tag).is_empty(),
        "list_by_tag_page({tag})"
    );
}

/// `n` distinct valid tags `{stem}0`, `{stem}1`, ...
fn atr_numbered(stem: &str, n: usize) -> alloc::vec::Vec<alloc::string::String> {
    (0..n).map(|i| format!("{stem}{i}")).collect()
}

fn atr_strs(owned: &[alloc::string::String]) -> alloc::vec::Vec<&str> {
    owned.iter().map(|s| s.as_str()).collect()
}

// ── Success: the committed set is exactly what every search returns ─────────

#[test]
fn atomic_tags_full_replacement_updates_every_search() {
    let (env, creator, client) = setup();
    let id = register_tagged(&env, &creator, &client, "atrfull", &["alpha", "beta"]);

    client.set_tags(&id, &tags(&env, &["gamma", "delta"]));

    assert_eq!(client.get(&id).tags, tags(&env, &["gamma", "delta"]));
    atr_assert_tag_gone(&env, &client, "alpha");
    atr_assert_tag_gone(&env, &client, "beta");
    atr_assert_tag_is(&env, &client, "gamma", &[&id]);
    atr_assert_tag_is(&env, &client, "delta", &[&id]);
    assert!(atr_prefix_ids(&env, &client, "al").is_empty());
    assert!(atr_prefix_ids(&env, &client, "be").is_empty());
    assert_eq!(atr_prefix_ids(&env, &client, "ga"), alloc::vec![id.clone()]);
    assert_eq!(atr_prefix_ids(&env, &client, "de"), alloc::vec![id]);
}

/// Regression: the old implementation removed the id from every previous tag
/// and re-added it to every next tag, which moved it to the end of each tag it
/// kept and reordered `list_by_tag` for everyone else under that tag.
#[test]
fn atomic_tags_retained_tag_keeps_index_position() {
    let (env, creator, client) = setup();
    let a = register_tagged(&env, &creator, &client, "atrposa", &["shared"]);
    let b = register_tagged(&env, &creator, &client, "atrposb", &["shared"]);
    atr_assert_tag_is(&env, &client, "shared", &[&a, &b]);

    client.set_tags(&a, &tags(&env, &["shared", "extra"]));

    atr_assert_tag_is(&env, &client, "shared", &[&a, &b]);
    atr_assert_tag_is(&env, &client, "extra", &[&a]);
}

#[test]
fn atomic_tags_partial_overlap_touches_only_the_delta() {
    let (env, creator, client) = setup();
    let x = register_tagged(&env, &creator, &client, "atrovx", &["keep", "drop"]);
    let y = register_tagged(&env, &creator, &client, "atrovy", &["keep"]);
    let z = register_tagged(&env, &creator, &client, "atrovz", &["drop"]);

    client.set_tags(&x, &tags(&env, &["keep", "add"]));

    assert_eq!(client.get(&x).tags, tags(&env, &["keep", "add"]));
    // `keep` still lists x exactly once, in its original position.
    atr_assert_tag_is(&env, &client, "keep", &[&x, &y]);
    atr_assert_tag_is(&env, &client, "drop", &[&z]);
    atr_assert_tag_is(&env, &client, "add", &[&x]);
    assert_eq!(client.get(&y).tags, tags(&env, &["keep"]));
    assert_eq!(client.get(&z).tags, tags(&env, &["drop"]));
}

#[test]
fn atomic_tags_normalizes_before_commit() {
    let (env, creator, client) = setup();
    let id = register_tagged(&env, &creator, &client, "atrnorm", &[]);

    client.set_tags(&id, &tags(&env, &["  Rust ", "WASM"]));

    assert_eq!(client.get(&id).tags, tags(&env, &["rust", "wasm"]));
    atr_assert_tag_is(&env, &client, "rust", &[&id]);
    atr_assert_tag_is(&env, &client, "wasm", &[&id]);
    assert_eq!(atr_tag_ids(&env, &client, "RUST"), alloc::vec![id.clone()]);
    assert_eq!(atr_prefix_ids(&env, &client, " RU"), alloc::vec![id]);
    // Only the normalized key exists; the raw spellings were never indexed.
    assert!(!atr_index_has(&env, &client, "  Rust "));
    assert!(!atr_index_has(&env, &client, "RUST"));
    assert!(!atr_index_has(&env, &client, "WASM"));
}

#[test]
fn atomic_tags_index_consistent_after_many_replacements() {
    let (env, creator, client) = setup();
    let r1 = register_tagged(&env, &creator, &client, "atrseq1", &["red", "blue"]);
    let r2 = register_tagged(&env, &creator, &client, "atrseq2", &["blue"]);
    let r3 = register_tagged(&env, &creator, &client, "atrseq3", &[]);
    let ids = [r1.clone(), r2.clone(), r3.clone()];
    let universe = ["red", "blue", "green"];

    let steps: [(&String, &[&str]); 7] = [
        (&r3, &["green"]),                  // add to an untagged resource
        (&r1, &["blue"]),                   // drop one tag
        (&r2, &["blue", "red"]),            // keep one, add one
        (&r1, &[]),                         // clear to empty
        (&r1, &["green", "red"]),           // re-add after clearing
        (&r2, &["red", "blue"]),            // reorder only
        (&r3, &["Blue", " RED ", "green"]), // un-normalized superset
    ];

    for (step, (id, next)) in steps.iter().enumerate() {
        client.set_tags(id, &tags(&env, next));

        let mut id_list: Vec<String> = Vec::new(&env);
        for r in ids.iter() {
            id_list.push_back(r.clone());
        }
        let report = client.check_tag_index(&id_list);
        assert!(
            report.missing.is_empty(),
            "step {step}: missing {:?}",
            report.missing
        );
        assert!(
            report.stale.is_empty(),
            "step {step}: stale {:?}",
            report.stale
        );

        for tag in universe {
            let norm = String::from_str(&env, tag);
            let carriers: alloc::vec::Vec<String> = ids
                .iter()
                .filter(|r| client.get(r).tags.contains(&norm))
                .cloned()
                .collect();
            let listed = atr_tag_ids(&env, &client, tag);
            let raw = atr_index_ids(&env, &client, tag);
            // Same length plus containment of every distinct carrier means the
            // lists are exactly the carrier set (no duplicates, no extras).
            assert_eq!(
                listed.len(),
                carriers.len(),
                "step {step}: list_by_tag({tag})"
            );
            assert_eq!(raw.len(), carriers.len(), "step {step}: TagIndex({tag})");
            for c in carriers.iter() {
                assert!(
                    listed.contains(c),
                    "step {step}: list_by_tag({tag}) lacks {c:?}"
                );
                assert!(raw.contains(c), "step {step}: TagIndex({tag}) lacks {c:?}");
            }
            if carriers.is_empty() {
                assert!(
                    !atr_index_has(&env, &client, tag),
                    "step {step}: {tag} key left"
                );
            }
        }
    }

    // Final positions: r2 kept `blue` and `red` across its reorder, so it keeps
    // its earlier slot under both.
    atr_assert_tag_is(&env, &client, "blue", &[&r2, &r3]);
    atr_assert_tag_is(&env, &client, "red", &[&r2, &r1, &r3]);
    atr_assert_tag_is(&env, &client, "green", &[&r3, &r1]);
}

#[test]
fn atomic_tags_reorder_only_rewrites_order_without_index_churn() {
    let (env, creator, client) = setup();
    let id = register_tagged(&env, &creator, &client, "atrreord", &["a", "b"]);
    let peer = register_tagged(&env, &creator, &client, "atrreordp", &["a", "b"]);
    let version = client.get(&id).version;

    client.set_tags(&id, &tags(&env, &["b", "a"]));

    let (prev, next) =
        find_settags_event(&env, &client.address).expect("reorder must emit settags");
    assert_eq!(prev, tags(&env, &["a", "b"]));
    assert_eq!(next, tags(&env, &["b", "a"]));
    let r = client.get(&id);
    assert_eq!(r.tags, tags(&env, &["b", "a"]));
    assert_eq!(
        r.version,
        version + 1,
        "a reorder is a real write of the resource"
    );
    atr_assert_tag_is(&env, &client, "a", &[&id, &peer]);
    atr_assert_tag_is(&env, &client, "b", &[&id, &peer]);
}

#[test]
fn atomic_tags_identical_set_is_a_noop() {
    let (env, creator, client) = setup();
    let id = register_tagged(&env, &creator, &client, "atrnoop", &["ml"]);
    let before = atr_snapshot(&env, &client, &id, &["ml"], &["m", "ml"]);

    client.set_tags(&id, &tags(&env, &["ML"]));

    assert!(
        find_settags_event(&env, &client.address).is_none(),
        "an identical normalized set must not emit settags"
    );
    let after = atr_snapshot(&env, &client, &id, &["ml"], &["m", "ml"]);
    assert_eq!(
        before, after,
        "an identical set must not bump version or touch indexes"
    );
}

#[test]
fn atomic_tags_event_carries_prev_and_normalized_next() {
    let (env, creator, client) = setup();
    let id = register_tagged(&env, &creator, &client, "atrevent", &["data"]);

    client.set_tags(&id, &tags(&env, &["  Finance ", "API"]));

    let (prev, next) = find_settags_event(&env, &client.address).expect("settags emitted");
    assert_eq!(prev, tags(&env, &["data"]));
    assert_eq!(next, tags(&env, &["finance", "api"]));
}

// ── Validation failures: the whole set is rejected and nothing changes ──────

/// Register a resource carrying `base` next to a peer that also carries it, so
/// a stray index rewrite would be visible as a reordering.
fn atr_validation_fixture<'a>(
    env: &Env,
    creator: &Address,
    client: &VaultRegistryClient<'a>,
) -> String {
    let id = register_tagged(env, creator, client, "atrval", &["base", "other"]);
    register_tagged(env, creator, client, "atrvalpeer", &["base"]);
    id
}

#[test]
fn atomic_tags_rejects_exact_duplicate() {
    let (env, creator, client) = setup();
    let id = atr_validation_fixture(&env, &creator, &client);
    atr_expect_rejected(&env, &client, &id, &id, &["ai", "ai"], Error::InvalidTag);
}

#[test]
fn atomic_tags_rejects_case_variant_duplicate() {
    let (env, creator, client) = setup();
    let id = atr_validation_fixture(&env, &creator, &client);
    atr_expect_rejected(&env, &client, &id, &id, &["ML", "ml"], Error::InvalidTag);
}

#[test]
fn atomic_tags_rejects_whitespace_variant_duplicate() {
    let (env, creator, client) = setup();
    let id = atr_validation_fixture(&env, &creator, &client);
    atr_expect_rejected(&env, &client, &id, &id, &["ml", " ml "], Error::InvalidTag);
}

#[test]
fn atomic_tags_enforces_tag_count_limit() {
    let (env, creator, client) = setup();
    let id = atr_validation_fixture(&env, &creator, &client);

    let too_many = atr_numbered("t", MAX_TAGS as usize + 1);
    atr_expect_rejected(
        &env,
        &client,
        &id,
        &id,
        &atr_strs(&too_many),
        Error::InvalidTag,
    );

    let at_limit = atr_numbered("t", MAX_TAGS as usize);
    client.set_tags(&id, &tags(&env, &atr_strs(&at_limit)));
    assert_eq!(client.get(&id).tags.len(), MAX_TAGS);
    for t in at_limit.iter() {
        atr_assert_tag_is(&env, &client, t, &[&id]);
    }
    assert_eq!(atr_prefix_ids(&env, &client, "t"), alloc::vec![id]);
}

#[test]
fn atomic_tags_enforces_tag_length_limit() {
    let (env, creator, client) = setup();
    let id = atr_validation_fixture(&env, &creator, &client);

    let too_long = "x".repeat(MAX_TAG_LEN as usize + 1);
    atr_expect_rejected(
        &env,
        &client,
        &id,
        &id,
        &["fresh", &too_long],
        Error::InvalidTag,
    );

    let at_limit = "x".repeat(MAX_TAG_LEN as usize);
    client.set_tags(&id, &tags(&env, &["fresh", &at_limit]));
    assert_eq!(client.get(&id).tags, tags(&env, &["fresh", &at_limit]));
    atr_assert_tag_is(&env, &client, &at_limit, &[&id]);
    atr_assert_tag_is(&env, &client, "fresh", &[&id]);
}

#[test]
fn atomic_tags_rejects_empty_and_whitespace_only_tags() {
    let (env, creator, client) = setup();
    let id = atr_validation_fixture(&env, &creator, &client);
    atr_expect_rejected(&env, &client, &id, &id, &["fresh", ""], Error::InvalidTag);
    atr_expect_rejected(
        &env,
        &client,
        &id,
        &id,
        &["fresh", "   "],
        Error::InvalidTag,
    );
}

/// The core "validate the full set before changing storage or prefix indexes"
/// proof: seven valid new tags followed by one invalid entry must not leave a
/// trace of any of the seven.
#[test]
fn atomic_tags_invalid_last_entry_rejects_whole_set() {
    let (env, creator, client) = setup();
    let id = atr_validation_fixture(&env, &creator, &client);
    let valid = atr_numbered("n", MAX_TAGS as usize - 1);
    let too_long = "n".repeat(MAX_TAG_LEN as usize + 1);

    for last in [too_long.as_str(), "N0"] {
        let mut attempt = atr_strs(&valid);
        attempt.push(last);
        atr_expect_rejected(&env, &client, &id, &id, &attempt, Error::InvalidTag);

        for t in valid.iter() {
            assert!(!atr_index_has(&env, &client, t), "{t} must not be indexed");
            assert!(atr_tag_ids(&env, &client, t).is_empty());
        }
        assert!(atr_prefix_ids(&env, &client, "n").is_empty());
        assert_eq!(client.get(&id).tags, tags(&env, &["base", "other"]));
    }
}

// ── Authorization and state failures: nothing changes ──────────────────────

#[test]
fn atomic_tags_rejects_non_creator() {
    let (env, owner, stranger, client, id) = setup_strict_auth();

    let initial = tags(&env, &["owned"]);
    let invoke = build_set_tags_invoke(&env, &client, &id, &initial);
    let auth = [MockAuth {
        address: &owner,
        invoke: &invoke,
    }];
    client.mock_auths(&auth).set_tags(&id, &initial);

    let attempt = tags(&env, &["hacked", "owned"]);
    let probes = ["owned", "hacked"];
    let prefixes = ["ow", "ha"];
    let before = atr_snapshot(&env, &client, &id, &probes, &prefixes);

    let invoke = build_set_tags_invoke(&env, &client, &id, &attempt);
    let auth = [MockAuth {
        address: &stranger,
        invoke: &invoke,
    }];
    let res = client.mock_auths(&auth).try_set_tags(&id, &attempt);
    assert_eq!(
        res,
        Err(Err(soroban_sdk::InvokeError::Abort)),
        "a non-creator must not be able to replace tags"
    );
    assert_eq!(before, atr_snapshot(&env, &client, &id, &probes, &prefixes));
    assert!(!atr_index_has(&env, &client, "hacked"));

    // The same replacement signed by the creator commits.
    let invoke = build_set_tags_invoke(&env, &client, &id, &attempt);
    let auth = [MockAuth {
        address: &owner,
        invoke: &invoke,
    }];
    client.mock_auths(&auth).set_tags(&id, &attempt);
    assert_eq!(client.get(&id).tags, attempt);
    atr_assert_tag_is(&env, &client, "hacked", &[&id]);
    atr_assert_tag_is(&env, &client, "owned", &[&id]);
}

#[test]
fn atomic_tags_rejects_while_paused() {
    let (env, creator, admin, client) = setup_with_admin();
    let id = register_tagged(&env, &creator, &client, "atrpause", &["live"]);

    client.set_paused(&admin, &true);
    atr_expect_rejected(
        &env,
        &client,
        &id,
        &id,
        &["paused", "live"],
        Error::ContractPaused,
    );

    client.set_paused(&admin, &false);
    client.set_tags(&id, &tags(&env, &["paused", "live"]));
    atr_assert_tag_is(&env, &client, "paused", &[&id]);
    atr_assert_tag_is(&env, &client, "live", &[&id]);
}

#[test]
fn atomic_tags_rejects_frozen_resource() {
    let (env, creator, client) = setup();
    let id = register_tagged(&env, &creator, &client, "atrfrozen", &["cold"]);
    client.freeze_resource(&id);

    atr_expect_rejected(
        &env,
        &client,
        &id,
        &id,
        &["warm", "cold"],
        Error::ResourceNotMutable,
    );
}

#[test]
fn atomic_tags_rejects_tombstoned_resource() {
    let (env, creator, admin, client) = setup_with_admin();
    let id = register_tagged(&env, &creator, &client, "atrtomb", &["old"]);
    let peer = register_tagged(&env, &creator, &client, "atrtombpeer", &["new"]);
    client.tombstone_resource(&id, &admin);

    atr_expect_rejected(
        &env,
        &client,
        &id,
        &id,
        &["new", "old"],
        Error::ResourceNotMutable,
    );

    assert_eq!(client.get(&id).tags, tags(&env, &["old"]));
    // Tombstoning already dropped the id from `old`; the rejected call must not
    // have put it back, nor added it under `new`.
    atr_assert_tag_gone(&env, &client, "old");
    atr_assert_tag_is(&env, &client, "new", &[&peer]);
    assert_eq!(atr_prefix_ids(&env, &client, "ne"), alloc::vec![peer]);
    assert!(atr_prefix_ids(&env, &client, "ol").is_empty());
}

#[test]
fn atomic_tags_rejects_unknown_and_malformed_ids() {
    let (env, creator, client) = setup();
    let bystander = register_tagged(&env, &creator, &client, "atrbystander", &["bystander"]);
    let attempt = ["ghosttag", "bystander"];

    let unknown = String::from_str(&env, "atrghost");
    atr_expect_rejected(
        &env,
        &client,
        &bystander,
        &unknown,
        &attempt,
        Error::NotFound,
    );

    let uppercase = String::from_str(&env, "ATRBAD");
    atr_expect_rejected(
        &env,
        &client,
        &bystander,
        &uppercase,
        &attempt,
        Error::InvalidResourceId,
    );

    let oversized = "a".repeat(MAX_RESOURCE_ID_LEN as usize + 1);
    let oversized = String::from_str(&env, &oversized);
    atr_expect_rejected(
        &env,
        &client,
        &bystander,
        &oversized,
        &attempt,
        Error::InvalidResourceId,
    );

    atr_assert_tag_gone(&env, &client, "ghosttag");
    assert!(atr_prefix_ids(&env, &client, "gh").is_empty());
    atr_assert_tag_is(&env, &client, "bystander", &[&bystander]);
}
