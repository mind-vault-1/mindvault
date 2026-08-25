#![cfg(test)]

use super::*;
use crate::alloc::format;
use crate::alloc::string::ToString;
use proptest::prelude::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Events as _, Ledger as _},
    Address, Env, FromVal, IntoVal, String, Symbol, TryFromVal, TryIntoVal, Vec,
};

fn resource_storage_ttl(env: &Env, contract: &soroban_sdk::Address, id: &String) -> u32 {
    let key = DataKey::Resource(id.clone());
    env.as_contract(contract, || env.storage().persistent().get_ttl(&key))
}

fn setup<'a>() -> (Env, Address, VaultRegistryClient<'a>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(VaultRegistry, ());
    let client = VaultRegistryClient::new(&env, &contract_id);
    let creator = Address::generate(&env);
    (env, creator, client)
}

fn empty_tags(env: &Env) -> Vec<String> {
    Vec::new(env)
}

fn tags(env: &Env, items: &[&str]) -> Vec<String> {
    let mut v = Vec::new(env);
    for item in items {
        v.push_back(String::from_str(env, item));
    }
    v
}

#[test]
fn register_then_read() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "swcn98besxpp6t1u8e77fqz3");
    let metadata = String::from_str(&env, "ipfs://QmResourceMetadata");

    client.register(&creator, &id, &1_000_000i128, &metadata, &empty_tags(&env));

    assert_eq!(client.count(), 1);
    assert!(client.exists(&id));

    let r = client.get(&id);
    assert_eq!(r.id, id);
    assert_eq!(r.creator, creator);
    assert_eq!(r.price, 1_000_000i128);
    assert_eq!(r.metadata, metadata);
    assert!(r.listed); // Resources are listed by default
}

#[test]
fn register_event_contains_full_resource_payload() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evtres");
    let metadata = String::from_str(&env, "ipfs://evt");
    let price = 500i128;
    let tags_list = tags(&env, &["tag1"]);

    client.register(&creator, &id, &price, &metadata, &tags_list);

    let all_events = env.events().all();
    let mut found = false;
    for i in 0..all_events.len() {
        let (_, topics, data) = all_events.get(i).unwrap();
        if topics.len() != 2 {
            continue;
        }
        let t0: Symbol =
            <Symbol as TryFromVal<Env, Val>>::try_from_val(&env, &topics.get(0).unwrap())
                .ok()
                .unwrap();
        if t0 != Symbol::new(&env, "register") {
            continue;
        }
        let resource: Resource = <Resource as TryFromVal<Env, Val>>::try_from_val(&env, &data)
            .ok()
            .unwrap();
        assert_eq!(resource.id, id);
        assert_eq!(resource.creator, creator);
        assert_eq!(resource.price, price);
        assert_eq!(resource.metadata, metadata);
        assert!(resource.listed);
        assert_eq!(resource.tags.len(), 1);
        assert_eq!(
            resource.tags.get(0).unwrap(),
            String::from_str(&env, "tag1")
        );
        found = true;
        break;
    }
    assert!(found, "register event not emitted");
}

#[test]
fn count_tracks_multiple_successful_registrations() {
    let (env, creator, client) = setup();
    assert_eq!(client.count(), 0);

    let ids = ["c1", "c2", "c3", "c4"];
    for id in &ids {
        client.register(
            &creator,
            &String::from_str(&env, id),
            &100i128,
            &String::from_str(&env, "ipfs://m"),
            &empty_tags(&env),
        );
    }
    assert_eq!(client.count(), 4);

    // Failed duplicate must not increment count.
    let dup = String::from_str(&env, "c2");
    assert_eq!(
        client.try_register(
            &creator,
            &dup,
            &100i128,
            &String::from_str(&env, "ipfs://m"),
            &empty_tags(&env)
        ),
        Err(Ok(Error::AlreadyRegistered))
    );
    assert_eq!(client.count(), 4);
}

#[test]
fn duplicate_registration_fails() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "dup");
    let metadata = String::from_str(&env, "ipfs://x");
    client.register(&creator, &id, &100i128, &metadata, &empty_tags(&env));

    let res = client.try_register(&creator, &id, &100i128, &metadata, &empty_tags(&env));
    assert_eq!(res, Err(Ok(Error::AlreadyRegistered)));
    assert_eq!(client.count(), 1);
}

#[test]
fn zero_or_negative_price_rejected() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "free");
    let metadata = String::from_str(&env, "ipfs://x");

    assert_eq!(
        client.try_register(&creator, &id, &0i128, &metadata, &empty_tags(&env)),
        Err(Ok(Error::InvalidPrice))
    );
    assert_eq!(
        client.try_register(&creator, &id, &-5i128, &metadata, &empty_tags(&env)),
        Err(Ok(Error::InvalidPrice))
    );
}

#[test]
fn register_rejects_price_exceeding_max() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "toopricey");
    let metadata = String::from_str(&env, "ipfs://x");
    let over = MAX_PRICE + 1;
    assert_eq!(
        client.try_register(&creator, &id, &over, &metadata, &empty_tags(&env)),
        Err(Ok(Error::PriceExceedsMax))
    );
}

#[test]
fn set_price_rejects_price_exceeding_max() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r1");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    let over = MAX_PRICE + 1;
    assert_eq!(
        client.try_set_price(&id, &over),
        Err(Ok(Error::PriceExceedsMax))
    );
}

#[test]
fn maximum_price_accepted() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "maxprice");
    let metadata = String::from_str(&env, "ipfs://x");
    client.register(&creator, &id, &MAX_PRICE, &metadata, &empty_tags(&env));
    assert_eq!(client.get(&id).price, MAX_PRICE);
}

#[test]
fn invalid_resource_id_rejected() {
    let (env, creator, client) = setup();
    let metadata = String::from_str(&env, "ipfs://x");

    let empty = String::from_str(&env, "");
    assert_eq!(
        client.try_register(&creator, &empty, &100i128, &metadata, &empty_tags(&env)),
        Err(Ok(Error::InvalidResourceId))
    );

    let overlong = String::from_str(&env, &"a".repeat(25));
    assert_eq!(
        client.try_register(&creator, &overlong, &100i128, &metadata, &empty_tags(&env)),
        Err(Ok(Error::InvalidResourceId))
    );

    let invalid_chars = String::from_str(&env, "bad-id");
    assert_eq!(
        client.try_register(
            &creator,
            &invalid_chars,
            &100i128,
            &metadata,
            &empty_tags(&env)
        ),
        Err(Ok(Error::InvalidResourceId))
    );
}

#[test]
fn valid_resource_id_is_accepted() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "swcn98besxpp6t1u8e77fqz3");
    let metadata = String::from_str(&env, "ipfs://x");

    client.register(&creator, &id, &100i128, &metadata, &empty_tags(&env));
    assert!(client.exists(&id));
}

#[test]
fn get_missing_fails() {
    let (env, _creator, client) = setup();
    let res = client.try_get(&String::from_str(&env, "nope"));
    assert_eq!(res, Err(Ok(Error::NotFound)));
}

#[test]
fn set_price_updates_value() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r1");
    client.register(
        &creator,
        &id,
        &1_000_000i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    client.set_price(&id, &2_500_000i128);
    assert_eq!(client.get(&id).price, 2_500_000i128);

    assert_eq!(
        client.try_set_price(&id, &0i128),
        Err(Ok(Error::InvalidPrice))
    );
}
#[test]
fn set_price_emits_structured_event() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evtr1");
    let initial_price = 1_000_000i128;
    let updated_price = 2_500_000i128;

    client.register(
        &creator,
        &id,
        &initial_price,
        &String::from_str(&env, "ipfs://QmEventTest"),
        &empty_tags(&env),
    );

    client.set_price(&id, &updated_price);

    // Locate the `setprice` event by its leading topic symbol so the test is
    // robust against any other events emitted (e.g. from `register`).
    let setprice_sym = soroban_sdk::symbol_short!("setprice");
    let all_events = env.events().all();
    let (_, _topics, data) = (0..all_events.len())
        .map(|i| all_events.get(i).unwrap())
        .find(|(_id, topics, _data)| {
            if topics.is_empty() {
                return false;
            }
            let first: soroban_sdk::Symbol =
                soroban_sdk::FromVal::from_val(&env, &topics.get(0).unwrap());
            first == setprice_sym
        })
        .expect("setprice event not found");

    // Data must deserialise to PriceUpdated with the right field values.
    let payload = PriceUpdated::from_val(&env, &data);
    assert_eq!(payload.id, id);
    assert_eq!(payload.old_price, initial_price);
    assert_eq!(payload.new_price, updated_price);
    assert_eq!(payload.updater, creator);
}

#[test]
fn update_metadata_changes_pointer() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r2");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "https://example.com/old"),
        &empty_tags(&env),
    );

    let new_meta = String::from_str(&env, "ipfs://QmNew");
    client.update_metadata(&id, &new_meta);
    assert_eq!(client.get(&id).metadata, new_meta);
}

#[test]
fn ownership_can_transfer() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r3");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&id, &new_owner);
    assert_eq!(client.get(&id).creator, new_owner);
}

fn event_data_as_owners(
    events: &soroban_sdk::Vec<(Address, soroban_sdk::Vec<Val>, Val)>,
    topic0_str: &str,
) -> Option<(Address, Address)> {
    for i in 0..events.len() {
        let (_, topics, data) = events.get(i).unwrap();
        if topics.len() != 2 {
            continue;
        }
        let t0: Symbol =
            <Symbol as TryFromVal<Env, Val>>::try_from_val(events.env(), &topics.get(0).unwrap())
                .ok()?;
        if t0 != Symbol::new(events.env(), topic0_str) {
            continue;
        }
        let pair: (Address, Address) =
            <(Address, Address) as TryFromVal<Env, Val>>::try_from_val(events.env(), &data).ok()?;
        return Some(pair);
    }
    None
}

fn event_data_as_address(
    events: &soroban_sdk::Vec<(Address, soroban_sdk::Vec<Val>, Val)>,
    topic0_str: &str,
) -> Option<Address> {
    for i in 0..events.len() {
        let (_, topics, data) = events.get(i).unwrap();
        if topics.len() != 2 {
            continue;
        }
        let t0: Symbol =
            <Symbol as TryFromVal<Env, Val>>::try_from_val(events.env(), &topics.get(0).unwrap())
                .ok()?;
        if t0 != Symbol::new(events.env(), topic0_str) {
            continue;
        }
        let addr: Address =
            <Address as TryFromVal<Env, Val>>::try_from_val(events.env(), &data).ok()?;
        return Some(addr);
    }
    None
}

#[test]
fn transfer_ownership_event_contains_previous_and_new_owner() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evtxfer");
    let new_owner = Address::generate(&env);
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    client.transfer_ownership(&id, &new_owner);

    let (prev, new) = event_data_as_owners(&env.events().all(), "transfer")
        .expect("transfer event with (Address, Address) data not found");
    assert_eq!(prev, creator);
    assert_eq!(new, new_owner);
}

#[test]
fn propose_transfer_event_contains_owner_and_proposed() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evtpropose");
    let proposed = Address::generate(&env);
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    client.propose_transfer(&id, &proposed);

    let (owner, target) = event_data_as_owners(&env.events().all(), "propose")
        .expect("propose event with (Address, Address) data not found");
    assert_eq!(owner, creator);
    assert_eq!(target, proposed);
}

#[test]
fn accept_transfer_event_contains_previous_and_new_owner() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evtaccept");
    let new_owner = Address::generate(&env);
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    client.propose_transfer(&id, &new_owner);
    env.mock_all_auths();
    client.accept_transfer(&id);

    let events = env.events().all();
    let mut last_transfer_data: Option<Val> = None;
    for i in 0..events.len() {
        let (_, topics, data) = events.get(i).unwrap();
        if topics.len() == 2
            && <Symbol as TryFromVal<Env, Val>>::try_from_val(&env, &topics.get(0).unwrap())
                == Ok(Symbol::new(&env, "transfer"))
        {
            last_transfer_data = Some(data);
        }
    }
    let accept_data = last_transfer_data
        .as_ref()
        .expect("accept transfer event not found");
    let (prev, new): (Address, Address) =
        <(Address, Address) as TryFromVal<Env, Val>>::try_from_val(&env, accept_data)
            .expect("accept event data should decode to (Address, Address)");
    assert_eq!(prev, creator);
    assert_eq!(new, new_owner);
}

#[test]
fn cancel_transfer_event_contains_owner() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evtcancel");
    let proposed = Address::generate(&env);
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    client.propose_transfer(&id, &proposed);
    client.cancel_transfer(&id);

    let owner = event_data_as_address(&env.events().all(), "cancel")
        .expect("cancel event with Address data not found");
    assert_eq!(owner, creator);
}

#[test]
fn set_listed_toggles_listing_state() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r4");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    // Initially listed
    assert!(client.get(&id).listed);

    // Delist
    client.set_listed(&id, &false);
    assert!(!client.get(&id).listed);

    // Re-list
    client.set_listed(&id, &true);
    assert!(client.get(&id).listed);
}

#[test]
fn delist_convenience_method() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r5");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    // Initially listed
    assert!(client.get(&id).listed);

    // Delist using convenience method
    client.delist(&id);
    assert!(!client.get(&id).listed);
}

#[test]
fn set_price_preserves_other_fields() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r7");
    let metadata = String::from_str(&env, "ipfs://QmPreserve");
    client.register(&creator, &id, &100i128, &metadata, &empty_tags(&env));

    client.set_price(&id, &250i128);
    let resource = client.get(&id);

    assert_eq!(resource.price, 250i128);
    assert_eq!(resource.metadata, metadata);
    assert_eq!(resource.creator, creator);
    assert!(resource.listed);
}

#[test]
fn transfer_ownership_keeps_count_and_order() {
    let (env, creator, client) = setup();
    let ids = ["a", "b"];
    for id in &ids {
        client.register(
            &creator,
            &String::from_str(&env, id),
            &100i128,
            &String::from_str(&env, "ipfs://m"),
            &empty_tags(&env),
        );
    }

    let new_owner = Address::generate(&env);
    let id = String::from_str(&env, "a");
    client.transfer_ownership(&id, &new_owner);

    assert_eq!(client.count(), 2);
    let list = client.list(&0u32, &10u32);
    assert_eq!(list.get(0).unwrap().id, id);
    assert_eq!(list.get(0).unwrap().creator, new_owner);
    assert_eq!(list.get(1).unwrap().id, String::from_str(&env, "b"));
}

#[test]
fn update_metadata_preserves_price_and_creator() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r8");
    let original_metadata = String::from_str(&env, "ipfs://QmOriginal");
    client.register(
        &creator,
        &id,
        &500i128,
        &original_metadata,
        &empty_tags(&env),
    );

    let new_metadata = String::from_str(&env, "ipfs://QmUpdated");
    client.update_metadata(&id, &new_metadata);

    let resource = client.get(&id);
    assert_eq!(resource.metadata, new_metadata);
    assert_eq!(resource.price, 500i128);
    assert_eq!(resource.creator, creator);
}

#[test]
fn get_owner_returns_creator() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "ownertest");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    let owner = client.get_owner(&id);
    assert_eq!(owner, creator);
}

#[test]
fn get_owner_missing_fails() {
    let (env, _creator, client) = setup();
    let res = client.try_get_owner(&String::from_str(&env, "nope"));
    assert_eq!(res, Err(Ok(Error::NotFound)));
}

#[test]
fn get_owner_after_transfer() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "ownerxfer");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&id, &new_owner);

    assert_eq!(client.get_owner(&id), new_owner);
}

#[test]
fn set_listed_requires_creator_auth() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r6");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    // This should work fine since we mock all auths
    client.set_listed(&id, &false);
    assert!(!client.get(&id).listed);
}

#[test]
fn set_listed_on_missing_resource_fails() {
    let (env, _creator, client) = setup();
    let id = String::from_str(&env, "missing");

    let res = client.try_set_listed(&id, &false);
    assert_eq!(res, Err(Ok(Error::NotFound)));
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

#[test]
fn set_listed_event_emits_old_and_new_state_delist() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evdelist");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    // Start listed=true; calling set_listed(false) should emit (true, false)
    client.set_listed(&id, &false);

    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("setlisted"), id.clone()).into_val(&env),
                (true, false).into_val(&env),
            ),
        ]
    );
}

#[test]
fn set_listed_event_emits_old_and_new_state_relist() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evrelist");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    // Delist, then relist — check both events individually
    client.set_listed(&id, &false);
    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("setlisted"), id.clone()).into_val(&env),
                (true, false).into_val(&env),
            ),
        ]
    );

    client.set_listed(&id, &true);
    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("setlisted"), id.clone()).into_val(&env),
                (false, true).into_val(&env),
            ),
        ]
    );
}

#[test]
fn set_listed_event_no_op_same_state() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evnoop");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    // Set listed=true when already listed → expect (true, true)
    client.set_listed(&id, &true);

    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("setlisted"), id.clone()).into_val(&env),
                (true, true).into_val(&env),
            ),
        ]
    );
}

#[test]
fn delist_convenience_method_emits_old_and_new_state() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evdelist2");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    // delist() delegates to set_listed(false) — must emit (true, false)
    // with the "setlisted" topic symbol (not a separate "delist" topic).
    client.delist(&id);

    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("setlisted"), id.clone()).into_val(&env),
                (true, false).into_val(&env),
            ),
        ]
    );
}

#[test]
fn set_listed_and_delist_events_are_consistent() {
    // Both paths (set_listed(false) and delist()) must produce the same event
    // shape. This directly tests the acceptance criterion: "Events are
    // consistent for set_listed(false), delist, and relisting."
    let (env, creator, client) = setup();
    let id1 = String::from_str(&env, "evcons1");
    let id2 = String::from_str(&env, "evcons2");

    client.register(
        &creator,
        &id1,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    client.register(
        &creator,
        &id2,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    // Check that set_listed(false) and delist() emit identical (true, false) data.
    client.set_listed(&id1, &false);
    let ev_set_listed = env.events().all();
    assert_eq!(
        ev_set_listed,
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("setlisted"), id1.clone()).into_val(&env),
                (true, false).into_val(&env),
            ),
        ]
    );

    client.delist(&id2);
    let ev_delist = env.events().all();
    assert_eq!(
        ev_delist,
        soroban_sdk::vec![
            &env,
            (
                client.address.clone(),
                (symbol_short!("setlisted"), id2.clone()).into_val(&env),
                (true, false).into_val(&env),
            ),
        ]
    );
}

#[test]
fn list_empty_returns_empty() {
    let (_env, _creator, client) = setup();
    let page = client.list(&0u32, &20u32);
    assert_eq!(page.len(), 0);
}

#[test]
fn list_returns_all_in_insertion_order() {
    let (env, creator, client) = setup();
    let ids = ["a", "b", "c"];
    for id in &ids {
        client.register(
            &creator,
            &String::from_str(&env, id),
            &100i128,
            &String::from_str(&env, "ipfs://m"),
            &empty_tags(&env),
        );
    }

    let page = client.list(&0u32, &20u32);
    assert_eq!(page.len(), 3);
    assert_eq!(page.get(0).unwrap().id, String::from_str(&env, "a"));
    assert_eq!(page.get(1).unwrap().id, String::from_str(&env, "b"));
    assert_eq!(page.get(2).unwrap().id, String::from_str(&env, "c"));
}

fn metadata_of_len(env: &Env, len: u32) -> String {
    let prefix = "ipfs://";
    let prefix_len = prefix.len();
    assert!(len >= prefix_len as u32);
    let body_len = len - prefix_len as u32;
    let body = "a".repeat(body_len as usize);
    String::from_str(env, &(prefix.to_string() + &body))
}

#[test]
fn register_accepts_metadata_at_max_length() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "metamax");
    let metadata = metadata_of_len(&env, MAX_METADATA_POINTER_LEN);
    client.register(&creator, &id, &100i128, &metadata, &empty_tags(&env));
    assert_eq!(client.get(&id).metadata.len(), MAX_METADATA_POINTER_LEN);
}

#[test]
fn register_rejects_metadata_over_max_length() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "metalong");
    let metadata = metadata_of_len(&env, MAX_METADATA_POINTER_LEN + 1);
    assert_eq!(
        client.try_register(&creator, &id, &100i128, &metadata, &empty_tags(&env)),
        Err(Ok(Error::MetadataTooLong))
    );
    assert!(!client.exists(&id));
}

#[test]
fn update_metadata_accepts_at_max_length() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "metaupdok");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://short"),
        &empty_tags(&env),
    );
    let metadata = metadata_of_len(&env, MAX_METADATA_POINTER_LEN);
    client.update_metadata(&id, &metadata);
    assert_eq!(client.get(&id).metadata.len(), MAX_METADATA_POINTER_LEN);
}

#[test]
fn update_metadata_rejects_over_max_length() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "metaupdbad");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ar://short"),
        &empty_tags(&env),
    );
    let metadata = metadata_of_len(&env, MAX_METADATA_POINTER_LEN + 1);
    assert_eq!(
        client.try_update_metadata(&id, &metadata),
        Err(Ok(Error::MetadataTooLong))
    );
    assert_eq!(
        client.get(&id).metadata,
        String::from_str(&env, "ar://short")
    );
}

fn register_n(env: &Env, creator: &Address, client: &VaultRegistryClient<'_>, ids: &[&str]) {
    for id in ids {
        client.register(
            creator,
            &String::from_str(env, id),
            &100i128,
            &String::from_str(env, "ipfs://m"),
            &empty_tags(env),
        );
    }
}

#[test]
fn list_pagination_first_page() {
    let (env, creator, client) = setup();
    register_n(&env, &creator, &client, &["r0", "r1", "r2", "r3", "r4"]);

    let page = client.list(&0u32, &3u32);
    assert_eq!(page.len(), 3);
    assert_eq!(page.get(0).unwrap().id, String::from_str(&env, "r0"));
    assert_eq!(page.get(2).unwrap().id, String::from_str(&env, "r2"));
}

#[test]
fn list_pagination_second_page() {
    let (env, creator, client) = setup();
    register_n(&env, &creator, &client, &["r0", "r1", "r2", "r3", "r4"]);

    let page = client.list(&3u32, &3u32);
    assert_eq!(page.len(), 2); // only r3, r4 remain
    assert_eq!(page.get(0).unwrap().id, String::from_str(&env, "r3"));
    assert_eq!(page.get(1).unwrap().id, String::from_str(&env, "r4"));
}

#[test]
fn list_start_beyond_count_returns_empty() {
    let (env, creator, client) = setup();
    client.register(
        &creator,
        &String::from_str(&env, "x"),
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    let page = client.list(&99u32, &10u32);
    assert_eq!(page.len(), 0);
}

#[test]
fn register_extends_resource_storage_ttl() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "ttlregister");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    assert_eq!(
        resource_storage_ttl(&env, &client.address, &id),
        TTL_BUMP_AMOUNT
    );
}

#[test]
fn set_price_reextends_resource_ttl() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "ttlprice");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + DAY_IN_LEDGERS);
    assert_eq!(
        resource_storage_ttl(&env, &client.address, &id),
        TTL_BUMP_AMOUNT - DAY_IN_LEDGERS
    );

    client.set_price(&id, &200i128);
    assert_eq!(
        resource_storage_ttl(&env, &client.address, &id),
        TTL_BUMP_AMOUNT
    );
}

#[test]
fn update_metadata_reextends_resource_ttl() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "ttlmeta");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "https://example.com/old"),
        &empty_tags(&env),
    );
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + DAY_IN_LEDGERS);

    client.update_metadata(&id, &String::from_str(&env, "https://example.com/new"));
    assert_eq!(
        resource_storage_ttl(&env, &client.address, &id),
        TTL_BUMP_AMOUNT
    );
}

#[test]
fn transfer_ownership_reextends_resource_ttl() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "ttlxfer");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    env.ledger()
        .set_sequence_number(env.ledger().sequence() + DAY_IN_LEDGERS);

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&id, &new_owner);
    assert_eq!(
        resource_storage_ttl(&env, &client.address, &id),
        TTL_BUMP_AMOUNT
    );
}

#[test]
fn list_limit_capped_at_20() {
    let (env, creator, client) = setup();
    let ids = [
        "i00", "i01", "i02", "i03", "i04", "i05", "i06", "i07", "i08", "i09", "i10", "i11", "i12",
        "i13", "i14", "i15", "i16", "i17", "i18", "i19", "i20", "i21", "i22", "i23", "i24",
    ];
    register_n(&env, &creator, &client, &ids);

    // Requesting 25 items should be silently capped to 20.
    let page = client.list(&0u32, &25u32);
    assert_eq!(page.len(), 20);
}

#[test]
fn list_listed_excludes_delisted() {
    let (env, creator, client) = setup();
    register_n(&env, &creator, &client, &["a", "b", "c"]);

    client.set_listed(&String::from_str(&env, "b"), &false);

    let page = client.list_listed(&0u32, &20u32);
    assert_eq!(page.len(), 2);
    assert_eq!(page.get(0).unwrap().id, String::from_str(&env, "a"));
    assert_eq!(page.get(1).unwrap().id, String::from_str(&env, "c"));
}

#[test]
fn list_listed_empty_when_no_resources() {
    let (_env, _creator, client) = setup();
    let page = client.list_listed(&0u32, &20u32);
    assert_eq!(page.len(), 0);
}

#[test]
fn list_listed_relisted_reappears() {
    let (env, creator, client) = setup();
    register_n(&env, &creator, &client, &["a", "b"]);

    client.set_listed(&String::from_str(&env, "b"), &false);
    assert_eq!(client.list_listed(&0u32, &20u32).len(), 1);

    client.set_listed(&String::from_str(&env, "b"), &true);
    assert_eq!(client.list_listed(&0u32, &20u32).len(), 2);
}

#[test]
fn list_listed_pagination_first_page() {
    let (env, creator, client) = setup();
    register_n(&env, &creator, &client, &["a", "b", "c", "d", "e"]);

    client.set_listed(&String::from_str(&env, "b"), &false);
    client.set_listed(&String::from_str(&env, "d"), &false);

    let page = client.list_listed(&0u32, &2u32);
    assert_eq!(page.len(), 2);
    assert_eq!(page.get(0).unwrap().id, String::from_str(&env, "a"));
    assert_eq!(page.get(1).unwrap().id, String::from_str(&env, "c"));
}

#[test]
fn list_listed_pagination_second_page() {
    let (env, creator, client) = setup();
    register_n(&env, &creator, &client, &["a", "b", "c", "d", "e"]);

    client.set_listed(&String::from_str(&env, "b"), &false);

    let page = client.list_listed(&2u32, &2u32);
    assert_eq!(page.len(), 2);
    assert_eq!(page.get(0).unwrap().id, String::from_str(&env, "c"));
    assert_eq!(page.get(1).unwrap().id, String::from_str(&env, "d"));
}

#[test]
fn list_listed_start_beyond_listed_items_returns_empty() {
    let (env, creator, client) = setup();
    register_n(&env, &creator, &client, &["a", "b"]);

    let page = client.list_listed(&20u32, &10u32);
    assert_eq!(page.len(), 0);
}

#[test]
fn list_listed_limit_capped_at_20() {
    let (env, creator, client) = setup();
    let ids: [&str; 25] = [
        "i0", "i1", "i2", "i3", "i4", "i5", "i6", "i7", "i8", "i9", "i10", "i11", "i12", "i13",
        "i14", "i15", "i16", "i17", "i18", "i19", "i20", "i21", "i22", "i23", "i24",
    ];
    register_n(&env, &creator, &client, &ids);

    // Delist the last 5 so result length can be reached only by traversing the cap.
    for idx in [20, 21, 22, 23, 24] {
        client.set_listed(&String::from_str(&env, ids[idx]), &false);
    }

    let page = client.list_listed(&0u32, &25u32);
    assert_eq!(page.len(), 20);
}

#[test]
fn list_page_empty_is_end_of_list() {
    let (_env, _creator, client) = setup();
    let page = client.list_page(&0u32, &20u32);
    assert_eq!(page.items.len(), 0);
    assert_eq!(page.next_cursor, None);
}

#[test]
fn list_page_exposes_next_cursor_then_end() {
    let (env, creator, client) = setup();
    register_n(&env, &creator, &client, &["r0", "r1", "r2", "r3", "r4"]);

    let first = client.list_page(&0u32, &3u32);
    assert_eq!(first.items.len(), 3);
    assert_eq!(first.items.get(0).unwrap().id, String::from_str(&env, "r0"));
    assert_eq!(first.items.get(2).unwrap().id, String::from_str(&env, "r2"));
    assert_eq!(first.next_cursor, Some(3u32));

    let second = client.list_page(&first.next_cursor.unwrap(), &3u32);
    assert_eq!(second.items.len(), 2);
    assert_eq!(
        second.items.get(0).unwrap().id,
        String::from_str(&env, "r3")
    );
    assert_eq!(
        second.items.get(1).unwrap().id,
        String::from_str(&env, "r4")
    );
    assert_eq!(second.next_cursor, None);
}

#[test]
fn list_page_cursor_past_end_is_empty_end_of_list() {
    let (env, creator, client) = setup();
    client.register(
        &creator,
        &String::from_str(&env, "x"),
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    let page = client.list_page(&99u32, &10u32);
    assert_eq!(page.items.len(), 0);
    assert_eq!(page.next_cursor, None);
}

#[test]
fn list_page_exact_page_boundary_is_end_of_list() {
    let (env, creator, client) = setup();
    register_n(&env, &creator, &client, &["a", "b", "c"]);

    let page = client.list_page(&0u32, &3u32);
    assert_eq!(page.items.len(), 3);
    assert_eq!(page.next_cursor, None);
}

#[test]
fn list_delegates_to_list_page_items() {
    let (env, creator, client) = setup();
    register_n(&env, &creator, &client, &["r0", "r1", "r2", "r3", "r4"]);

    let body = client.list(&0u32, &3u32);
    let page = client.list_page(&0u32, &3u32);
    assert_eq!(body.len(), page.items.len());
    assert_eq!(body.get(0).unwrap().id, page.items.get(0).unwrap().id);
    assert_eq!(body.get(2).unwrap().id, page.items.get(2).unwrap().id);
}

#[test]
fn list_page_limit_capped_at_20_with_next_cursor() {
    let (env, creator, client) = setup();
    let ids = [
        "i00", "i01", "i02", "i03", "i04", "i05", "i06", "i07", "i08", "i09", "i10", "i11", "i12",
        "i13", "i14", "i15", "i16", "i17", "i18", "i19", "i20", "i21", "i22", "i23", "i24",
    ];
    register_n(&env, &creator, &client, &ids);

    let page = client.list_page(&0u32, &25u32);
    assert_eq!(page.items.len(), 20);
    assert_eq!(page.next_cursor, Some(20u32));
}

#[test]
fn register_with_tags_stores_labels() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "tagged");
    let metadata = String::from_str(&env, "ipfs://QmTagged");
    let resource_tags = tags(&env, &["dataset", "research"]);

    client.register(&creator, &id, &100i128, &metadata, &resource_tags);

    let r = client.get(&id);
    assert_eq!(r.metadata, metadata);
    assert_eq!(r.tags.len(), 2);
    assert_eq!(r.tags.get(0).unwrap(), String::from_str(&env, "dataset"));
    assert_eq!(r.tags.get(1).unwrap(), String::from_str(&env, "research"));
}

#[test]
fn set_tags_updates_value_without_touching_metadata() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "tagupdate");
    let metadata = String::from_str(&env, "ipfs://QmKeepMeta");
    client.register(&creator, &id, &100i128, &metadata, &empty_tags(&env));

    let new_tags = tags(&env, &["finance", "api"]);
    client.set_tags(&id, &new_tags);

    let r = client.get(&id);
    assert_eq!(r.metadata, metadata);
    assert_eq!(r.tags.len(), 2);
    assert_eq!(r.tags.get(0).unwrap(), String::from_str(&env, "finance"));
}

#[test]
fn invalid_metadata_pointer_rejected() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "badpointer");
    let metadata = String::from_str(&env, "not-a-supported-pointer");

    assert_eq!(
        client.try_register(&creator, &id, &100i128, &metadata, &empty_tags(&env)),
        Err(Ok(Error::InvalidMetadataPointer))
    );
    assert!(!client.exists(&id));
}

#[test]
fn invalid_tag_rejected() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "badtag");
    let metadata = String::from_str(&env, "ipfs://m");
    let empty = String::from_str(&env, "");
    let mut bad = Vec::new(&env);
    bad.push_back(empty);

    assert_eq!(
        client.try_register(&creator, &id, &100i128, &metadata, &bad),
        Err(Ok(Error::InvalidTag))
    );
    assert!(!client.exists(&id));

    client.register(&creator, &id, &100i128, &metadata, &empty_tags(&env));
    assert_eq!(client.try_set_tags(&id, &bad), Err(Ok(Error::InvalidTag)));
}

#[test]
fn admin_transfer_nominate_then_accept() {
    let (env, _creator, client) = setup();
    let initial_admin = Address::generate(&env);
    let new_admin = Address::generate(&env);

    // Set initial admin
    assert_eq!(client.admin(), None);
    client.nominate_new_admin(&initial_admin);
    assert_eq!(client.admin(), Some(initial_admin.clone()));
    assert_eq!(client.pending_admin(), None);

    // Nominate new admin
    client.nominate_new_admin(&new_admin);
    assert_eq!(client.admin(), Some(initial_admin.clone()));
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));

    // Accept admin nomination
    client.accept_admin(&new_admin);
    assert_eq!(client.admin(), Some(new_admin));
    assert_eq!(client.pending_admin(), None);
}

#[test]
fn accept_admin_rejects_wrong_caller() {
    let (env, _creator, client) = setup();
    let admin = Address::generate(&env);
    let pending = Address::generate(&env);
    let wrong = Address::generate(&env);

    client.nominate_new_admin(&admin);
    client.nominate_new_admin(&pending);

    assert_eq!(
        client.try_accept_admin(&wrong),
        Err(Ok(Error::PendingAdminNotSet))
    );
    assert_eq!(client.admin(), Some(admin));
    assert_eq!(client.pending_admin(), Some(pending));
}

#[test]
fn accept_admin_without_pending_returns_not_set() {
    let (env, _creator, client) = setup();
    let caller = Address::generate(&env);

    assert_eq!(
        client.try_accept_admin(&caller),
        Err(Ok(Error::PendingAdminNotSet))
    );
}

#[test]
fn nominate_new_admin_rejects_same_address() {
    let (env, _creator, client) = setup();
    let admin = Address::generate(&env);

    client.nominate_new_admin(&admin);
    assert_eq!(
        client.try_nominate_new_admin(&admin),
        Err(Ok(Error::SameAdmin))
    );
}

#[test]
fn nominate_new_admin_rejects_pending_already_set() {
    let (env, _creator, client) = setup();
    let admin = Address::generate(&env);
    let pending1 = Address::generate(&env);
    let pending2 = Address::generate(&env);

    client.nominate_new_admin(&admin);
    client.nominate_new_admin(&pending1);

    assert_eq!(
        client.try_nominate_new_admin(&pending2),
        Err(Ok(Error::PendingAdminAlreadySet))
    );
}

#[test]
fn register_rejects_empty_metadata() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "emptymeta");
    let metadata = String::from_str(&env, "");
    assert_eq!(
        client.try_register(&creator, &id, &100i128, &metadata, &empty_tags(&env)),
        Err(Ok(Error::EmptyMetadata))
    );
    assert!(!client.exists(&id));
}

#[test]
fn update_metadata_rejects_empty() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "updempty");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://valid"),
        &empty_tags(&env),
    );
    let empty = String::from_str(&env, "");
    assert_eq!(
        client.try_update_metadata(&id, &empty),
        Err(Ok(Error::EmptyMetadata))
    );
    assert_eq!(
        client.get(&id).metadata,
        String::from_str(&env, "ipfs://valid")
    );
}

// ---------------------------------------------------------------------------
// update_metadata event tests
// ---------------------------------------------------------------------------

/// Extract all "updmeta" events emitted by `contract_id` from the environment,
/// decoded as `MetadataUpdateEvent`.
fn collect_updmeta_events(
    env: &Env,
    contract_id: &soroban_sdk::Address,
) -> soroban_sdk::Vec<MetadataUpdateEvent> {
    use soroban_sdk::{FromVal, Symbol};
    let all = env.events().all();
    let mut result: soroban_sdk::Vec<MetadataUpdateEvent> = soroban_sdk::Vec::new(env);
    for i in 0..all.len() {
        let (cid, topics, data) = all.get(i).unwrap();
        if cid != *contract_id || topics.is_empty() {
            continue;
        }
        // topics.get(0) is a Val. Try to decode it as a Symbol and compare.
        let first_topic_val: soroban_sdk::Val = topics.get(0).unwrap();
        let Ok(sym) = Symbol::try_from_val(env, &first_topic_val) else {
            continue;
        };
        if sym != symbol_short!("updmeta") {
            continue;
        }
        let event = MetadataUpdateEvent::from_val(env, &data);
        result.push_back(event);
    }
    result
}

#[test]
fn update_metadata_emits_structured_event_with_old_and_new() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "eventtest");
    let old_meta = String::from_str(&env, "ipfs://QmOld");
    let new_meta = String::from_str(&env, "ipfs://QmNew");

    client.register(&creator, &id, &100i128, &old_meta, &empty_tags(&env));
    client.update_metadata(&id, &new_meta);

    let events = collect_updmeta_events(&env, &client.address);
    assert_eq!(events.len(), 1, "expected exactly one updmeta event");

    let event = events.get(0).unwrap();
    assert_eq!(event.id, id);
    assert_eq!(event.old_metadata, old_meta);
    assert_eq!(event.new_metadata, new_meta);
}

#[test]
fn update_metadata_event_old_metadata_matches_prior_state() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evtchain");
    let meta_v1 = String::from_str(&env, "ipfs://QmV1");
    let meta_v2 = String::from_str(&env, "ipfs://QmV2");
    let meta_v3 = String::from_str(&env, "ipfs://QmV3");

    client.register(&creator, &id, &100i128, &meta_v1, &empty_tags(&env));

    // First update: v1 → v2; check event immediately after this invocation.
    client.update_metadata(&id, &meta_v2);
    {
        let events = collect_updmeta_events(&env, &client.address);
        assert_eq!(
            events.len(),
            1,
            "expected one updmeta event after first update"
        );
        let e = events.get(0).unwrap();
        assert_eq!(e.old_metadata, meta_v1);
        assert_eq!(e.new_metadata, meta_v2);
    }

    // Second update: v2 → v3; old_metadata in the event must be v2.
    client.update_metadata(&id, &meta_v3);
    {
        let events = collect_updmeta_events(&env, &client.address);
        assert_eq!(
            events.len(),
            1,
            "expected one updmeta event after second update"
        );
        let e = events.get(0).unwrap();
        assert_eq!(e.old_metadata, meta_v2);
        assert_eq!(e.new_metadata, meta_v3);
    }
}

#[test]
fn update_metadata_event_id_matches_resource_id() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evtidcheck");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    client.update_metadata(&id, &String::from_str(&env, "ipfs://QmEvtId"));

    let events = collect_updmeta_events(&env, &client.address);
    assert_eq!(events.len(), 1);
    let event = events.get(0).unwrap();
    assert_eq!(event.id, id);
}

#[test]
fn update_metadata_failed_validation_emits_no_event() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "evtnoemit");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://valid"),
        &empty_tags(&env),
    );
    let empty = String::from_str(&env, "");
    assert_eq!(
        client.try_update_metadata(&id, &empty),
        Err(Ok(Error::EmptyMetadata))
    );
    assert_eq!(
        client.get(&id).metadata,
        String::from_str(&env, "ipfs://valid")
    );

    let too_long = metadata_of_len(&env, MAX_METADATA_POINTER_LEN + 1);
    assert_eq!(
        client.try_update_metadata(&id, &too_long),
        Err(Ok(Error::MetadataTooLong))
    );

    // No updmeta event should be emitted when the call fails.
    let events = collect_updmeta_events(&env, &client.address);
    assert_eq!(
        events.len(),
        0,
        "failed update_metadata must not emit any updmeta event"
    );
}

#[test]
fn update_metadata_state_not_mutated_on_failed_call() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "nostatechange");
    let original = String::from_str(&env, "ipfs://QmOriginal");
    client.register(&creator, &id, &100i128, &original, &empty_tags(&env));

    // Attempt an invalid update (too long).
    let too_long = metadata_of_len(&env, MAX_METADATA_POINTER_LEN + 1);
    let _ = client.try_update_metadata(&id, &too_long);

    // State must be unchanged.
    let r = client.get(&id);
    assert_eq!(
        r.metadata, original,
        "metadata must not change when update_metadata returns an error"
    );
    assert_eq!(r.price, 100i128);
    assert_eq!(r.creator, creator);
}

/// Assert core registry invariants after mixed ops.
///
/// Checks:
/// - `count` equals the number of successfully registered ids (monotonic)
/// - insertion-index order is preserved by `list(0, count)`
/// - `exists` / `get` / `get_owner` agree with tracked ownership
/// - listing, tags, and price match the tracked expected state
fn assert_registry_invariants(
    client: &VaultRegistryClient,
    expected_ids: &[String],
    expected_owners: &[Address],
    expected_prices: &[i128],
    expected_listed: &[bool],
    expected_tags: &[Vec<String>],
) {
    let n = expected_ids.len() as u32;
    assert_eq!(
        client.count(),
        n,
        "count must equal number of successful registrations"
    );

    let page = client.list(&0u32, &n.max(1));
    assert_eq!(page.len(), n, "list must return all registered resources");
    for i in 0..expected_ids.len() {
        let r = page.get(i as u32).unwrap();
        assert_eq!(r.id, expected_ids[i], "index order broken at {i}");
        assert_eq!(r.creator, expected_owners[i], "owner mismatch at {i}");
        assert_eq!(r.price, expected_prices[i], "price mismatch at {i}");
        assert_eq!(r.listed, expected_listed[i], "listed mismatch at {i}");
        assert_eq!(r.tags, expected_tags[i], "tags mismatch at {i}");

        assert!(client.exists(&expected_ids[i]));
        let got = client.get(&expected_ids[i]);
        assert_eq!(got, r);
        assert_eq!(client.get_owner(&expected_ids[i]), expected_owners[i]);
    }
}

/// Focused invariant suite: mixed register / transfer / tag / listing / price
/// ops, asserting core registry invariants after each step. Failure cases are
/// deterministic and must not corrupt count, index order, ownership, listing,
/// or tags.
#[test]
fn registry_invariant_suite_mixed_ops() {
    let (env, alice, client) = setup();
    let bob = Address::generate(&env);

    // Empty registry baseline.
    assert_eq!(client.count(), 0);
    assert_eq!(client.list(&0u32, &20u32).len(), 0);

    // ── Step 1: register r0 under alice ──────────────────────────────────────
    let r0 = String::from_str(&env, "invr0");
    let tags0 = tags(&env, &["dataset"]);
    client.register(
        &alice,
        &r0,
        &1_000i128,
        &String::from_str(&env, "ipfs://r0"),
        &tags0,
    );
    assert_registry_invariants(
        &client,
        core::slice::from_ref(&r0),
        core::slice::from_ref(&alice),
        &[1_000],
        &[true],
        core::slice::from_ref(&tags0),
    );

    // ── Step 2: register r1 under alice ──────────────────────────────────────
    let r1 = String::from_str(&env, "invr1");
    let empty0 = empty_tags(&env);
    client.register(
        &alice,
        &r1,
        &2_000i128,
        &String::from_str(&env, "ipfs://r1"),
        &empty0,
    );
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone()],
        &[alice.clone(), alice.clone()],
        &[1_000, 2_000],
        &[true, true],
        &[tags0.clone(), empty0.clone()],
    );

    // ── Step 3: transfer ownership of r0 → bob (count/order unchanged) ────────
    client.transfer_ownership(&r0, &bob);
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone()],
        &[bob.clone(), alice.clone()],
        &[1_000, 2_000],
        &[true, true],
        &[tags0.clone(), empty0.clone()],
    );

    // ── Step 4: set tags on r1 ───────────────────────────────────────────────
    let tags1 = tags(&env, &["research", "alpha"]);
    client.set_tags(&r1, &tags1);
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone()],
        &[bob.clone(), alice.clone()],
        &[1_000, 2_000],
        &[true, true],
        &[tags0.clone(), tags1.clone()],
    );

    // ── Step 5: delist r1 (listing only) ─────────────────────────────────────
    client.delist(&r1);
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone()],
        &[bob.clone(), alice.clone()],
        &[1_000, 2_000],
        &[true, false],
        &[tags0.clone(), tags1.clone()],
    );

    // ── Step 6: set_price on r0 (bob is owner) ───────────────────────────────
    client.set_price(&r0, &9_999i128);
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone()],
        &[bob.clone(), alice.clone()],
        &[9_999, 2_000],
        &[true, false],
        &[tags0.clone(), tags1.clone()],
    );

    // ── Step 7: re-list r1 ───────────────────────────────────────────────────
    client.set_listed(&r1, &true);
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone()],
        &[bob.clone(), alice.clone()],
        &[9_999, 2_000],
        &[true, true],
        &[tags0.clone(), tags1.clone()],
    );

    // ── Step 8: register r2 under bob ────────────────────────────────────────
    let r2 = String::from_str(&env, "invr2");
    let tags2 = tags(&env, &["beta"]);
    client.register(
        &bob,
        &r2,
        &500i128,
        &String::from_str(&env, "ipfs://r2"),
        &tags2,
    );
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone(), r2.clone()],
        &[bob.clone(), alice.clone(), bob.clone()],
        &[9_999, 2_000, 500],
        &[true, true, true],
        &[tags0.clone(), tags1.clone(), tags2.clone()],
    );

    // ── Deterministic failure cases — must not corrupt invariants ────────────

    // Duplicate registration does not change count / order / state.
    assert_eq!(
        client.try_register(
            &alice,
            &r1,
            &1i128,
            &String::from_str(&env, "ipfs://x"),
            &empty_tags(&env)
        ),
        Err(Ok(Error::AlreadyRegistered))
    );
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone(), r2.clone()],
        &[bob.clone(), alice.clone(), bob.clone()],
        &[9_999, 2_000, 500],
        &[true, true, true],
        &[tags0.clone(), tags1.clone(), tags2.clone()],
    );

    // Invalid price on set_price leaves prior price intact.
    assert_eq!(
        client.try_set_price(&r0, &0i128),
        Err(Ok(Error::InvalidPrice))
    );
    assert_eq!(
        client.try_set_price(&r0, &-1i128),
        Err(Ok(Error::InvalidPrice))
    );
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone(), r2.clone()],
        &[bob.clone(), alice.clone(), bob.clone()],
        &[9_999, 2_000, 500],
        &[true, true, true],
        &[tags0.clone(), tags1.clone(), tags2.clone()],
    );

    // Invalid tags rejected; prior tags preserved.
    let too_many = tags(
        &env,
        &["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9"],
    );
    assert_eq!(
        client.try_set_tags(&r1, &too_many),
        Err(Ok(Error::InvalidTag))
    );
    let empty_tag = {
        let mut v = Vec::new(&env);
        v.push_back(String::from_str(&env, ""));
        v
    };
    assert_eq!(
        client.try_set_tags(&r1, &empty_tag),
        Err(Ok(Error::InvalidTag))
    );
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone(), r2.clone()],
        &[bob.clone(), alice.clone(), bob.clone()],
        &[9_999, 2_000, 500],
        &[true, true, true],
        &[tags0.clone(), tags1.clone(), tags2.clone()],
    );

    // Missing resource lookups are deterministic NotFound.
    let missing = String::from_str(&env, "nosuchresource");
    assert_eq!(client.try_get(&missing), Err(Ok(Error::NotFound)));
    assert_eq!(client.try_get_owner(&missing), Err(Ok(Error::NotFound)));
    assert!(!client.exists(&missing));
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone(), r2.clone()],
        &[bob.clone(), alice.clone(), bob.clone()],
        &[9_999, 2_000, 500],
        &[true, true, true],
        &[tags0.clone(), tags1.clone(), tags2.clone()],
    );

    // Clear tags on r0 (owned by bob) and transfer r2 back to alice.
    let empty1 = empty_tags(&env);
    client.set_tags(&r0, &empty1);
    client.transfer_ownership(&r2, &alice);
    assert_registry_invariants(
        &client,
        &[r0.clone(), r1.clone(), r2.clone()],
        &[bob.clone(), alice.clone(), alice.clone()],
        &[9_999, 2_000, 500],
        &[true, true, true],
        &[empty1.clone(), tags1.clone(), tags2.clone()],
    );

    // Final: count is still exactly 3 (no ghost entries from failures).
    assert_eq!(client.count(), 3);
}

#[test]
fn creator_resource_count_starts_at_zero() {
    let (_env, creator, client) = setup();
    assert_eq!(client.creator_resource_count(&creator), 0);
}

#[test]
fn creator_resource_count_increments_on_register() {
    let (env, creator, client) = setup();
    client.register(
        &creator,
        &String::from_str(&env, "r1"),
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    assert_eq!(client.creator_resource_count(&creator), 1);

    client.register(
        &creator,
        &String::from_str(&env, "r2"),
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    assert_eq!(client.creator_resource_count(&creator), 2);

    // Failed duplicate does not inflate count.
    let dup = String::from_str(&env, "r1");
    assert_eq!(
        client.try_register(
            &creator,
            &dup,
            &100i128,
            &String::from_str(&env, "ipfs://m"),
            &empty_tags(&env)
        ),
        Err(Ok(Error::AlreadyRegistered)),
    );
    assert_eq!(client.creator_resource_count(&creator), 2);
}

#[test]
fn creator_resource_count_moves_on_transfer_ownership() {
    let (env, creator, client) = setup();
    let new_owner = Address::generate(&env);

    client.register(
        &creator,
        &String::from_str(&env, "r1"),
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    client.register(
        &creator,
        &String::from_str(&env, "r2"),
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    assert_eq!(client.creator_resource_count(&creator), 2);
    assert_eq!(client.creator_resource_count(&new_owner), 0);

    client.transfer_ownership(&String::from_str(&env, "r1"), &new_owner);

    assert_eq!(client.creator_resource_count(&creator), 1);
    assert_eq!(client.creator_resource_count(&new_owner), 1);

    // Global count stays monotonic.
    assert_eq!(client.count(), 2);
}

#[test]
fn creator_resource_count_zero_for_unrelated_creator() {
    let (env, creator_a, client) = setup();
    let creator_b = Address::generate(&env);

    client.register(
        &creator_a,
        &String::from_str(&env, "r1"),
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    // Creator B never registered anything; 0 expected.
    assert_eq!(client.creator_resource_count(&creator_b), 0);
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]
    #[test]
    fn test_metadata_pointer_roundtrip_property(
        id_str in r"[a-z0-9]{1,24}",
        price in 1..1000000000000i128,
        price_2 in 1..1000000000000i128,
        meta_str in r"[a-zA-Z0-9:/\\._-]{1,500}",
        meta_str_2 in r"[a-zA-Z0-9:/\\._-]{1,500}",
        listed in any::<bool>(),
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(VaultRegistry, ());
        let client = VaultRegistryClient::new(&env, &contract_id);
        let creator = Address::generate(&env);

        let id = String::from_str(&env, &id_str);
        let metadata = String::from_str(&env, &format!("ipfs://{}", meta_str));
        let metadata_2 = String::from_str(&env, &format!("https://{}", meta_str_2));

        client.register(&creator, &id, &price, &metadata, &empty_tags(&env));

        let r = client.get(&id);
        assert_eq!(r.metadata, metadata);
        assert_eq!(r.price, price);
        assert_eq!(r.creator, creator);
        assert!(r.listed);

        client.update_metadata(&id, &metadata_2);

        let r2 = client.get(&id);
        assert_eq!(r2.metadata, metadata_2);
        assert_eq!(r2.price, price);
        assert_eq!(r2.creator, creator);
        assert!(r2.listed);

        client.set_price(&id, &price_2);
        let r3 = client.get(&id);
        assert_eq!(r3.metadata, metadata_2);
        assert_eq!(r3.price, price_2);

        client.set_listed(&id, &listed);
        let r4 = client.get(&id);
        assert_eq!(r4.metadata, metadata_2);
        assert_eq!(r4.listed, listed);
    }
}

// ── Tag removal event semantics (#362) ──────────────────────────────────────

#[test]
fn set_tags_event_includes_prev_and_next() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "eventtest");
    let metadata = String::from_str(&env, "ipfs://m");

    // Register with initial tags
    let initial_tags = tags(&env, &["data", "research"]);
    client.register(&creator, &id, &100i128, &metadata, &initial_tags);

    // Replace with new tags
    let new_tags = tags(&env, &["finance", "api"]);
    client.set_tags(&id, &new_tags);

    // Verify event contains both prev and next tags
    let events = env.events().all();
    let last_event = events.last().unwrap();

    // Event structure: (contract_address, topics_vec, data)
    // topics=(symbol_short!("settags"), id), data=(prev_tags, new_tags)
    let (_contract, topics, data): (
        Address,
        soroban_sdk::Vec<soroban_sdk::Val>,
        soroban_sdk::Val,
    ) = last_event;

    // Decode topics: [symbol_short!("settags"), id]
    assert_eq!(topics.len(), 2);

    // Decode data as tuple: (prev_tags, new_tags)
    let (prev_tags, next_tags): (Vec<String>, Vec<String>) = data.try_into_val(&env).unwrap();

    assert_eq!(prev_tags.len(), 2);
    assert_eq!(prev_tags.get(0).unwrap(), String::from_str(&env, "data"));
    assert_eq!(
        prev_tags.get(1).unwrap(),
        String::from_str(&env, "research")
    );

    assert_eq!(next_tags.len(), 2);
    assert_eq!(next_tags.get(0).unwrap(), String::from_str(&env, "finance"));
    assert_eq!(next_tags.get(1).unwrap(), String::from_str(&env, "api"));
}

#[test]
fn set_tags_event_supports_tag_removal() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "removaltest");
    let metadata = String::from_str(&env, "ipfs://m");

    // Register with multiple tags
    let initial_tags = tags(&env, &["tag1", "tag2", "tag3"]);
    client.register(&creator, &id, &100i128, &metadata, &initial_tags);

    // Clear all tags
    let empty = empty_tags(&env);
    client.set_tags(&id, &empty);

    // Verify event shows previous tags and empty next tags
    let events = env.events().all();
    let last_event = events.last().unwrap();
    let (_, _, data): (
        Address,
        soroban_sdk::Vec<soroban_sdk::Val>,
        soroban_sdk::Val,
    ) = last_event;

    let (prev_tags, next_tags): (Vec<String>, Vec<String>) = data.try_into_val(&env).unwrap();
    assert_eq!(prev_tags.len(), 3);
    assert_eq!(next_tags.len(), 0);
}

#[test]
fn set_tags_event_supports_tag_addition() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "additiontest");
    let metadata = String::from_str(&env, "ipfs://m");

    // Register with no tags
    client.register(&creator, &id, &100i128, &metadata, &empty_tags(&env));

    // Add tags
    let new_tags = tags(&env, &["first", "second"]);
    client.set_tags(&id, &new_tags);

    // Verify event shows empty previous and new tags
    let events = env.events().all();
    let last_event = events.last().unwrap();
    let (_, _, data): (
        Address,
        soroban_sdk::Vec<soroban_sdk::Val>,
        soroban_sdk::Val,
    ) = last_event;

    let (prev_tags, next_tags): (Vec<String>, Vec<String>) = data.try_into_val(&env).unwrap();
    assert_eq!(prev_tags.len(), 0);
    assert_eq!(next_tags.len(), 2);
    assert_eq!(next_tags.get(0).unwrap(), String::from_str(&env, "first"));
}

#[test]
fn set_tags_event_on_replacement() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "replacetest");
    let metadata = String::from_str(&env, "ipfs://m");

    // Register with initial tags
    let initial_tags = tags(&env, &["old1", "old2"]);
    client.register(&creator, &id, &100i128, &metadata, &initial_tags);

    // Replace completely with different tags
    let replacement_tags = tags(&env, &["new1", "new2", "new3"]);
    client.set_tags(&id, &replacement_tags);

    // Verify event shows complete replacement
    let events = env.events().all();
    let last_event = events.last().unwrap();
    let (_, _, data): (
        Address,
        soroban_sdk::Vec<soroban_sdk::Val>,
        soroban_sdk::Val,
    ) = last_event;

    let (prev_tags, next_tags): (Vec<String>, Vec<String>) = data.try_into_val(&env).unwrap();
    assert_eq!(prev_tags.len(), 2);
    assert_eq!(prev_tags.get(0).unwrap(), String::from_str(&env, "old1"));
    assert_eq!(prev_tags.get(1).unwrap(), String::from_str(&env, "old2"));

    assert_eq!(next_tags.len(), 3);
    assert_eq!(next_tags.get(0).unwrap(), String::from_str(&env, "new1"));
    assert_eq!(next_tags.get(1).unwrap(), String::from_str(&env, "new2"));
    assert_eq!(next_tags.get(2).unwrap(), String::from_str(&env, "new3"));
}

#[test]
fn set_terms_hash_works_and_extends_ttl() {
    let (env, creator, client) = setup();
    let terms = String::from_str(&env, "hash123");
    client.set_terms_hash(&creator, &terms);
    assert_eq!(client.get_terms_hash(&creator), terms);

    let key = DataKey::CreatorTerms(creator.clone());
    let ttl = env.as_contract(&client.address, || env.storage().persistent().get_ttl(&key));
    assert_eq!(ttl, TTL_BUMP_AMOUNT);
}

#[test]
fn get_terms_hash_missing_fails() {
    let (_env, creator, client) = setup();
    assert_eq!(
        client.try_get_terms_hash(&creator),
        Err(Ok(Error::NotFound))
    );
}

#[test]
fn set_terms_hash_rejects_over_max_length() {
    let (env, creator, client) = setup();
    let terms = metadata_of_len(&env, MAX_TERMS_HASH_LEN + 1);
    assert_eq!(
        client.try_set_terms_hash(&creator, &terms),
        Err(Ok(Error::TermsHashTooLong))
    );
    assert_eq!(
        client.try_get_terms_hash(&creator),
        Err(Ok(Error::NotFound))
    );
}

// ─── Test helpers for the role / verification / freeze / repair suites ────

/// Like `setup`, but also installs `admin` as the contract admin via the
/// bootstrap path of `nominate_new_admin`.
fn setup_with_admin<'a>() -> (Env, Address, Address, VaultRegistryClient<'a>) {
    let (env, creator, client) = setup();
    let admin = Address::generate(&env);
    client.nominate_new_admin(&admin);
    (env, creator, admin, client)
}

/// Register a resource with a valid cuid2-shaped id and a valid metadata
/// pointer, no tags. Returns the id.
fn register_default<'a>(
    env: &Env,
    creator: &Address,
    client: &VaultRegistryClient<'a>,
    id: &str,
) -> String {
    let id = String::from_str(env, id);
    client.register(
        creator,
        &id,
        &100i128,
        &String::from_str(env, "ipfs://m"),
        &empty_tags(env),
    );
    id
}

// ─── Verifier role management (#437) ───────────────────────────────────────

#[test]
fn admin_can_grant_and_revoke_verifier() {
    let (env, _creator, _admin, client) = setup_with_admin();
    let verifier = Address::generate(&env);

    assert!(!client.is_verifier(&verifier));

    client.add_verifier(&verifier);
    assert!(client.is_verifier(&verifier));

    client.remove_verifier(&verifier);
    assert!(!client.is_verifier(&verifier));
}

#[test]
fn add_verifier_before_admin_set_fails() {
    let (env, _creator, client) = setup();
    let verifier = Address::generate(&env);
    let res = client.try_add_verifier(&verifier);
    assert_eq!(res, Err(Ok(Error::AdminNotSet)));
}

#[test]
fn is_verifier_false_for_unknown_address() {
    let (env, _creator, _admin, client) = setup_with_admin();
    let stranger = Address::generate(&env);
    assert!(!client.is_verifier(&stranger));
}

// ─── On-chain verification status mirror (#436) ────────────────────────────

#[test]
fn resource_starts_pending_and_unfrozen() {
    let (env, creator, client) = setup();
    let id = register_default(&env, &creator, &client, "vres0");
    let resource = client.get(&id);
    assert_eq!(resource.verified, VerificationStatus::Pending);
    assert!(!resource.frozen);
}

#[test]
fn verifier_can_verify_pending_resource() {
    let (env, creator, _admin, client) = setup_with_admin();
    let id = register_default(&env, &creator, &client, "vres1");
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    client.set_verification_status(&id, &verifier, &VerificationStatus::Verified);
    assert_eq!(client.get(&id).verified, VerificationStatus::Verified);
}

#[test]
fn set_verification_status_emits_old_and_new_status() {
    let (env, creator, _admin, client) = setup_with_admin();
    let id = register_default(&env, &creator, &client, "vres2");
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    client.set_verification_status(&id, &verifier, &VerificationStatus::Verified);

    let all = env.events().all();
    let (_contract, _topics, data) = all.get_unchecked(all.len() - 1);
    let decoded: (VerificationStatus, VerificationStatus) =
        <(VerificationStatus, VerificationStatus)>::try_from_val(&env, &data)
            .expect("failed to decode verification event");
    assert_eq!(decoded.0, VerificationStatus::Pending);
    assert_eq!(decoded.1, VerificationStatus::Verified);
}

#[test]
fn non_verifier_cannot_set_verification_status() {
    let (env, creator, _admin, client) = setup_with_admin();
    let id = register_default(&env, &creator, &client, "vres3");
    let stranger = Address::generate(&env);

    let res = client.try_set_verification_status(&id, &stranger, &VerificationStatus::Verified);
    assert_eq!(res, Err(Ok(Error::NotVerifier)));
    assert_eq!(client.get(&id).verified, VerificationStatus::Pending);
}

#[test]
fn revoked_verifier_cannot_set_verification_status() {
    let (env, creator, _admin, client) = setup_with_admin();
    let id = register_default(&env, &creator, &client, "vres4");
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);
    client.remove_verifier(&verifier);

    let res = client.try_set_verification_status(&id, &verifier, &VerificationStatus::Verified);
    assert_eq!(res, Err(Ok(Error::NotVerifier)));
}

#[test]
fn verification_self_transition_rejected() {
    let (env, creator, _admin, client) = setup_with_admin();
    let id = register_default(&env, &creator, &client, "vres5");
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    // Pending -> Pending is a no-op and rejected as invalid.
    let res = client.try_set_verification_status(&id, &verifier, &VerificationStatus::Pending);
    assert_eq!(res, Err(Ok(Error::InvalidVerificationTransition)));
}

#[test]
fn verification_cannot_revert_to_pending() {
    let (env, creator, _admin, client) = setup_with_admin();
    let id = register_default(&env, &creator, &client, "vres6");
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    client.set_verification_status(&id, &verifier, &VerificationStatus::Verified);
    let res = client.try_set_verification_status(&id, &verifier, &VerificationStatus::Pending);
    assert_eq!(res, Err(Ok(Error::InvalidVerificationTransition)));
}

#[test]
fn verification_round_trip_verified_rejected_verified() {
    let (env, creator, _admin, client) = setup_with_admin();
    let id = register_default(&env, &creator, &client, "vres7");
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    client.set_verification_status(&id, &verifier, &VerificationStatus::Verified);
    client.set_verification_status(&id, &verifier, &VerificationStatus::Rejected);
    assert_eq!(client.get(&id).verified, VerificationStatus::Rejected);

    client.set_verification_status(&id, &verifier, &VerificationStatus::Verified);
    assert_eq!(client.get(&id).verified, VerificationStatus::Verified);
}

#[test]
fn verification_status_on_missing_resource_fails() {
    let (env, _creator, _admin, client) = setup_with_admin();
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    let res = client.try_set_verification_status(
        &String::from_str(&env, "nosuchresource"),
        &verifier,
        &VerificationStatus::Verified,
    );
    assert_eq!(res, Err(Ok(Error::NotFound)));
}

// ─── Metadata freeze (#438) ────────────────────────────────────────────────

#[test]
fn freeze_metadata_sets_flag_and_emits_event() {
    let (env, creator, client) = setup();
    let id = register_default(&env, &creator, &client, "fres0");

    client.freeze_metadata(&id);
    // Checked immediately after the write, before any other invocation
    // (e.g. a read call) rolls the per-invocation event log forward.
    assert_eq!(env.events().all().len(), 1);
    assert!(client.get(&id).frozen);
}

#[test]
fn freeze_metadata_twice_fails() {
    let (env, creator, client) = setup();
    let id = register_default(&env, &creator, &client, "fres1");
    client.freeze_metadata(&id);

    let res = client.try_freeze_metadata(&id);
    assert_eq!(res, Err(Ok(Error::AlreadyFrozen)));
}

#[test]
fn update_metadata_on_frozen_resource_fails() {
    let (env, creator, client) = setup();
    let id = register_default(&env, &creator, &client, "fres2");
    client.freeze_metadata(&id);

    let res = client.try_update_metadata(&id, &String::from_str(&env, "ipfs://new"));
    assert_eq!(res, Err(Ok(Error::MetadataFrozen)));
}

#[test]
fn frozen_resource_still_allows_price_listing_tags_and_ownership_mutations() {
    let (env, creator, client) = setup();
    let id = register_default(&env, &creator, &client, "fres3");
    client.freeze_metadata(&id);

    client.set_price(&id, &500i128);
    assert_eq!(client.get(&id).price, 500i128);

    client.set_listed(&id, &false);
    assert!(!client.get(&id).listed);

    client.set_tags(&id, &tags(&env, &["dataset"]));
    assert_eq!(client.get(&id).tags.len(), 1);

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&id, &new_owner);
    assert_eq!(client.get(&id).creator, new_owner);

    // Frozen state survives all of the above.
    assert!(client.get(&id).frozen);
}

// ─── Index repair (#428) ───────────────────────────────────────────────────

#[test]
fn repair_index_rebuilds_from_authoritative_list() {
    let (env, creator, _admin, client) = setup_with_admin();
    let a = register_default(&env, &creator, &client, "rres0a");
    let b = register_default(&env, &creator, &client, "rres0b");
    let c = register_default(&env, &creator, &client, "rres0c");

    client.repair_index(&Vec::from_array(&env, [c.clone(), a.clone()]));

    assert_eq!(client.count(), 2);
    let page = client.list(&0u32, &10u32);
    assert_eq!(page.len(), 2);
    assert_eq!(page.get(0).unwrap().id, c);
    assert_eq!(page.get(1).unwrap().id, a);

    // repair only rewrites the derived index — the dropped resource `b` is
    // still directly addressable by id.
    assert!(client.exists(&b));
    assert_eq!(client.get(&b).id, b);
}

#[test]
fn repair_index_rejects_unknown_id() {
    let (env, creator, _admin, client) = setup_with_admin();
    let a = register_default(&env, &creator, &client, "rres1a");

    let res = client.try_repair_index(&Vec::from_array(
        &env,
        [a.clone(), String::from_str(&env, "ghost")],
    ));
    assert_eq!(res, Err(Ok(Error::NotFound)));
    // No partial write: the index is untouched.
    assert_eq!(client.count(), 1);
    assert_eq!(client.list(&0u32, &10u32).get(0).unwrap().id, a);
}

#[test]
fn repair_index_rejects_duplicates() {
    let (env, creator, _admin, client) = setup_with_admin();
    let a = register_default(&env, &creator, &client, "rres2a");

    let res = client.try_repair_index(&Vec::from_array(&env, [a.clone(), a.clone()]));
    assert_eq!(res, Err(Ok(Error::DuplicateInRepair)));
}

#[test]
fn repair_index_before_admin_set_fails() {
    let (env, creator, client) = setup();
    let a = register_default(&env, &creator, &client, "rres3a");

    let res = client.try_repair_index(&Vec::from_array(&env, [a.clone()]));
    assert_eq!(res, Err(Ok(Error::AdminNotSet)));
}

#[test]
fn repair_index_rerunning_current_list_is_a_safe_noop() {
    let (env, creator, _admin, client) = setup_with_admin();
    let a = register_default(&env, &creator, &client, "rres4a");
    let b = register_default(&env, &creator, &client, "rres4b");

    client.repair_index(&Vec::from_array(&env, [a.clone(), b.clone()]));
    assert_eq!(client.count(), 2);
    let page = client.list(&0u32, &10u32);
    assert_eq!(page.get(0).unwrap().id, a);
    assert_eq!(page.get(1).unwrap().id, b);
}

// ─── Event topic length regression tests (#655) ────────────────────────────
//
// A resource id is the only user-influenced value ever placed directly in an
// event topic (see `validate_resource_id`, which caps ids at
// `MAX_RESOURCE_ID_LEN` ASCII lowercase/digit bytes). These tests pin that
// bound at the event layer with ids at the maximum accepted length, so that
// widening `validate_resource_id` without revisiting the topic-carrying
// events below shows up here rather than as a silent oversized-topic
// regression later.

const MAX_RESOURCE_ID_LEN: u32 = 24;

fn max_len_resource_id(env: &Env, prefix: &str) -> String {
    let mut buf = crate::alloc::string::String::new();
    buf.push_str(prefix);
    while (buf.len() as u32) < MAX_RESOURCE_ID_LEN {
        buf.push('x');
    }
    String::from_str(env, &buf)
}

/// Decode topic index 1 (the resource id) off the most recently emitted
/// event. Panics if the last event does not have exactly 2 topics.
fn last_event_id_topic(env: &Env) -> String {
    let all = env.events().all();
    let (_contract, topics, _data) = all.get_unchecked(all.len() - 1);
    assert_eq!(topics.len(), 2, "expected a 2-topic (name, id) event");
    String::try_from_val(env, &topics.get(1).unwrap())
        .expect("topic 1 should decode as the resource id String")
}

#[test]
fn max_length_resource_id_helper_produces_bound_length() {
    let (env, _creator, _client) = setup();
    let id = max_len_resource_id(&env, "regr");
    assert_eq!(id.len(), MAX_RESOURCE_ID_LEN);
}

#[test]
fn resource_id_one_byte_over_max_is_rejected() {
    // Companion to the topic-length tests below: confirms MAX_RESOURCE_ID_LEN
    // is actually the enforced ceiling, not just this test file's assumption.
    let (env, creator, client) = setup();
    let mut buf = crate::alloc::string::String::new();
    while (buf.len() as u32) < MAX_RESOURCE_ID_LEN + 1 {
        buf.push('x');
    }
    let id = String::from_str(&env, &buf);
    let res = client.try_register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    assert_eq!(res, Err(Ok(Error::InvalidResourceId)));
}

#[test]
fn update_metadata_event_topic_holds_full_max_length_id() {
    let (env, creator, client) = setup();
    let id = max_len_resource_id(&env, "updmeta");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    client.update_metadata(&id, &String::from_str(&env, "ipfs://new"));

    let topic_id = last_event_id_topic(&env);
    assert_eq!(topic_id, id);
    assert_eq!(topic_id.len(), MAX_RESOURCE_ID_LEN);
}

#[test]
fn set_tags_event_topic_holds_full_max_length_id() {
    let (env, creator, client) = setup();
    let id = max_len_resource_id(&env, "settags");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    client.set_tags(&id, &tags(&env, &["dataset"]));

    let topic_id = last_event_id_topic(&env);
    assert_eq!(topic_id, id);
    assert_eq!(topic_id.len(), MAX_RESOURCE_ID_LEN);
}

#[test]
fn freeze_metadata_event_topic_holds_full_max_length_id() {
    let (env, creator, client) = setup();
    let id = max_len_resource_id(&env, "freeze");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    client.freeze_metadata(&id);

    let topic_id = last_event_id_topic(&env);
    assert_eq!(topic_id, id);
    assert_eq!(topic_id.len(), MAX_RESOURCE_ID_LEN);
}

#[test]
fn set_listed_event_topic_holds_full_max_length_id() {
    let (env, creator, client) = setup();
    let id = max_len_resource_id(&env, "listed");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    client.set_listed(&id, &false);

    let topic_id = last_event_id_topic(&env);
    assert_eq!(topic_id, id);
    assert_eq!(topic_id.len(), MAX_RESOURCE_ID_LEN);
}

#[test]
fn transfer_ownership_event_topic_holds_full_max_length_id() {
    let (env, creator, client) = setup();
    let id = max_len_resource_id(&env, "xfer");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&id, &new_owner);

    let topic_id = last_event_id_topic(&env);
    assert_eq!(topic_id, id);
    assert_eq!(topic_id.len(), MAX_RESOURCE_ID_LEN);
}

#[test]
fn set_verification_status_event_topic_holds_full_max_length_id() {
    let (env, creator, _admin, client) = setup_with_admin();
    let id = max_len_resource_id(&env, "verify");
    client.register(
        &creator,
        &id,
        &100i128,
        &String::from_str(&env, "ipfs://m"),
        &empty_tags(&env),
    );
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    client.set_verification_status(&id, &verifier, &VerificationStatus::Verified);

    let topic_id = last_event_id_topic(&env);
    assert_eq!(topic_id, id);
    assert_eq!(topic_id.len(), MAX_RESOURCE_ID_LEN);
}
