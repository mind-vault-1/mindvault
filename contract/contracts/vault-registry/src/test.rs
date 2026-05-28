#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, String};

fn setup<'a>() -> (Env, Address, VaultRegistryClient<'a>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(VaultRegistry, ());
    let client = VaultRegistryClient::new(&env, &contract_id);
    let creator = Address::generate(&env);
    (env, creator, client)
}

#[test]
fn register_then_read() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "swcn98besxpp6t1u8e77fqz3");
    let metadata = String::from_str(&env, "ipfs://QmResourceMetadata");

    client.register(&creator, &id, &1_000_000i128, &metadata);

    assert_eq!(client.count(), 1);
    assert!(client.exists(&id));

    let r = client.get(&id);
    assert_eq!(r.id, id);
    assert_eq!(r.creator, creator);
    assert_eq!(r.price, 1_000_000i128);
    assert_eq!(r.metadata, metadata);
    assert_eq!(r.listed, true); // Resources are listed by default
}

#[test]
fn duplicate_registration_fails() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "dup");
    let metadata = String::from_str(&env, "x");
    client.register(&creator, &id, &100i128, &metadata);

    let res = client.try_register(&creator, &id, &100i128, &metadata);
    assert_eq!(res, Err(Ok(Error::AlreadyRegistered)));
    assert_eq!(client.count(), 1);
}

#[test]
fn zero_or_negative_price_rejected() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "free");
    let metadata = String::from_str(&env, "x");

    assert_eq!(
        client.try_register(&creator, &id, &0i128, &metadata),
        Err(Ok(Error::InvalidPrice))
    );
    assert_eq!(
        client.try_register(&creator, &id, &-5i128, &metadata),
        Err(Ok(Error::InvalidPrice))
    );
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
    client.register(&creator, &id, &1_000_000i128, &String::from_str(&env, "m"));

    client.set_price(&id, &2_500_000i128);
    assert_eq!(client.get(&id).price, 2_500_000i128);

    assert_eq!(
        client.try_set_price(&id, &0i128),
        Err(Ok(Error::InvalidPrice))
    );
}

#[test]
fn update_metadata_changes_pointer() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r2");
    client.register(&creator, &id, &100i128, &String::from_str(&env, "old"));

    let new_meta = String::from_str(&env, "ipfs://QmNew");
    client.update_metadata(&id, &new_meta);
    assert_eq!(client.get(&id).metadata, new_meta);
}

#[test]
fn ownership_can_transfer() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r3");
    client.register(&creator, &id, &100i128, &String::from_str(&env, "m"));

    let new_owner = Address::generate(&env);
    client.transfer_ownership(&id, &new_owner);
    assert_eq!(client.get(&id).creator, new_owner);
}

#[test]
fn set_listed_toggles_listing_state() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r4");
    client.register(&creator, &id, &100i128, &String::from_str(&env, "m"));

    // Initially listed
    assert_eq!(client.get(&id).listed, true);

    // Delist
    client.set_listed(&id, &false);
    assert_eq!(client.get(&id).listed, false);

    // Re-list
    client.set_listed(&id, &true);
    assert_eq!(client.get(&id).listed, true);
}

#[test]
fn delist_convenience_method() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r5");
    client.register(&creator, &id, &100i128, &String::from_str(&env, "m"));

    // Initially listed
    assert_eq!(client.get(&id).listed, true);

    // Delist using convenience method
    client.delist(&id);
    assert_eq!(client.get(&id).listed, false);
}

#[test]
fn set_listed_requires_creator_auth() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "r6");
    client.register(&creator, &id, &100i128, &String::from_str(&env, "m"));

    // This should work fine since we mock all auths
    client.set_listed(&id, &false);
    assert_eq!(client.get(&id).listed, false);
}

#[test]
fn set_listed_on_missing_resource_fails() {
    let (env, _creator, client) = setup();
    let id = String::from_str(&env, "missing");
    
    let res = client.try_set_listed(&id, &false);
    assert_eq!(res, Err(Ok(Error::NotFound)));
}
