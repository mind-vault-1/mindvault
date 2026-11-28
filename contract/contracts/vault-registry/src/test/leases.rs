// ─── Time-limited access leases (#803) ───────────────────────────────────────
//
// On-chain lease fields (`start_ledger`, `expiry_ledger`, `tier`) plus the
// read helpers a paywall needs, and the holder / settler / creator paths
// that write them.

fn lease_setup<'a>() -> (Env, Address, Address, Address, VaultRegistryClient<'a>) {
    let (env, creator, _admin, client) = setup_with_admin();
    let settler = Address::generate(&env);
    client.add_settler(&settler);
    let holder = Address::generate(&env);
    (env, creator, settler, holder, client)
}

fn last_lease_event(env: &Env, expected_topic: Symbol, expected_id: &String) -> Lease {
    let all = env.events().all();
    let (_cid, topics, data) = all.get_unchecked(all.len() - 1);
    let topic: Symbol = Symbol::try_from_val(env, &topics.get(0).unwrap()).unwrap();
    assert_eq!(topic, expected_topic);
    let topic_id: String = String::try_from_val(env, &topics.get(1).unwrap()).unwrap();
    assert_eq!(&topic_id, expected_id);
    Lease::try_from_val(env, &data).unwrap()
}

#[test]
fn lease_tier_ledgers_and_prices_follow_the_documented_tables() {
    let (env, creator, _settler, _holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leasetier", 1_000i128);

    assert_eq!(LEASE_HOUR_LEDGERS, 720);
    assert_eq!(LEASE_DAY_LEDGERS, 17_280);
    assert_eq!(LEASE_WEEK_LEDGERS, 120_960);

    assert_eq!(client.lease_price(&id, &LeaseTier::Hour), 1_000i128);
    assert_eq!(client.lease_price(&id, &LeaseTier::Day), 5_000i128);
    assert_eq!(client.lease_price(&id, &LeaseTier::Week), 20_000i128);

    // The price tracks the resource's current price.
    client.set_price(&id, &2_000i128);
    assert_eq!(client.lease_price(&id, &LeaseTier::Week), 40_000i128);

    assert_eq!(
        client.try_lease_price(&String::from_str(&env, "nosuchlease"), &LeaseTier::Hour),
        Err(Ok(Error::NotFound))
    );
}

#[test]
fn buy_lease_records_a_pending_window_from_the_current_ledger() {
    let (env, creator, _settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leasebuy", 300i128);
    env.ledger().set_sequence_number(1_000);

    let lease = client.buy_lease(
        &holder,
        &id,
        &LeaseTier::Day,
        &1_500i128,
        &String::from_str(&env, "0xleasetx"),
    );

    assert_eq!(lease.resource_id, id);
    assert_eq!(lease.holder, holder);
    assert_eq!(lease.tier, LeaseTier::Day);
    assert_eq!(lease.start_ledger, 1_000);
    assert_eq!(lease.expiry_ledger, 1_000 + LEASE_DAY_LEDGERS);
    assert_eq!(lease.amount, 1_500i128);
    assert_eq!(lease.tx_hash, String::from_str(&env, "0xleasetx"));
    assert_eq!(lease.state, LeaseState::Pending);
    assert_eq!(lease.recorded_at, 1_000);
    assert_eq!(last_lease_event(&env, symbol_short!("lease"), &id), lease);

    // Pending grants nothing yet; the record is readable.
    assert!(!client.lease_is_active(&id, &holder));
    assert_eq!(client.get_lease(&id, &holder), lease);
}

#[test]
fn settle_lease_activates_and_the_window_expires_by_ledger() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leasesetl", 100i128);
    env.ledger().set_sequence_number(50);
    client.buy_lease(
        &holder,
        &id,
        &LeaseTier::Hour,
        &100i128,
        &String::from_str(&env, "tx1"),
    );

    let settled = client.settle_lease(&settler, &id, &holder);
    assert_eq!(settled.state, LeaseState::Active);
    assert_eq!(last_lease_event(&env, symbol_short!("leasesetl"), &id), settled);
    assert!(client.lease_is_active(&id, &holder));

    // Last ledger inside the window.
    env.ledger().set_sequence_number(50 + LEASE_HOUR_LEDGERS - 1);
    assert!(client.lease_is_active(&id, &holder));
    // First ledger outside it.
    env.ledger().set_sequence_number(50 + LEASE_HOUR_LEDGERS);
    assert!(!client.lease_is_active(&id, &holder));
    // The record survives expiry for audit.
    assert_eq!(client.get_lease(&id, &holder).state, LeaseState::Active);

    // Settling twice is a transition error, as is settling without a lease.
    assert_eq!(
        client.try_settle_lease(&settler, &id, &holder),
        Err(Ok(Error::InvalidPaymentTransition))
    );
    let stranger = Address::generate(&env);
    assert_eq!(
        client.try_settle_lease(&settler, &id, &stranger),
        Err(Ok(Error::NotFound))
    );
}

#[test]
fn record_lease_writes_an_active_lease_for_a_settler() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leaserec", 100i128);
    env.ledger().set_sequence_number(10);

    let lease = client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Week,
        &2_000i128,
        &String::from_str(&env, "x402settled"),
    );
    assert_eq!(lease.state, LeaseState::Active);
    assert_eq!(lease.expiry_ledger, 10 + LEASE_WEEK_LEDGERS);
    assert!(client.lease_is_active(&id, &holder));

    // Only a settler may record directly.
    let not_settler = Address::generate(&env);
    let other = Address::generate(&env);
    assert_eq!(
        client.try_record_lease(
            &not_settler,
            &other,
            &id,
            &LeaseTier::Hour,
            &100i128,
            &String::from_str(&env, "tx"),
        ),
        Err(Ok(Error::NotSettler))
    );
}

#[test]
fn lease_rejects_wrong_amount_bad_hash_and_unlisted_resources() {
    let (env, creator, _settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leasebad", 100i128);
    let tx = String::from_str(&env, "tx");

    assert_eq!(
        client.try_buy_lease(&holder, &id, &LeaseTier::Day, &100i128, &tx),
        Err(Ok(Error::PaymentAmountMismatch))
    );
    assert_eq!(
        client.try_buy_lease(&holder, &id, &LeaseTier::Day, &0i128, &tx),
        Err(Ok(Error::InvalidPaymentAmount))
    );
    assert_eq!(
        client.try_buy_lease(
            &holder,
            &id,
            &LeaseTier::Day,
            &500i128,
            &String::from_str(&env, "")
        ),
        Err(Ok(Error::InvalidTxHash))
    );
    assert_eq!(
        client.try_buy_lease(
            &holder,
            &String::from_str(&env, "nosuchres"),
            &LeaseTier::Day,
            &500i128,
            &tx
        ),
        Err(Ok(Error::NotFound))
    );

    // Delisted, frozen, disputed: not for sale, so not for lease.
    client.delist(&id);
    assert_eq!(
        client.try_buy_lease(&holder, &id, &LeaseTier::Day, &500i128, &tx),
        Err(Ok(Error::ResourceNotMutable))
    );
    client.freeze_resource(&id);
    assert_eq!(
        client.try_buy_lease(&holder, &id, &LeaseTier::Day, &500i128, &tx),
        Err(Ok(Error::ResourceNotMutable))
    );
    client.reactivate_resource(&id);
    assert!(client
        .try_buy_lease(&holder, &id, &LeaseTier::Day, &500i128, &tx)
        .is_ok());
}

#[test]
fn lease_renewal_rejects_delisted_and_tombstoned_resources_without_writes() {
    let (env, creator, settler, holder, client) = lease_setup();
    let admin = client.admin().unwrap();
    let id = register_priced(&env, &creator, &client, "leaseclosed", 100i128);
    let tx = String::from_str(&env, "lease-tx");

    env.ledger().set_sequence_number(100);
    client.record_lease(&settler, &holder, &id, &LeaseTier::Hour, &100i128, &tx);
    let prior_lease = client.get_lease(&id, &holder);
    let new_holder = Address::generate(&env);

    // An expired lease may be renewed only while its resource is Listed.
    env.ledger().set_sequence_number(100 + LEASE_HOUR_LEDGERS);
    client.delist(&id);
    let before_rejection_events = env.events().all().len();
    assert_eq!(
        client.try_buy_lease(&holder, &id, &LeaseTier::Hour, &100i128, &tx),
        Err(Ok(Error::ResourceNotMutable))
    );
    assert_eq!(
        client.try_record_lease(&settler, &holder, &id, &LeaseTier::Hour, &100i128, &tx),
        Err(Ok(Error::ResourceNotMutable))
    );
    assert_eq!(
        client.try_buy_lease(&new_holder, &id, &LeaseTier::Hour, &100i128, &tx),
        Err(Ok(Error::ResourceNotMutable))
    );
    assert_eq!(client.get_lease(&id, &holder), prior_lease);
    assert_eq!(client.try_get_lease(&id, &new_holder), Err(Ok(Error::NotFound)));
    assert_eq!(env.events().all().len(), before_rejection_events);

    client.tombstone_resource(&id, &admin);
    let before_tombstone_rejection_events = env.events().all().len();
    assert_eq!(
        client.try_buy_lease(&holder, &id, &LeaseTier::Hour, &100i128, &tx),
        Err(Ok(Error::ResourceNotMutable))
    );
    assert_eq!(
        client.try_record_lease(&settler, &holder, &id, &LeaseTier::Hour, &100i128, &tx),
        Err(Ok(Error::ResourceNotMutable))
    );
    assert_eq!(client.get_lease(&id, &holder), prior_lease);
    assert_eq!(env.events().all().len(), before_tombstone_rejection_events);
}

#[test]
fn pending_lease_cannot_be_settled_after_delisting_or_tombstoning() {
    let (env, creator, settler, holder, client) = lease_setup();
    let admin = client.admin().unwrap();
    let tx = String::from_str(&env, "pending-lease-tx");
    let delisted = register_priced(&env, &creator, &client, "pendingoff", 100i128);
    let pending = client.buy_lease(&holder, &delisted, &LeaseTier::Hour, &100i128, &tx);

    client.delist(&delisted);
    let before_events = env.events().all().len();
    assert_eq!(
        client.try_settle_lease(&settler, &delisted, &holder),
        Err(Ok(Error::ResourceNotMutable))
    );
    assert_eq!(client.get_lease(&delisted, &holder), pending);
    assert_eq!(env.events().all().len(), before_events);

    // Relisting permits settlement of the unchanged, still-pending lease.
    client.reactivate_resource(&delisted);
    let settled = client.settle_lease(&settler, &delisted, &holder);
    assert_eq!(settled.state, LeaseState::Active);
    assert_eq!(settled.amount, pending.amount);
    assert_eq!(settled.tx_hash, pending.tx_hash);
    assert_eq!(settled.expiry_ledger, pending.expiry_ledger);

    let tombstoned = register_priced(&env, &creator, &client, "pendinggone", 100i128);
    let pending_tombstone = client.buy_lease(
        &holder,
        &tombstoned,
        &LeaseTier::Hour,
        &100i128,
        &tx,
    );
    client.tombstone_resource(&tombstoned, &admin);
    let before_tombstone_events = env.events().all().len();
    assert_eq!(
        client.try_settle_lease(&settler, &tombstoned, &holder),
        Err(Ok(Error::ResourceNotMutable))
    );
    assert_eq!(client.get_lease(&tombstoned, &holder), pending_tombstone);
    assert_eq!(env.events().all().len(), before_tombstone_events);
}

#[test]
fn one_open_lease_per_pair_but_expired_or_revoked_leases_are_replaced() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leaseonce", 100i128);
    let tx = String::from_str(&env, "tx");
    env.ledger().set_sequence_number(100);

    client.buy_lease(&holder, &id, &LeaseTier::Hour, &100i128, &tx);
    // Pending blocks a second purchase.
    assert_eq!(
        client.try_buy_lease(&holder, &id, &LeaseTier::Hour, &100i128, &tx),
        Err(Ok(Error::AlreadyRegistered))
    );
    client.settle_lease(&settler, &id, &holder);
    // Active and unexpired blocks it too.
    assert_eq!(
        client.try_buy_lease(&holder, &id, &LeaseTier::Day, &500i128, &tx),
        Err(Ok(Error::AlreadyRegistered))
    );
    // Another holder is independent.
    let other = Address::generate(&env);
    client.buy_lease(&other, &id, &LeaseTier::Hour, &100i128, &tx);

    // Expired: replaced by a new lease.
    env.ledger().set_sequence_number(100 + LEASE_HOUR_LEDGERS);
    let renewed = client.buy_lease(&holder, &id, &LeaseTier::Day, &500i128, &tx);
    assert_eq!(renewed.tier, LeaseTier::Day);
    assert_eq!(renewed.start_ledger, 100 + LEASE_HOUR_LEDGERS);
    assert_eq!(renewed.state, LeaseState::Pending);

    // Revoked: replaced as well.
    client.revoke_lease(&id, &holder);
    let again = client.buy_lease(&holder, &id, &LeaseTier::Week, &2_000i128, &tx);
    assert_eq!(again.tier, LeaseTier::Week);
}

#[test]
fn revoke_lease_is_creator_only_immediate_and_terminal() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leaserevk", 100i128);
    client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Day,
        &500i128,
        &String::from_str(&env, "tx"),
    );
    assert!(client.lease_is_active(&id, &holder));

    let revoked = client.revoke_lease(&id, &holder);
    assert_eq!(revoked.state, LeaseState::Revoked);
    assert_eq!(last_lease_event(&env, symbol_short!("leaserevk"), &id), revoked);
    assert!(!client.lease_is_active(&id, &holder));
    assert_eq!(client.get_lease(&id, &holder).state, LeaseState::Revoked);

    assert_eq!(
        client.try_revoke_lease(&id, &holder),
        Err(Ok(Error::InvalidPaymentTransition))
    );
    let stranger = Address::generate(&env);
    assert_eq!(
        client.try_revoke_lease(&id, &stranger),
        Err(Ok(Error::NotFound))
    );
}

#[test]
fn revoke_lease_requires_the_creator_signature() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leaseauth", 100i128);
    client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Hour,
        &100i128,
        &String::from_str(&env, "tx"),
    );

    let intruder = Address::generate(&env);
    let invoke = MockAuthInvoke {
        contract: &client.address,
        fn_name: "revoke_lease",
        args: (id.clone(), holder.clone()).into_val(&env),
        sub_invokes: &[],
    };
    let auth = [MockAuth {
        address: &intruder,
        invoke: &invoke,
    }];
    let res = client.mock_auths(&auth).try_revoke_lease(&id, &holder);
    assert!(res.is_err(), "a non-creator must not be able to revoke a lease");
    assert!(client.lease_is_active(&id, &holder));
}

#[test]
fn lease_reads_never_panic_on_unknown_pairs_or_bad_ids() {
    let (env, creator, _settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leaseread", 100i128);

    assert!(!client.lease_is_active(&id, &holder));
    assert!(!client.lease_is_active(&String::from_str(&env, "NOT-VALID"), &holder));
    assert_eq!(client.try_get_lease(&id, &holder), Err(Ok(Error::NotFound)));
    assert_eq!(
        client.try_get_lease(&String::from_str(&env, "NOT-VALID"), &holder),
        Err(Ok(Error::InvalidResourceId))
    );
}

#[test]
fn lease_writes_respect_the_emergency_pause() {
    let (env, creator, settler, holder, client) = lease_setup();
    let admin = client.admin().unwrap();
    let id = register_priced(&env, &creator, &client, "leasepause", 100i128);
    let tx = String::from_str(&env, "tx");

    client.set_paused(&admin, &true);
    assert_eq!(
        client.try_buy_lease(&holder, &id, &LeaseTier::Hour, &100i128, &tx),
        Err(Ok(Error::ContractPaused))
    );
    assert_eq!(
        client.try_record_lease(&settler, &holder, &id, &LeaseTier::Hour, &100i128, &tx),
        Err(Ok(Error::ContractPaused))
    );
    // Reads still work while paused.
    assert!(!client.lease_is_active(&id, &holder));
    assert_eq!(client.lease_price(&id, &LeaseTier::Hour), 100i128);
}

// ─── Lease extension binding (#997) ─────────────────────────────────────────

#[test]
fn extend_lease_preserves_original_binding_after_ownership_transfer() {
    let (env, creator, settler, holder, client) = lease_setup();
    let new_owner = Address::generate(&env);
    let other_holder = Address::generate(&env);
    let id = register_priced(&env, &creator, &client, "leasebind", 100i128);
    let price = 100i128;
    let hour_amount = LEASE_HOUR_MULTIPLIER * price;
    let day_amount = LEASE_DAY_MULTIPLIER * price;
    env.ledger().set_sequence_number(200);

    let initial = client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Hour,
        &hour_amount,
        &String::from_str(&env, "tx1"),
    );
    assert_eq!(initial.holder, holder);
    assert_eq!(initial.resource_id, id);

    // A new creator must not inherit or rebind the holder's lease.
    client.transfer_ownership(&id, &new_owner);
    assert_eq!(client.get(&id).creator, new_owner);

    env.ledger().set_sequence_number(300);
    let extended = client.extend_lease(
        &holder,
        &id,
        &LeaseTier::Day,
        &day_amount,
        &String::from_str(&env, "tx2"),
    );
    assert_eq!(extended.holder, holder);
    assert_eq!(extended.resource_id, id);
    assert_eq!(extended.tier, LeaseTier::Day);
    assert_eq!(extended.start_ledger, initial.start_ledger);
    assert_eq!(
        extended.expiry_ledger,
        initial.expiry_ledger + LEASE_DAY_LEDGERS
    );
    assert_eq!(extended.amount, hour_amount + day_amount);
    assert_eq!(extended.tx_hash, String::from_str(&env, "tx2"));
    assert_eq!(extended.state, LeaseState::Active);
    assert_eq!(extended.recorded_at, 300);
    assert_eq!(client.get_lease(&id, &holder), extended);
    assert!(client.lease_is_active(&id, &holder));
    assert_eq!(last_lease_event(&env, symbol_short!("lease"), &id), extended);

    // A payment hash cannot be replayed for another extension.
    assert_eq!(
        client.try_extend_lease(
            &holder,
            &id,
            &LeaseTier::Day,
            &day_amount,
            &String::from_str(&env, "tx2"),
        ),
        Err(Ok(Error::DuplicateTxHash))
    );

    // A different holder has no lease under its own key.
    assert_eq!(
        client.try_extend_lease(
            &other_holder,
            &id,
            &LeaseTier::Hour,
            &hour_amount,
            &String::from_str(&env, "tx3"),
        ),
        Err(Ok(Error::NotFound))
    );

    // If storage itself is inconsistent, the write still refuses to rebind it.
    env.as_contract(&client.address, || {
        let key = DataKey::Lease(id.clone(), other_holder.clone());
        let mismatched = Lease {
            resource_id: id.clone(),
            holder: holder.clone(),
            tier: LeaseTier::Hour,
            start_ledger: 200,
            expiry_ledger: 900,
            amount: hour_amount,
            tx_hash: String::from_str(&env, "txbad"),
            state: LeaseState::Active,
            recorded_at: 200,
        };
        env.storage().persistent().set(&key, &mismatched);
    });
    assert_eq!(
        client.try_extend_lease(
            &other_holder,
            &id,
            &LeaseTier::Hour,
            &hour_amount,
            &String::from_str(&env, "tx4"),
        ),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn extend_lease_renews_expired_leases_but_not_pending_or_revoked_ones() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leaseexp", 100i128);
    let price = 100i128;
    let hour_amount = LEASE_HOUR_MULTIPLIER * price;
    let day_amount = LEASE_DAY_MULTIPLIER * price;
    let week_amount = LEASE_WEEK_MULTIPLIER * price;

    env.ledger().set_sequence_number(100);
    let pending = client.buy_lease(
        &holder,
        &id,
        &LeaseTier::Hour,
        &hour_amount,
        &String::from_str(&env, "tx1"),
    );
    assert_eq!(
        client.try_extend_lease(
            &holder,
            &id,
            &LeaseTier::Day,
            &day_amount,
            &String::from_str(&env, "tx-pending"),
        ),
        Err(Ok(Error::InvalidPaymentTransition))
    );

    client.settle_lease(&settler, &id, &holder);
    assert!(client.lease_is_active(&id, &holder));

    // Expiry stops access but keeps the record, so the holder can renew it.
    env.ledger().set_sequence_number(pending.expiry_ledger);
    assert!(!client.lease_is_active(&id, &holder));
    let renewed = client.extend_lease(
        &holder,
        &id,
        &LeaseTier::Day,
        &day_amount,
        &String::from_str(&env, "tx-renew"),
    );
    assert_eq!(renewed.resource_id, id);
    assert_eq!(renewed.holder, holder);
    assert_eq!(renewed.start_ledger, pending.start_ledger);
    assert_eq!(
        renewed.expiry_ledger,
        pending.expiry_ledger + LEASE_DAY_LEDGERS
    );
    assert_eq!(renewed.amount, hour_amount + day_amount);
    assert_eq!(renewed.state, LeaseState::Active);
    assert!(client.lease_is_active(&id, &holder));

    // Revocation is terminal for extension, even though a fresh purchase is not.
    let revoked = client.revoke_lease(&id, &holder);
    assert_eq!(revoked.state, LeaseState::Revoked);
    assert_eq!(
        client.try_extend_lease(
            &holder,
            &id,
            &LeaseTier::Week,
            &week_amount,
            &String::from_str(&env, "tx-after-revoke"),
        ),
        Err(Ok(Error::InvalidPaymentTransition))
    );
    assert!(!client.lease_is_active(&id, &holder));
}

#[test]
fn lease_renewal_writes_reject_a_stored_binding_mismatch() {
    let (env, creator, settler, holder, client) = lease_setup();
    let other_holder = Address::generate(&env);
    let id = register_priced(&env, &creator, &client, "leasewrong", 100i128);
    let amount = LEASE_HOUR_MULTIPLIER * 100i128;
    let tx = String::from_str(&env, "tx1");
    env.ledger().set_sequence_number(10);

    client.buy_lease(&holder, &id, &LeaseTier::Hour, &amount, &tx);

    env.as_contract(&client.address, || {
        let key = DataKey::Lease(id.clone(), holder.clone());
        let mismatched = Lease {
            resource_id: id.clone(),
            holder: other_holder.clone(),
            tier: LeaseTier::Hour,
            start_ledger: 10,
            expiry_ledger: 10 + LEASE_HOUR_LEDGERS,
            amount,
            tx_hash: tx.clone(),
            state: LeaseState::Pending,
            recorded_at: 10,
        };
        env.storage().persistent().set(&key, &mismatched);
    });

    assert_eq!(
        client.try_settle_lease(&settler, &id, &holder),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        client.try_buy_lease(
            &holder,
            &id,
            &LeaseTier::Hour,
            &amount,
            &String::from_str(&env, "tx2"),
        ),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(client.get_lease(&id, &holder).state, LeaseState::Pending);
}

// ─── Fee config protection for active leases (#991) ──────────────────────────

#[test]
fn set_fee_config_blocked_when_fees_would_exceed_listed_resource_price() {
    let (env, creator, _settler, holder, client) = lease_setup();
    let admin = client.admin().unwrap();
    
    // Register a resource with a low price
    let id = register_priced(&env, &creator, &client, "lowprice", 100i128);
    
    // Create an active lease on it
    client.record_lease(
        &client.admin().unwrap(),
        &holder,
        &id,
        &LeaseTier::Hour,
        &100i128,
        &String::from_str(&env, "tx1"),
    );
    
    // Set initial fee config that's valid (combined 50 < 100)
    client.set_fee_config(&FeeConfig {
        platform_fee_bps: 25,
        royalty_bps: 25,
        fee_recipient: None,
    });
    
    // Try to increase fees such that combined >= resource price
    // 100 bps combined would equal the resource price of 100
    let result = client.try_set_fee_config(&FeeConfig {
        platform_fee_bps: 50,
        royalty_bps: 50,
        fee_recipient: None,
    });
    
    assert_eq!(result, Err(Ok(Error::LeaseFeeConfigConflict)));
}

#[test]
fn set_fee_config_allowed_when_fees_stay_below_all_listed_prices() {
    let (env, creator, _settler, holder, client) = lease_setup();
    let admin = client.admin().unwrap();
    
    // Register resources with various prices
    let id1 = register_priced(&env, &creator, &client, "price1000", 1_000i128);
    let id2 = register_priced(&env, &creator, &client, "price2000", 2_000i128);
    
    // Create active leases
    client.record_lease(
        &admin,
        &holder,
        &id1,
        &LeaseTier::Hour,
        &1_000i128,
        &String::from_str(&env, "tx1"),
    );
    
    let holder2 = Address::generate(&env);
    client.record_lease(
        &admin,
        &holder2,
        &id2,
        &LeaseTier::Day,
        &10_000i128,
        &String::from_str(&env, "tx2"),
    );
    
    // Fee config with combined 500 bps is valid (500 < 1000)
    let result = client.try_set_fee_config(&FeeConfig {
        platform_fee_bps: 250,
        royalty_bps: 250,
        fee_recipient: None,
    });
    
    assert!(result.is_ok());
}

#[test]
fn set_fee_config_considers_only_listed_resources() {
    let (env, creator, _settler, holder, client) = lease_setup();
    let admin = client.admin().unwrap();
    
    // Register a low-priced resource and delist it
    let id1 = register_priced(&env, &creator, &client, "delisted", 50i128);
    client.delist(&id1);
    
    // Register another resource with higher price that stays listed
    let id2 = register_priced(&env, &creator, &client, "listed", 1_000i128);
    
    // Create lease on the listed resource
    client.record_lease(
        &admin,
        &holder,
        &id2,
        &LeaseTier::Hour,
        &1_000i128,
        &String::from_str(&env, "tx1"),
    );
    
    // Fee config with combined 500 bps should be accepted because:
    // - delisted resource (50) is ignored
    // - listed resource (1000) allows fees up to 999
    let result = client.try_set_fee_config(&FeeConfig {
        platform_fee_bps: 250,
        royalty_bps: 250,
        fee_recipient: None,
    });
    
    assert!(result.is_ok());
}

#[test]
fn existing_lease_preserves_original_price_despite_fee_changes() {
    let (env, creator, settler, holder, client) = lease_setup();
    let admin = client.admin().unwrap();
    
    // Register resource and set low fees
    let id = register_priced(&env, &creator, &client, "preserve", 10_000i128);
    client.set_fee_config(&FeeConfig {
        platform_fee_bps: 100,  // 1%
        royalty_bps: 100,       // 1%
        fee_recipient: None,
    });
    
    // Buy a lease at this price point
    let lease1 = client.buy_lease(
        &holder,
        &id,
        &LeaseTier::Day,
        &50_000i128,  // 10_000 * 5
        &String::from_str(&env, "tx1"),
    );
    client.settle_lease(&settler, &id, &holder);
    
    // The lease locked in the amount paid
    assert_eq!(lease1.amount, 50_000i128);
    
    // Increase the resource price
    client.set_price(&id, &20_000i128);
    
    // Update fees (still valid because 1000 < 20000)
    client.set_fee_config(&FeeConfig {
        platform_fee_bps: 500,  // 5%
        royalty_bps: 500,       // 5%
        fee_recipient: None,
    });
    
    // The original lease still has its locked-in amount
    let stored_lease = client.get_lease(&id, &holder);
    assert_eq!(stored_lease.amount, 50_000i128);
    
    // New leases use the new price
    let holder2 = Address::generate(&env);
    let lease2 = client.buy_lease(
        &holder2,
        &id,
        &LeaseTier::Day,
        &100_000i128,  // 20_000 * 5
        &String::from_str(&env, "tx2"),
    );
    assert_eq!(lease2.amount, 100_000i128);
}

#[test]
fn zero_fee_config_always_allowed() {
    let (env, creator, _settler, holder, client) = lease_setup();
    let admin = client.admin().unwrap();
    
    // Register resource with any price, even very low
    let id = register_priced(&env, &creator, &client, "anyprice", 1i128);
    
    // Create a lease
    client.record_lease(
        &admin,
        &holder,
        &id,
        &LeaseTier::Hour,
        &1i128,
        &String::from_str(&env, "tx1"),
    );
    
    // Zero fees should always be acceptable
    let result = client.try_set_fee_config(&FeeConfig {
        platform_fee_bps: 0,
        royalty_bps: 0,
        fee_recipient: None,
    });
    
    assert!(result.is_ok());
}

#[test]
fn renew_lease_is_allowed_before_expiry_and_rejected_at_exact_expiry() {
    let (env, creator, settler, holder, client) = lease_setup();

    env.ledger().set_sequence_number(100);
    let exact_id = register_priced(&env, &creator, &client, "renewexact", 100i128);
    let exact_original = client.record_lease(
        &settler,
        &holder,
        &exact_id,
        &LeaseTier::Hour,
        &100i128,
        &String::from_str(&env, "exact-origin"),
    );

    env.ledger().set_sequence_number(exact_original.expiry_ledger);
    let before_rejection_events = env.events().all().len();
    assert_eq!(
        client.try_renew_lease(
            &holder,
            &exact_id,
            &LeaseTier::Day,
            &500i128,
            &String::from_str(&env, "renew-at-expiry"),
        ),
        Err(Ok(Error::InvalidPaymentTransition))
    );
    assert_eq!(client.get_lease(&exact_id, &holder), exact_original);
    assert_eq!(env.events().all().len(), before_rejection_events);

    env.ledger().set_sequence_number(100);
    let before_id = register_priced(&env, &creator, &client, "renewbefore", 100i128);
    let original = client.record_lease(
        &settler,
        &holder,
        &before_id,
        &LeaseTier::Hour,
        &100i128,
        &String::from_str(&env, "renew-origin"),
    );

    env.ledger().set_sequence_number(original.expiry_ledger - 1);
    let renewed = client.renew_lease(
        &holder,
        &before_id,
        &LeaseTier::Day,
        &500i128,
        &String::from_str(&env, "renew-before"),
    );

    assert_eq!(renewed.resource_id, before_id);
    assert_eq!(renewed.holder, holder);
    assert_eq!(renewed.tier, LeaseTier::Day);
    assert_eq!(renewed.expiry_ledger, original.expiry_ledger + LEASE_DAY_LEDGERS);
    assert_eq!(renewed.amount, 500i128);
    assert_eq!(
        last_lease_event(&env, symbol_short!("leasernew"), &before_id),
        renewed
    );
}

#[test]
fn lease_quote_returns_price_and_duration_for_each_tier() {
    let (env, creator, _settler, _holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leasequote", 1_000i128);

    let hour = client.lease_quote(&id, &LeaseTier::Hour);
    assert_eq!(hour.resource_id, id);
    assert_eq!(hour.tier, LeaseTier::Hour);
    assert_eq!(hour.price, 1_000i128);
    assert_eq!(hour.duration_ledgers, LEASE_HOUR_LEDGERS);

    let day = client.lease_quote(&id, &LeaseTier::Day);
    assert_eq!(day.resource_id, id);
    assert_eq!(day.tier, LeaseTier::Day);
    assert_eq!(day.price, 5_000i128);
    assert_eq!(day.duration_ledgers, LEASE_DAY_LEDGERS);

    let week = client.lease_quote(&id, &LeaseTier::Week);
    assert_eq!(week.resource_id, id);
    assert_eq!(week.tier, LeaseTier::Week);
    assert_eq!(week.price, 20_000i128);
    assert_eq!(week.duration_ledgers, LEASE_WEEK_LEDGERS);
}
