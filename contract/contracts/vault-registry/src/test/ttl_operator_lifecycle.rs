// Doc check for `docs/contract-ttl-lifecycle.md`.
//
// The operator guide states which public calls refresh which storage entries.
// Each test below pins one statement in that guide's "What refreshes what"
// table, so a change to the contract's TTL behaviour fails here and the guide
// gets updated in the same change.

/// Live TTL of any persistent `DataKey` entry.
fn op_persistent_ttl(env: &Env, contract: &Address, key: &DataKey) -> u32 {
    env.as_contract(contract, || env.storage().persistent().get_ttl(key))
}

/// Register one tagged resource and age the ledger by two days, so every
/// entry it wrote sits below `LIFETIME_THRESHOLD` and is eligible to bump.
fn op_aged_fixture<'a>() -> (Env, Address, VaultRegistryClient<'a>, String) {
    let (env, creator, client) = setup();
    let id = register_tagged(&env, &creator, &client, "opttl", &["opsdoc"]);
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + 2 * TTL_DAY_IN_LEDGERS);
    (env, creator, client, id)
}

const OP_AGED_TTL: u32 = TTL_BUMP_AMOUNT - 2 * TTL_DAY_IN_LEDGERS;

#[test]
fn op_ttl_register_writes_every_entry_at_full_bump() {
    let (env, creator, client) = setup();
    let id = register_tagged(&env, &creator, &client, "opttl", &["opsdoc"]);
    let addr = &client.address;

    for key in [
        DataKey::Resource(id.clone()),
        DataKey::Index(0),
        DataKey::TagIndex(String::from_str(&env, "opsdoc")),
        DataKey::CreatorResources(creator.clone()),
    ] {
        assert_eq!(op_persistent_ttl(&env, addr, &key), TTL_BUMP_AMOUNT);
    }
}

#[test]
fn op_ttl_single_get_does_not_refresh_resource() {
    let (env, _creator, client, id) = op_aged_fixture();
    client.get(&id);
    client.get_owner(&id);
    assert_eq!(
        op_persistent_ttl(&env, &client.address, &DataKey::Resource(id)),
        OP_AGED_TTL,
        "get / get_owner are read-only for TTL; the guide says so"
    );
}

#[test]
fn op_ttl_get_many_refreshes_resource() {
    let (env, _creator, client, id) = op_aged_fixture();
    let mut ids = Vec::new(&env);
    ids.push_back(id.clone());
    client.get_many(&ids);
    assert_eq!(
        op_persistent_ttl(&env, &client.address, &DataKey::Resource(id)),
        TTL_BUMP_AMOUNT
    );
}

#[test]
fn op_ttl_list_page_refreshes_index_and_resource() {
    let (env, _creator, client, id) = op_aged_fixture();
    client.list_page(&0u32, &10u32);
    let addr = &client.address;
    assert_eq!(
        op_persistent_ttl(&env, addr, &DataKey::Index(0)),
        TTL_BUMP_AMOUNT
    );
    assert_eq!(
        op_persistent_ttl(&env, addr, &DataKey::Resource(id)),
        TTL_BUMP_AMOUNT
    );
}

#[test]
fn op_ttl_list_by_tag_refreshes_resource_but_not_tag_index() {
    let (env, _creator, client, id) = op_aged_fixture();
    client.list_by_tag(&String::from_str(&env, "opsdoc"), &0u32, &10u32);
    let addr = &client.address;
    assert_eq!(
        op_persistent_ttl(&env, addr, &DataKey::Resource(id)),
        TTL_BUMP_AMOUNT
    );
    assert_eq!(
        op_persistent_ttl(
            &env,
            addr,
            &DataKey::TagIndex(String::from_str(&env, "opsdoc"))
        ),
        OP_AGED_TTL,
        "TagIndex is refreshed only when a write touches the tag"
    );
}

#[test]
fn op_ttl_list_by_creator_does_not_refresh_creator_index() {
    let (env, creator, client, _id) = op_aged_fixture();
    client.list_by_creator(&creator, &0u32, &10u32);
    assert_eq!(
        op_persistent_ttl(
            &env,
            &client.address,
            &DataKey::CreatorResources(creator.clone())
        ),
        OP_AGED_TTL,
        "CreatorResources is refreshed only when a write touches the creator"
    );
}

#[test]
fn op_ttl_extend_resource_ttl_refreshes_only_the_resource_entry() {
    let (env, creator, client, id) = op_aged_fixture();
    client.extend_resource_ttl(&creator, &id);
    let addr = &client.address;
    assert_eq!(
        op_persistent_ttl(&env, addr, &DataKey::Resource(id)),
        TTL_BUMP_AMOUNT
    );
    for key in [
        DataKey::Index(0),
        DataKey::TagIndex(String::from_str(&env, "opsdoc")),
        DataKey::CreatorResources(creator.clone()),
    ] {
        assert_eq!(
            op_persistent_ttl(&env, addr, &key),
            OP_AGED_TTL,
            "extend_resource_ttl must leave the index entries alone"
        );
    }
}
