// Creator index consistency across ownership transfers (#1167).
//
// The creator indexes (`CreatorResources`, `CreatorCount`, `CreatorListedCount`)
// are derived state: they must describe the *current* owner after every
// ownership change, including when a historical transfer left a stale entry
// behind. These tests pin the normal path, repeated transfers, and the repair
// of a stale destination index.

#[test]
fn creator_indexes_follow_transfer_ownership_with_terms() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "cixt1");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://cixt1"),
        &empty_tags(&env),
    );
    client.set_listed(&id, &true);
    let new_owner = Address::generate(&env);

    client.transfer_ownership_with_terms(&id, &new_owner, &None, &false);

    assert_eq!(client.creator_resource_count(&creator), 0);
    assert_eq!(client.creator_resource_count(&new_owner), 1);
    assert_eq!(client.creator_listed_count(&creator), 0);
    assert_eq!(client.creator_listed_count(&new_owner), 1);
    assert_eq!(client.list_by_creator(&new_owner, &0, &20).len(), 1);
    assert_eq!(client.listed_count(), 1);
}

#[test]
fn repeated_transfers_do_not_accumulate_index_entries() {
    let (env, alice, client) = setup();
    let id = String::from_str(&env, "cixt2");
    client.register(
        &alice,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://cixt2"),
        &empty_tags(&env),
    );
    client.set_listed(&id, &true);
    let bob = Address::generate(&env);

    for _ in 0..3 {
        client.transfer_ownership(&id, &bob);
        client.transfer_ownership(&id, &alice);
    }

    assert_eq!(client.creator_resource_count(&alice), 1);
    assert_eq!(client.creator_resource_count(&bob), 0);
    assert_eq!(client.creator_listed_count(&alice), 1);
    assert_eq!(client.creator_listed_count(&bob), 0);
    assert_eq!(client.list_by_creator(&alice, &0, &20).len(), 1);
    assert_eq!(client.listed_count(), 1);
}

#[test]
fn stale_destination_index_does_not_double_count_on_transfer() {
    let (env, alice, client) = setup();
    let id = String::from_str(&env, "cixt3");
    client.register(
        &alice,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://cixt3"),
        &empty_tags(&env),
    );
    client.set_listed(&id, &true);
    let bob = Address::generate(&env);

    // Simulate the legacy state the index repair path defends against: an old
    // transfer left a duplicate id in bob's index and already credited his
    // listed count. Moving the resource back must not credit it a second time.
    env.as_contract(&client.address, || {
        let key = DataKey::CreatorResources(bob.clone());
        let mut entries: Vec<String> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        entries.push_back(id.clone());
        env.storage().persistent().set(&key, &entries);
        env.storage()
            .instance()
            .set(&DataKey::CreatorListedCount(bob.clone()), &1u32);
    });

    client.transfer_ownership(&id, &bob);

    assert_eq!(client.creator_resource_count(&alice), 0);
    assert_eq!(client.creator_resource_count(&bob), 1);
    assert_eq!(client.creator_listed_count(&alice), 0);
    assert_eq!(client.creator_listed_count(&bob), 1);
    assert_eq!(client.list_by_creator(&bob, &0, &20).len(), 1);
    assert_eq!(client.listed_count(), 1);
}

#[test]
fn rejected_transfer_leaves_creator_indexes_unchanged() {
    let (_env, owner, stranger, client, id) = setup_strict_auth();
    client.mock_all_auths().set_listed(&id, &true);

    assert_eq!(client.creator_resource_count(&owner), 1);
    assert_eq!(client.creator_listed_count(&owner), 1);

    // No auth is supplied for the current owner's `require_auth`, so the call
    // is rejected before any index write can happen.
    assert!(client.try_transfer_ownership(&id, &stranger).is_err());

    assert_eq!(client.creator_resource_count(&owner), 1);
    assert_eq!(client.creator_listed_count(&owner), 1);
    assert_eq!(client.creator_resource_count(&stranger), 0);
    assert_eq!(client.creator_listed_count(&stranger), 0);
    assert_eq!(client.list_by_creator(&owner, &0, &20).len(), 1);
}
