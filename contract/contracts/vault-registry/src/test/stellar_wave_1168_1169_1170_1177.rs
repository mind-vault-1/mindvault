// Tests for Stellar Wave issues #1168, #1169, #1170, #1177
//
// #1168 — paginated tombstone history for moderators
// #1169 — reject stale expected revisions on metadata updates
// #1170 — atomic batch listing updates for one creator
// #1177 — preserve lease expiry when extending an expired lease

fn stored_lease(env: &Env, client: &VaultRegistryClient, id: &String, holder: &Address) -> Lease {
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get::<DataKey, Lease>(&DataKey::Lease(id.clone(), holder.clone()))
            .unwrap()
    })
}

fn no_contract_events(env: &Env) -> bool {
    env.events().all().is_empty()
}

// ── Issue #1177: extending an expired lease ─────────────────────────────────

fn active_hour_lease<'a>(
    name: &str,
    price: i128,
) -> (Env, Address, Address, VaultRegistryClient<'a>, String, Lease) {
    let (env, creator, _admin, client) = setup_with_admin();
    let settler = Address::generate(&env);
    client.add_settler(&settler);
    let holder = Address::generate(&env);
    let id = register_priced(&env, &creator, &client, name, price);
    env.ledger().set_sequence_number(100);
    let lease = client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Hour,
        &(LEASE_HOUR_MULTIPLIER * price),
        &String::from_str(&env, "tx-first"),
    );
    (env, creator, holder, client, id, lease)
}

#[test]
fn extending_a_long_expired_lease_restarts_from_the_current_ledger() {
    let (env, _creator, holder, client, id, first) = active_hour_lease("sw1177late", 100);
    let now = first.expiry_ledger + 5_000;
    env.ledger().set_sequence_number(now);
    assert!(!client.lease_is_active(&id, &holder));

    let extended = client.extend_lease(
        &holder,
        &id,
        &LeaseTier::Day,
        &(LEASE_DAY_MULTIPLIER * 100),
        &String::from_str(&env, "tx-late"),
    );
    // The lapsed ledgers are not credited back, and the new window is the
    // full tier from now rather than from the stale expiry.
    assert_eq!(extended.expiry_ledger, now + LEASE_DAY_LEDGERS);
    assert_eq!(extended.start_ledger, first.start_ledger);
    assert_eq!(extended.recorded_at, now);
    assert_eq!(extended.amount, first.amount + LEASE_DAY_MULTIPLIER * 100);
    assert_eq!(extended.state, LeaseState::Active);
    assert_eq!(stored_lease(&env, &client, &id, &holder), extended);
    assert!(client.lease_is_active(&id, &holder));

    env.ledger().set_sequence_number(now + LEASE_DAY_LEDGERS - 1);
    assert!(client.lease_is_active(&id, &holder));
    env.ledger().set_sequence_number(now + LEASE_DAY_LEDGERS);
    assert!(!client.lease_is_active(&id, &holder));
}

#[test]
fn extending_a_live_lease_keeps_its_remaining_window() {
    let (env, _creator, holder, client, id, first) = active_hour_lease("sw1177live", 100);
    env.ledger().set_sequence_number(first.expiry_ledger - 1);

    let extended = client.extend_lease(
        &holder,
        &id,
        &LeaseTier::Hour,
        &(LEASE_HOUR_MULTIPLIER * 100),
        &String::from_str(&env, "tx-live"),
    );
    assert_eq!(extended.expiry_ledger, first.expiry_ledger + LEASE_HOUR_LEDGERS);
}

#[test]
fn extending_exactly_at_expiry_chains_onto_the_old_window() {
    let (env, _creator, holder, client, id, first) = active_hour_lease("sw1177edge", 100);
    env.ledger().set_sequence_number(first.expiry_ledger);
    assert!(!client.lease_is_active(&id, &holder));

    let extended = client.extend_lease(
        &holder,
        &id,
        &LeaseTier::Hour,
        &(LEASE_HOUR_MULTIPLIER * 100),
        &String::from_str(&env, "tx-edge"),
    );
    assert_eq!(extended.expiry_ledger, first.expiry_ledger + LEASE_HOUR_LEDGERS);
}

#[test]
fn rejected_extensions_of_an_expired_lease_leave_it_unchanged() {
    let (env, creator, holder, client, id, first) = active_hour_lease("sw1177rej", 100);
    env.ledger().set_sequence_number(first.expiry_ledger + 50);
    let day = LEASE_DAY_MULTIPLIER * 100;

    // Wrong amount.
    assert_eq!(
        client.try_extend_lease(
            &holder,
            &id,
            &LeaseTier::Day,
            &(day - 1),
            &String::from_str(&env, "tx-bad-amount"),
        ),
        Err(Ok(Error::PaymentAmountMismatch))
    );
    assert!(no_contract_events(&env));
    assert_eq!(stored_lease(&env, &client, &id, &holder), first);

    // Reused payment hash.
    assert_eq!(
        client.try_extend_lease(&holder, &id, &LeaseTier::Day, &day, &first.tx_hash),
        Err(Ok(Error::DuplicateTxHash))
    );
    assert_eq!(stored_lease(&env, &client, &id, &holder), first);

    // A holder with no lease on the resource.
    assert_eq!(
        client.try_extend_lease(
            &Address::generate(&env),
            &id,
            &LeaseTier::Day,
            &day,
            &String::from_str(&env, "tx-stranger"),
        ),
        Err(Ok(Error::NotFound))
    );

    // The holder's signature is required.
    env.mock_auths(&[]);
    assert!(client
        .try_extend_lease(
            &holder,
            &id,
            &LeaseTier::Day,
            &day,
            &String::from_str(&env, "tx-unsigned"),
        )
        .is_err());
    env.mock_all_auths();
    assert_eq!(stored_lease(&env, &client, &id, &holder), first);

    // A resource that left `Listed` cannot be extended.
    client.set_listed(&id, &false);
    assert_eq!(
        client.try_extend_lease(
            &holder,
            &id,
            &LeaseTier::Day,
            &day,
            &String::from_str(&env, "tx-delisted"),
        ),
        Err(Ok(Error::ResourceNotMutable))
    );
    assert_eq!(stored_lease(&env, &client, &id, &holder), first);
    assert!(!client.lease_is_active(&id, &holder));
    let _ = creator;
}

#[test]
fn extension_past_u32_max_is_rejected_instead_of_capped() {
    let (env, _creator, holder, client, id, first) = active_hour_lease("sw1177max", 100);
    let near_max = Lease {
        expiry_ledger: u32::MAX - 10,
        ..first.clone()
    };
    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::Lease(id.clone(), holder.clone()), &near_max);
    });

    assert_eq!(
        client.try_extend_lease(
            &holder,
            &id,
            &LeaseTier::Hour,
            &(LEASE_HOUR_MULTIPLIER * 100),
            &String::from_str(&env, "tx-overflow"),
        ),
        Err(Ok(Error::InvalidPaymentTransition))
    );
    assert!(no_contract_events(&env));
    assert_eq!(stored_lease(&env, &client, &id, &holder), near_max);

    // `renew_lease` shares the same checked arithmetic.
    assert_eq!(
        client.try_renew_lease(
            &holder,
            &id,
            &LeaseTier::Hour,
            &(LEASE_HOUR_MULTIPLIER * 100),
            &String::from_str(&env, "tx-renew-overflow"),
        ),
        Err(Ok(Error::InvalidPaymentTransition))
    );
    assert_eq!(stored_lease(&env, &client, &id, &holder), near_max);
}

#[test]
fn extending_an_expired_lease_at_a_lower_price_lowers_the_fee_guard_floor() {
    let (env, _creator, holder, client, id, first) = active_hour_lease("sw1177floor", 1_000);
    env.ledger().set_sequence_number(first.expiry_ledger + 1);
    client.set_price(&id, &200i128);
    client.extend_lease(
        &holder,
        &id,
        &LeaseTier::Hour,
        &200i128,
        &String::from_str(&env, "tx-cheaper"),
    );

    // A combined fee of 300 is below the original 1 000 price but at or above
    // the 200 the extended lease was sold at.
    assert_eq!(
        client.try_set_fee_config(&FeeConfig {
            platform_fee_bps: 150,
            royalty_bps: 150,
            fee_recipient: None,
        }),
        Err(Ok(Error::LeaseFeeConfigConflict))
    );
    client.set_fee_config(&FeeConfig {
        platform_fee_bps: 100,
        royalty_bps: 99,
        fee_recipient: None,
    });
}

// ── Issue #1169: stale expected revisions ───────────────────────────────────

#[test]
fn update_metadata_at_revision_writes_when_the_revision_matches() {
    let (env, creator, client) = setup();
    let id = register_default(&env, &creator, &client, "sw1169ok");
    assert_eq!(client.get_revision(&id), 0);

    let next = String::from_str(&env, "ipfs://QmRevisionOne");
    client.update_metadata_at_revision(&id, &next, &0);
    let event = env.events().all().last().unwrap();
    let payload = MetadataUpdateEvent::try_from_val(&env, &event.2).unwrap();
    assert_eq!(payload.new_metadata, next);
    assert_eq!(payload.revision, 1);
    assert_eq!(client.get(&id).metadata, next);
    assert_eq!(client.get_revision(&id), 1);

    // The returned revision is the next expected one.
    let after = String::from_str(&env, "ipfs://QmRevisionTwo");
    client.update_metadata_at_revision(&id, &after, &1);
    assert_eq!(client.get_revision(&id), 2);
    assert_eq!(client.get(&id).metadata, after);
}

#[test]
fn update_metadata_at_revision_rejects_a_stale_revision_without_writing() {
    let (env, creator, client) = setup();
    let id = register_default(&env, &creator, &client, "sw1169stale");
    client.set_price(&id, &250i128);
    assert_eq!(client.get_revision(&id), 1);
    let before = client.get(&id);

    for stale in [0u32, 2, u32::MAX] {
        assert_eq!(
            client.try_update_metadata_at_revision(
                &id,
                &String::from_str(&env, "ipfs://QmLostUpdate"),
                &stale,
            ),
            Err(Ok(Error::StaleRevision))
        );
        assert!(no_contract_events(&env));
    }
    // A stale caller is rejected even when its pointer is already current.
    assert_eq!(
        client.try_update_metadata_at_revision(&id, &before.metadata, &0),
        Err(Ok(Error::StaleRevision))
    );
    assert_eq!(client.get(&id), before);
    assert_eq!(client.get_revision(&id), 1);
}

#[test]
fn update_metadata_at_revision_keeps_update_metadata_rules() {
    let (env, creator, client) = setup();
    let id = register_default(&env, &creator, &client, "sw1169rules");

    // Matching revision with an unchanged pointer is a silent no-op.
    let current = client.get(&id).metadata;
    client.update_metadata_at_revision(&id, &current, &0);
    assert!(no_contract_events(&env));
    assert_eq!(client.get_revision(&id), 0);

    // Pointer validation still applies.
    assert_eq!(
        client.try_update_metadata_at_revision(&id, &String::from_str(&env, ""), &0),
        Err(Ok(Error::EmptyMetadata))
    );

    // A frozen pointer stays frozen.
    client.freeze_metadata(&id);
    assert_eq!(
        client.try_update_metadata_at_revision(
            &id,
            &String::from_str(&env, "ipfs://QmFrozen"),
            &0,
        ),
        Err(Ok(Error::MetadataFrozen))
    );

    // Unknown resources fail before the revision is read.
    assert_eq!(
        client.try_update_metadata_at_revision(
            &String::from_str(&env, "sw1169none"),
            &String::from_str(&env, "ipfs://QmNone"),
            &0,
        ),
        Err(Ok(Error::NotFound))
    );
}

#[test]
fn update_metadata_at_revision_requires_the_creator_signature() {
    let (env, _owner, _stranger, client, id) = setup_strict_auth();
    assert!(client
        .try_update_metadata_at_revision(&id, &String::from_str(&env, "ipfs://QmNoAuth"), &0)
        .is_err());
    assert_eq!(client.get_revision(&id), 0);
}

// ── Issue #1170: set_listed_many ────────────────────────────────────────────

fn listing(env: &Env, id: &String, listed: bool) -> BatchListingUpdate {
    let _ = env;
    BatchListingUpdate {
        id: id.clone(),
        listed,
    }
}

fn setlisted_events(env: &Env) -> u32 {
    let mut n = 0;
    for (_, topics, _) in env.events().all().iter() {
        let sym = Symbol::try_from_val(env, &topics.get(0).unwrap()).ok();
        if sym == Some(symbol_short!("setlisted")) {
            n += 1;
        }
    }
    n
}

#[test]
fn set_listed_many_delists_and_relists_in_one_call() {
    let (env, creator, client) = setup();
    let a = register_default(&env, &creator, &client, "sw1170a");
    let b = register_default(&env, &creator, &client, "sw1170b");
    let c = register_default(&env, &creator, &client, "sw1170c");
    client.set_listed(&c, &false);
    assert_eq!(client.creator_listed_count(&creator), 2);

    client.set_listed_many(
        &creator,
        &Vec::from_array(
            &env,
            [listing(&env, &a, false), listing(&env, &b, false), listing(&env, &c, true)],
        ),
    );
    assert_eq!(setlisted_events(&env), 3);
    assert_eq!(client.get_resource_state(&a), ResourceState::Delisted);
    assert_eq!(client.get_resource_state(&b), ResourceState::Delisted);
    assert_eq!(client.get_resource_state(&c), ResourceState::Listed);
    assert!(!client.get(&a).listed);
    assert!(client.get(&c).listed);
    assert_eq!(client.listed_count(), 1);
    assert_eq!(client.creator_listed_count(&creator), 1);
}

#[test]
fn set_listed_many_skips_no_ops_and_uses_the_last_duplicate() {
    let (env, creator, client) = setup();
    let a = register_default(&env, &creator, &client, "sw1170noop");
    let b = register_default(&env, &creator, &client, "sw1170dup");

    client.set_listed_many(
        &creator,
        &Vec::from_array(
            &env,
            [listing(&env, &a, true), listing(&env, &b, true), listing(&env, &b, false)],
        ),
    );
    assert_eq!(setlisted_events(&env), 1);
    assert_eq!(client.get_resource_state(&a), ResourceState::Listed);
    assert_eq!(client.get_resource_state(&b), ResourceState::Delisted);
    assert_eq!(client.listed_count(), 1);
}

#[test]
fn set_listed_many_is_atomic_when_a_later_item_fails() {
    let (env, creator, admin, client) = setup_with_admin();
    let other = Address::generate(&env);
    let a = register_default(&env, &creator, &client, "sw1170atoma");
    let frozen = register_default(&env, &creator, &client, "sw1170atomf");
    let foreign = register_default(&env, &other, &client, "sw1170atomx");
    let disputed = register_default(&env, &creator, &client, "sw1170atomd");
    let gone = register_default(&env, &creator, &client, "sw1170atomt");
    client.freeze_resource(&frozen);
    client.open_dispute(&disputed, &admin);
    client.tombstone_resource(&gone, &admin);
    let listed_before = client.listed_count();

    let cases = [
        (frozen.clone(), Error::InvalidLifecycleTransition),
        (disputed.clone(), Error::InvalidLifecycleTransition),
        (gone.clone(), Error::InvalidLifecycleTransition),
        (foreign.clone(), Error::Unauthorized),
        (String::from_str(&env, "sw1170missing"), Error::NotFound),
        (String::from_str(&env, ""), Error::InvalidResourceId),
    ];
    for (bad, expected) in cases {
        let batch = Vec::from_array(&env, [listing(&env, &a, false), listing(&env, &bad, false)]);
        assert_eq!(client.try_set_listed_many(&creator, &batch), Err(Ok(expected)));
        assert!(no_contract_events(&env));
        assert_eq!(client.get_resource_state(&a), ResourceState::Listed);
        assert_eq!(client.listed_count(), listed_before);
    }
}

#[test]
fn set_listed_many_bounds_the_batch_size() {
    let (env, creator, client) = setup();
    assert_eq!(
        client.try_set_listed_many(&creator, &Vec::new(&env)),
        Err(Ok(Error::BatchTooLarge))
    );

    let id = register_default(&env, &creator, &client, "sw1170cap");
    let mut full = Vec::new(&env);
    for _ in 0..MAX_BATCH_LISTING_UPDATES {
        full.push_back(listing(&env, &id, false));
    }
    client.set_listed_many(&creator, &full);
    assert_eq!(client.get_resource_state(&id), ResourceState::Delisted);

    full.push_back(listing(&env, &id, true));
    assert_eq!(
        client.try_set_listed_many(&creator, &full),
        Err(Ok(Error::BatchTooLarge))
    );
    assert_eq!(client.get_resource_state(&id), ResourceState::Delisted);
}

#[test]
fn set_listed_many_requires_creator_auth_and_an_unpaused_registry() {
    let (env, owner, _stranger, client, id) = setup_strict_auth();
    let batch = Vec::from_array(&env, [listing(&env, &id, false)]);
    assert!(client.try_set_listed_many(&owner, &batch).is_err());
    assert_eq!(client.get_resource_state(&id), ResourceState::Listed);

    let (env, creator, admin, client) = setup_with_admin();
    let id = register_default(&env, &creator, &client, "sw1170pause");
    client.set_paused(&admin, &true);
    assert_eq!(
        client.try_set_listed_many(&creator, &Vec::from_array(&env, [listing(&env, &id, false)])),
        Err(Ok(Error::ContractPaused))
    );
    assert_eq!(client.get_resource_state(&id), ResourceState::Listed);
}

// ── Issue #1168: tombstone history ──────────────────────────────────────────

fn moderated_registry<'a>() -> (Env, Address, Address, Address, VaultRegistryClient<'a>) {
    let (env, creator, admin, client) = setup_with_admin();
    let moderator = Address::generate(&env);
    client.add_moderator(&moderator);
    (env, creator, admin, moderator, client)
}

#[test]
fn tombstone_history_is_empty_before_any_tombstone() {
    let (_env, _creator, _admin, moderator, client) = moderated_registry();
    let page = client.tombstone_history(&moderator, &0, &20);
    assert_eq!(page.records.len(), 0);
    assert_eq!(page.next_cursor, None);
    assert_eq!(page.total, 0);
}

#[test]
fn tombstone_history_pages_records_oldest_first() {
    let (env, creator, admin, moderator, client) = moderated_registry();
    let mut ids = alloc::vec::Vec::new();
    for i in 0..5u32 {
        let id = register_default(&env, &creator, &client, &format!("sw1168t{i}"));
        env.ledger().set_sequence_number(1_000 + i);
        client.tombstone_resource(&id, &admin);
        ids.push(id);
    }

    let first = client.tombstone_history(&moderator, &0, &2);
    assert_eq!(first.total, 5);
    assert_eq!(first.records.len(), 2);
    assert_eq!(first.next_cursor, Some(2));
    let record = first.records.get(0).unwrap();
    assert_eq!(record.position, 1);
    assert_eq!(record.id, ids[0]);
    assert_eq!(record.creator, creator);
    assert_eq!(record.admin, admin);
    assert_eq!(record.ledger, 1_000);

    let second = client.tombstone_history(&moderator, &first.next_cursor.unwrap(), &2);
    assert_eq!(second.records.get(0).unwrap().position, 3);
    assert_eq!(second.next_cursor, Some(4));

    // The last page is short and closes the walk.
    let last = client.tombstone_history(&moderator, &second.next_cursor.unwrap(), &2);
    assert_eq!(last.records.len(), 1);
    assert_eq!(last.records.get(0).unwrap().id, ids[4]);
    assert_eq!(last.next_cursor, None);

    // A cursor at or past the end returns an empty final page.
    for cursor in [5u32, 6, u32::MAX] {
        let past = client.tombstone_history(&moderator, &cursor, &20);
        assert_eq!(past.records.len(), 0);
        assert_eq!(past.next_cursor, None);
        assert_eq!(past.total, 5);
    }
}

#[test]
fn tombstone_history_clamps_the_limit() {
    let (env, creator, admin, moderator, client) = moderated_registry();
    for i in 0..(TOMBSTONE_HISTORY_PAGE_CAP + 1) {
        let id = register_default(&env, &creator, &client, &format!("sw1168c{i}"));
        client.tombstone_resource(&id, &admin);
    }

    let capped = client.tombstone_history(&moderator, &0, &u32::MAX);
    assert_eq!(capped.records.len(), TOMBSTONE_HISTORY_PAGE_CAP);
    assert_eq!(capped.next_cursor, Some(TOMBSTONE_HISTORY_PAGE_CAP));

    let zero = client.tombstone_history(&moderator, &0, &0);
    assert_eq!(zero.records.len(), 1);
    assert_eq!(zero.next_cursor, Some(1));
}

#[test]
fn tombstone_history_keeps_cursors_valid_while_it_grows() {
    let (env, creator, admin, moderator, client) = moderated_registry();
    let a = register_default(&env, &creator, &client, "sw1168growa");
    let b = register_default(&env, &creator, &client, "sw1168growb");
    client.tombstone_resource(&a, &admin);

    let first = client.tombstone_history(&moderator, &0, &1);
    assert_eq!(first.next_cursor, None);
    client.tombstone_resource(&b, &admin);

    let next = client.tombstone_history(&moderator, &1, &1);
    assert_eq!(next.total, 2);
    assert_eq!(next.records.get(0).unwrap().id, b);
}

#[test]
fn rejected_tombstones_do_not_append_history() {
    let (env, creator, admin, moderator, client) = moderated_registry();
    let id = register_default(&env, &creator, &client, "sw1168once");
    client.tombstone_resource(&id, &admin);
    assert_eq!(
        client.try_tombstone_resource(&id, &admin),
        Err(Ok(Error::InvalidLifecycleTransition))
    );
    let other = register_default(&env, &creator, &client, "sw1168notadm");
    assert_eq!(
        client.try_tombstone_resource(&other, &Address::generate(&env)),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(client.tombstone_history(&moderator, &0, &20).total, 1);
}

#[test]
fn tombstone_history_is_moderator_only() {
    let (env, creator, admin, moderator, client) = moderated_registry();
    let id = register_default(&env, &creator, &client, "sw1168auth");
    client.tombstone_resource(&id, &admin);

    for caller in [Address::generate(&env), admin.clone(), creator.clone()] {
        assert_eq!(
            client.try_tombstone_history(&caller, &0, &20),
            Err(Ok(Error::Unauthorized))
        );
    }
    client.remove_moderator(&moderator);
    assert_eq!(
        client.try_tombstone_history(&moderator, &0, &20),
        Err(Ok(Error::Unauthorized))
    );

    // A moderator who does not sign is refused by the host.
    client.add_moderator(&moderator);
    env.mock_auths(&[]);
    assert!(client.try_tombstone_history(&moderator, &0, &20).is_err());
}
