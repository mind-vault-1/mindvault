// Tests for #1238: the registry-wide verifier key history read by
// `verifier_key_history`.

/// Read the whole history page by page, checking the cursor contract on the way.
fn read_full_key_history(client: &VaultRegistryClient, limit: u32) -> std::vec::Vec<VerifierKeyChange> {
    let mut out = std::vec::Vec::new();
    let mut cursor = 0;
    loop {
        let page = client.verifier_key_history(&cursor, &limit);
        assert!(page.changes.len() <= VERIFIER_KEY_HISTORY_PAGE_CAP);
        for change in page.changes.iter() {
            out.push(change);
        }
        match page.next_cursor {
            Some(next) => {
                assert_eq!(next, cursor + page.changes.len(), "next_cursor must follow the page");
                cursor = next;
            }
            None => {
                assert_eq!(cursor + page.changes.len(), page.total, "the last page must end at total");
                break;
            }
        }
    }
    out
}

#[test]
fn verifier_key_history_is_empty_before_any_change() {
    let (_env, _creator, _admin, client) = setup_with_admin();

    let page = client.verifier_key_history(&0, &10);
    assert_eq!(page.changes.len(), 0);
    assert_eq!(page.next_cursor, None);
    assert_eq!(page.total, 0);

    // A cursor past the end is an empty page, not an error.
    let page = client.verifier_key_history(&5, &10);
    assert_eq!(page.changes.len(), 0);
    assert_eq!(page.next_cursor, None);
}

#[test]
fn verifier_key_history_records_grant_revoke_and_rotations_in_order() {
    let (env, _creator, admin, client) = setup_with_admin();
    let k1 = Address::generate(&env);
    let k2 = Address::generate(&env);
    let k3 = Address::generate(&env);
    let k4 = Address::generate(&env);

    env.ledger().set_sequence_number(100);
    client.add_verifier(&k1);
    env.ledger().set_sequence_number(110);
    client.rotate_verifier(&k1, &k2);
    env.ledger().set_sequence_number(120);
    client.rotate_verifier(&k2, &k3);
    env.ledger().set_sequence_number(130);
    client.add_verifier(&k4);
    env.ledger().set_sequence_number(140);
    client.remove_verifier(&k3);

    let history = read_full_key_history(&client, 20);
    let expected = [
        (1, VerifierKeyAction::Added, &k1, None, true, 100),
        (2, VerifierKeyAction::Rotated, &k2, Some(k1.clone()), true, 110),
        (3, VerifierKeyAction::Rotated, &k3, Some(k2.clone()), true, 120),
        (4, VerifierKeyAction::Added, &k4, None, true, 130),
        (5, VerifierKeyAction::Removed, &k3, None, false, 140),
    ];
    assert_eq!(history.len(), expected.len());
    for (change, (revision, action, verifier, previous, active, ledger)) in history.iter().zip(expected) {
        assert_eq!(
            *change,
            VerifierKeyChange {
                revision,
                action,
                verifier: verifier.clone(),
                previous,
                active,
                admin: admin.clone(),
                ledger,
            }
        );
    }

    // The history agrees with the live role state it describes.
    assert!(!client.is_verifier(&k1));
    assert!(!client.is_verifier(&k2));
    assert!(!client.is_verifier(&k3));
    assert!(client.is_verifier(&k4));
}

#[test]
fn verifier_key_history_records_only_real_changes() {
    let (env, _creator, _admin, client) = setup_with_admin();
    let k1 = Address::generate(&env);
    let never = Address::generate(&env);

    client.add_verifier(&k1);
    client.add_verifier(&k1); // already a verifier: no entry
    client.remove_verifier(&never); // never a verifier: no entry

    let page = client.verifier_key_history(&0, &20);
    assert_eq!(page.total, 1);
    assert_eq!(page.changes.get(0).unwrap().action, VerifierKeyAction::Added);

    // A failed rotation records nothing either.
    assert_eq!(
        client.try_rotate_verifier(&never, &Address::generate(&env)),
        Err(Ok(Error::NotFound))
    );
    assert_eq!(client.verifier_key_history(&0, &20).total, 1);
}

#[test]
fn verifier_key_history_pages_are_bounded_and_resume_from_a_saved_cursor() {
    let (env, _creator, _admin, client) = setup_with_admin();

    // 25 rotations of one key slot after the initial grant: 26 entries.
    let mut current = Address::generate(&env);
    client.add_verifier(&current);
    for _ in 0..25 {
        let next = Address::generate(&env);
        client.rotate_verifier(&current, &next);
        current = next;
    }

    // Limits above the cap are clamped; a 0 limit still makes progress.
    let first = client.verifier_key_history(&0, &1000);
    assert_eq!(first.changes.len(), VERIFIER_KEY_HISTORY_PAGE_CAP);
    assert_eq!(first.next_cursor, Some(VERIFIER_KEY_HISTORY_PAGE_CAP));
    assert_eq!(first.total, 26);
    let one = client.verifier_key_history(&0, &0);
    assert_eq!(one.changes.len(), 1);
    assert_eq!(one.next_cursor, Some(1));

    // Small pages read the same sequence as large ones.
    let by_three = read_full_key_history(&client, 3);
    let by_twenty = read_full_key_history(&client, 20);
    assert_eq!(by_three, by_twenty);
    let revisions: std::vec::Vec<u32> = by_three.iter().map(|c| c.revision).collect();
    assert_eq!(revisions, (1..=26).collect::<std::vec::Vec<u32>>());

    // Entry `revision` sits at cursor `revision - 1`.
    let tenth = client.verifier_key_history(&9, &1).changes.get(0).unwrap();
    assert_eq!(tenth.revision, 10);

    // A consumer at the end of the history saves its cursor; later changes
    // are exactly what it reads when it resumes.
    let saved = 26;
    assert_eq!(client.verifier_key_history(&saved, &20).changes.len(), 0);
    client.remove_verifier(&current);
    let resumed = client.verifier_key_history(&saved, &20);
    assert_eq!(resumed.changes.len(), 1);
    assert_eq!(resumed.next_cursor, None);
    let last = resumed.changes.get(0).unwrap();
    assert_eq!((last.revision, last.action, last.active), (27, VerifierKeyAction::Removed, false));
    assert_eq!(last.verifier, current);
}

#[test]
fn verifier_key_history_read_does_not_change_role_state() {
    let (env, _creator, _admin, client) = setup_with_admin();
    let k1 = Address::generate(&env);
    client.add_verifier(&k1);

    let before = client.role_inventory_page(&RoleKind::Verifier, &0, &20);
    client.verifier_key_history(&0, &20);
    client.verifier_key_history(&0, &20);
    assert_eq!(client.role_inventory_page(&RoleKind::Verifier, &0, &20), before);
    assert_eq!(client.verifier_key_history(&0, &20).total, 1);
}

#[test]
fn role_capability_version_advertises_verifier_key_history() {
    let (_env, _creator, client) = setup();
    assert!(client.registry_info().role_capability_version >= 2);
    assert!(METHOD_SCHEMA.iter().any(|(name, _)| *name == "verifier_key_history"));
}
