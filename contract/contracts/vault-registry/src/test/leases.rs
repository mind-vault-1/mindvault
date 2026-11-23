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

#[test]
fn lease_quote_returns_price_and_duration_for_all_tiers() {
    let (env, creator, _settler, _holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "leasequote", 1_000i128);

    // Hour tier: 1x multiplier, 720 ledgers
    let hour_quote = client.lease_quote(&id, &LeaseTier::Hour);
    assert_eq!(hour_quote.resource_id, id);
    assert_eq!(hour_quote.tier, LeaseTier::Hour);
    assert_eq!(hour_quote.price, 1_000i128);
    assert_eq!(hour_quote.duration_ledgers, LEASE_HOUR_LEDGERS);

    // Day tier: 5x multiplier, 17_280 ledgers
    let day_quote = client.lease_quote(&id, &LeaseTier::Day);
    assert_eq!(day_quote.resource_id, id);
    assert_eq!(day_quote.tier, LeaseTier::Day);
    assert_eq!(day_quote.price, 5_000i128);
    assert_eq!(day_quote.duration_ledgers, LEASE_DAY_LEDGERS);

    // Week tier: 20x multiplier, 120_960 ledgers
    let week_quote = client.lease_quote(&id, &LeaseTier::Week);
    assert_eq!(week_quote.resource_id, id);
    assert_eq!(week_quote.tier, LeaseTier::Week);
    assert_eq!(week_quote.price, 20_000i128);
    assert_eq!(week_quote.duration_ledgers, LEASE_WEEK_LEDGERS);

    // Quote tracks price changes
    client.set_price(&id, &2_000i128);
    let updated = client.lease_quote(&id, &LeaseTier::Week);
    assert_eq!(updated.price, 40_000i128);
    assert_eq!(updated.duration_ledgers, LEASE_WEEK_LEDGERS);

    // Unknown resource returns NotFound
    assert_eq!(
        client.try_lease_quote(&String::from_str(&env, "nosuchquote"), &LeaseTier::Hour),
        Err(Ok(Error::NotFound))
    );
}

#[test]
fn lease_quote_boundary_cases() {
    let (env, creator, _settler, _holder, client) = lease_setup();

    // Minimum valid price (1 stroop)
    let id_min = register_priced(&env, &creator, &client, "quoteminprice", 1i128);
    let quote_min = client.lease_quote(&id_min, &LeaseTier::Hour);
    assert_eq!(quote_min.price, 1i128);
    assert_eq!(quote_min.duration_ledgers, LEASE_HOUR_LEDGERS);

    // Large price (but within MAX_PRICE)
    let large_price = 1_000_000_000i128; // 100 USDC
    let id_large = register_priced(&env, &creator, &client, "quotelargeprice", large_price);
    let quote_large = client.lease_quote(&id_large, &LeaseTier::Week);
    assert_eq!(quote_large.price, large_price * 20);
    assert_eq!(quote_large.duration_ledgers, LEASE_WEEK_LEDGERS);

    // Invalid resource ID
    assert_eq!(
        client.try_lease_quote(&String::from_str(&env, "INVALID-ID!"), &LeaseTier::Day),
        Err(Ok(Error::InvalidResourceId))
    );
}

#[test]
fn lease_quote_preserves_atomic_failure_semantics() {
    let (env, creator, _settler, _holder, client) = lease_setup();

    // Quote on non-existent resource should not modify storage
    let result = client.try_lease_quote(&String::from_str(&env, "doesnotexist"), &LeaseTier::Day);
    assert_eq!(result, Err(Ok(Error::NotFound)));

    // Verify no events were emitted (storage unchanged)
    let events_before = env.events().all().len();
    let _ = client.try_lease_quote(&String::from_str(&env, "stillnone"), &LeaseTier::Hour);
    let events_after = env.events().all().len();
    assert_eq!(events_before, events_after, "lease_quote must not emit events on failure");
}

// ─── Lease renewal eligibility checks ────────────────────────────────────────

#[test]
fn check_lease_renewal_eligibility_returns_info_for_active_lease() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "renewcheck", 1_000i128);
    env.ledger().set_sequence_number(100);

    // Create and settle an active lease
    client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Day,
        &5_000i128,
        &String::from_str(&env, "tx1"),
    );

    let renewal_info = client.check_lease_renewal_eligibility(&id, &holder);

    assert_eq!(renewal_info.resource_id, id);
    assert_eq!(renewal_info.holder, holder);
    assert_eq!(renewal_info.current_tier, LeaseTier::Day);
    assert!(renewal_info.renewable, "Active lease should be renewable");
    assert_eq!(renewal_info.current_expiry, 100 + LEASE_DAY_LEDGERS);
    assert_eq!(renewal_info.renewal_price, 5_000i128); // 1000 * 5
    assert_eq!(renewal_info.renewal_duration, LEASE_DAY_LEDGERS);
    assert_eq!(
        renewal_info.new_expiry_after_renewal,
        100 + LEASE_DAY_LEDGERS + LEASE_DAY_LEDGERS
    );
}

#[test]
fn check_lease_renewal_eligibility_tracks_price_changes() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "renewprice", 1_000i128);
    env.ledger().set_sequence_number(100);

    client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Week,
        &20_000i128,
        &String::from_str(&env, "tx1"),
    );

    // Check initial renewal price
    let info1 = client.check_lease_renewal_eligibility(&id, &holder);
    assert_eq!(info1.renewal_price, 20_000i128); // 1000 * 20

    // Resource price changes
    client.set_price(&id, &2_000i128);

    // Renewal price should reflect new resource price
    let info2 = client.check_lease_renewal_eligibility(&id, &holder);
    assert_eq!(info2.renewal_price, 40_000i128); // 2000 * 20
    assert_eq!(info2.renewal_duration, LEASE_WEEK_LEDGERS);
    assert!(info2.renewable);
}

#[test]
fn check_lease_renewal_eligibility_not_renewable_when_expired() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "renewexp", 100i128);
    env.ledger().set_sequence_number(100);

    client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Hour,
        &100i128,
        &String::from_str(&env, "tx1"),
    );

    // Move to expiry
    env.ledger().set_sequence_number(100 + LEASE_HOUR_LEDGERS);

    let renewal_info = client.check_lease_renewal_eligibility(&id, &holder);
    assert!(!renewal_info.renewable, "Expired lease should not be renewable");
    assert_eq!(renewal_info.current_expiry, 100 + LEASE_HOUR_LEDGERS);
    // Price and duration still returned for reference
    assert_eq!(renewal_info.renewal_price, 100i128);
    assert_eq!(renewal_info.renewal_duration, LEASE_HOUR_LEDGERS);
}

#[test]
fn check_lease_renewal_eligibility_not_renewable_when_revoked() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "renewrevk", 100i128);

    client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Day,
        &500i128,
        &String::from_str(&env, "tx1"),
    );

    // Creator revokes the lease
    client.revoke_lease(&id, &holder);

    let renewal_info = client.check_lease_renewal_eligibility(&id, &holder);
    assert!(!renewal_info.renewable, "Revoked lease should not be renewable");
}

#[test]
fn check_lease_renewal_eligibility_not_renewable_when_resource_delisted() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "renewdelist", 100i128);

    client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Day,
        &500i128,
        &String::from_str(&env, "tx1"),
    );

    // Lease is active
    assert!(client.lease_is_active(&id, &holder));

    // But resource gets delisted
    client.delist(&id);

    let renewal_info = client.check_lease_renewal_eligibility(&id, &holder);
    assert!(!renewal_info.renewable, "Lease on delisted resource should not be renewable");
    // Existing lease still grants access until expiry
    assert!(client.lease_is_active(&id, &holder));
}

#[test]
fn check_lease_renewal_eligibility_errors_for_nonexistent_lease() {
    let (env, creator, _settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "renewnone", 100i128);

    assert_eq!(
        client.try_check_lease_renewal_eligibility(&id, &holder),
        Err(Ok(Error::NotFound))
    );
}

#[test]
fn check_lease_renewal_eligibility_errors_for_invalid_resource_id() {
    let (env, _creator, _settler, holder, client) = lease_setup();

    assert_eq!(
        client.try_check_lease_renewal_eligibility(
            &String::from_str(&env, "INVALID-ID!"),
            &holder
        ),
        Err(Ok(Error::InvalidResourceId))
    );
}

#[test]
fn check_lease_renewal_eligibility_boundary_at_exact_expiry() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "renewbound", 100i128);
    env.ledger().set_sequence_number(1_000);

    client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Hour,
        &100i128,
        &String::from_str(&env, "tx1"),
    );

    let expiry = 1_000 + LEASE_HOUR_LEDGERS;

    // One ledger before expiry: renewable
    env.ledger().set_sequence_number(expiry - 1);
    let info_before = client.check_lease_renewal_eligibility(&id, &holder);
    assert!(info_before.renewable, "Should be renewable one ledger before expiry");

    // Exactly at expiry: not renewable (expiry_ledger is first ledger without access)
    env.ledger().set_sequence_number(expiry);
    let info_at = client.check_lease_renewal_eligibility(&id, &holder);
    assert!(!info_at.renewable, "Should not be renewable at exact expiry ledger");

    // After expiry: not renewable
    env.ledger().set_sequence_number(expiry + 1);
    let info_after = client.check_lease_renewal_eligibility(&id, &holder);
    assert!(!info_after.renewable, "Should not be renewable after expiry");
}

#[test]
fn check_lease_renewal_eligibility_calculates_new_expiry_correctly() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "renewcalc", 1_000i128);
    env.ledger().set_sequence_number(500);

    // Create hour lease
    client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Hour,
        &1_000i128,
        &String::from_str(&env, "tx1"),
    );

    let original_expiry = 500 + LEASE_HOUR_LEDGERS; // 500 + 720 = 1220
    let info = client.check_lease_renewal_eligibility(&id, &holder);

    assert_eq!(info.current_expiry, original_expiry);
    assert_eq!(
        info.new_expiry_after_renewal,
        original_expiry + LEASE_HOUR_LEDGERS,
        "New expiry should be current expiry + renewal duration"
    );
    assert_eq!(info.new_expiry_after_renewal, 1220 + 720);
}

#[test]
fn check_lease_renewal_eligibility_pending_lease_not_renewable() {
    let (env, creator, _settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "renewpend", 100i128);

    // Buy lease but don't settle it (stays Pending)
    client.buy_lease(
        &holder,
        &id,
        &LeaseTier::Day,
        &500i128,
        &String::from_str(&env, "tx1"),
    );

    let renewal_info = client.check_lease_renewal_eligibility(&id, &holder);
    assert!(!renewal_info.renewable, "Pending lease should not be renewable");
}

#[test]
fn renew_lease_extends_active_expiry_and_emits_event() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "renewlease", 100i128);
    env.ledger().set_sequence_number(1_000);

    let original = client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Hour,
        &100i128,
        &String::from_str(&env, "tx1"),
    );
    env.ledger().set_sequence_number(1_000 + 300);

    let renewed = client.renew_lease(
        &holder,
        &id,
        &LeaseTier::Hour,
        &100i128,
        &String::from_str(&env, "tx2"),
    );

    assert_eq!(renewed.expiry_ledger, original.expiry_ledger + LEASE_HOUR_LEDGERS);
    assert_eq!(renewed.amount, 100i128);
    assert_eq!(renewed.recorded_at, 1_300);
    assert_eq!(renewed.tx_hash, String::from_str(&env, "tx2"));
    assert_eq!(last_lease_event(&env, symbol_short!("leasernew"), &id), renewed);
    assert!(client.lease_is_active(&id, &holder));
}

#[test]
fn renew_lease_requires_holder_exact_price_and_active_window() {
    let (env, creator, settler, holder, client) = lease_setup();
    let id = register_priced(&env, &creator, &client, "renewauth", 100i128);
    env.ledger().set_sequence_number(2_000);

    client.record_lease(
        &settler,
        &holder,
        &id,
        &LeaseTier::Day,
        &500i128,
        &String::from_str(&env, "tx1"),
    );

    assert_eq!(
        client.try_renew_lease(
            &holder,
            &id,
            &LeaseTier::Day,
            &499i128,
            &String::from_str(&env, "tx2"),
        ),
        Err(Ok(Error::PaymentAmountMismatch))
    );

    let intruder = Address::generate(&env);
    let invoke = MockAuthInvoke {
        contract: &client.address,
        fn_name: "renew_lease",
        args: (
            intruder.clone(),
            id.clone(),
            LeaseTier::Day,
            500i128,
            String::from_str(&env, "tx2"),
        )
            .into_val(&env),
        sub_invokes: &[],
    };
    let auth = [MockAuth {
        address: &intruder,
        invoke: &invoke,
    }];
    assert!(client.mock_auths(&auth).try_renew_lease(
        &intruder,
        &id,
        &LeaseTier::Day,
        &500i128,
        &String::from_str(&env, "tx2"),
    ).is_err());

    env.ledger().set_sequence_number(2_000 + LEASE_DAY_LEDGERS);
    assert_eq!(
        client.try_renew_lease(
            &holder,
            &id,
            &LeaseTier::Day,
            &500i128,
            &String::from_str(&env, "tx3"),
        ),
        Err(Ok(Error::InvalidPaymentTransition))
    );
}
