// ─── Fee arithmetic and refund reason hash (#986, #1171) ────────────────────

fn settled_payment<'a>(
    env: &Env,
    creator: &Address,
    settler: &Address,
    client: &VaultRegistryClient<'a>,
    resource_id: &str,
    payment_id: &str,
    tx_hash: &str,
) -> (String, String) {
    let resource = register_priced(env, creator, client, resource_id, 1_000_000);
    let payment = String::from_str(env, payment_id);
    client.record_payment(
        settler,
        &payment,
        &resource,
        creator,
        &1_000_000i128,
        &String::from_str(env, tx_hash),
    );
    client.settle_payment(settler, &payment);
    (resource, payment)
}

fn refund_event(
    env: &Env,
    contract: &Address,
    refund_id: &String,
) -> Option<RefundReceipt> {
    for (emitter, topics, data) in env.events().all() {
        if emitter != *contract || topics.len() < 2 {
            continue;
        }
        let topic: Symbol = topics.get(0).unwrap().try_into_val(env).unwrap();
        if topic != symbol_short!("refund") {
            continue;
        }
        let emitted_id: String = topics.get(1).unwrap().try_into_val(env).unwrap();
        if emitted_id == *refund_id {
            return Some(data.try_into_val(env).unwrap());
        }
    }
    None
}

#[test]
fn set_fee_config_rejects_extreme_bps_without_writes_or_events() {
    let (env, _creator, _admin, client) = setup_with_admin();
    let before = client.get_fee_config();
    let events_before = env.events().all().len();

    let result = client.try_set_fee_config(&FeeConfig {
        platform_fee_bps: u32::MAX,
        royalty_bps: 1,
        fee_recipient: None,
    });

    assert_eq!(result, Err(Ok(Error::FeeBpsTooHigh)));
    assert_eq!(client.get_fee_config(), before);
    assert_eq!(env.events().all().len(), events_before);
}

#[test]
fn set_fee_config_rejects_combined_boundary_breach_atomically() {
    let (env, _creator, _admin, client) = setup_with_admin();
    client.set_fee_config(&FeeConfig {
        platform_fee_bps: 2_000,
        royalty_bps: 1_000,
        fee_recipient: None,
    });
    let before = client.get_fee_config();
    let events_before = env.events().all().len();

    let result = client.try_set_fee_config(&FeeConfig {
        platform_fee_bps: MAX_FEE_BPS / 2 + 1,
        royalty_bps: MAX_FEE_BPS / 2,
        fee_recipient: None,
    });

    assert_eq!(result, Err(Ok(Error::TotalFeeTooHigh)));
    assert_eq!(client.get_fee_config(), before);
    assert_eq!(env.events().all().len(), events_before);
}

#[test]
fn set_fee_config_requires_admin_auth_and_leaves_state_unchanged() {
    let (env, _creator, _admin, client) = setup_with_admin();
    client.set_fee_config(&FeeConfig {
        platform_fee_bps: 500,
        royalty_bps: 250,
        fee_recipient: None,
    });
    let before = client.get_fee_config();
    let events_before = env.events().all().len();

    env.mock_auths(&[]);
    let result = client.try_set_fee_config(&FeeConfig {
        platform_fee_bps: 1_000,
        royalty_bps: 1_000,
        fee_recipient: None,
    });

    assert!(result.is_err());
    assert_eq!(client.get_fee_config(), before);
    assert_eq!(env.events().all().len(), events_before);
}

#[test]
fn fee_config_lease_guard_rejects_u32_overflow() {
    let (env, _creator, _admin, client) = setup_with_admin();
    let config = FeeConfig {
        platform_fee_bps: u32::MAX,
        royalty_bps: 1,
        fee_recipient: None,
    };

    let result = env.as_contract(&client.address, || {
        VaultRegistry::validate_fee_config_for_leases(&env, &config)
    });

    assert_eq!(result, Err(Error::LeaseFeeConfigConflict));
}

#[test]
fn creator_refund_reason_hash_is_stored_and_emitted() {
    let (env, creator, _admin, settler, client) = setup_with_settler();
    let (_resource, payment) = settled_payment(
        &env,
        &creator,
        &settler,
        &client,
        "rrhcreate",
        "rrhcreatepay",
        "0xrrhcreatepay",
    );
    let refund_id = String::from_str(&env, "rrhcreate1");
    let reason = String::from_str(&env, "sha256:creator-dispute-1");

    client.record_creator_refund_reason(
        &creator,
        &refund_id,
        &payment,
        &creator,
        &100_000i128,
        &String::from_str(&env, "0xrrhcreate1"),
        &Some(reason.clone()),
    );

    let receipt = client.get_refund(&refund_id);
    assert_eq!(receipt.reason_hash, Some(reason.clone()));
    let event = refund_event(&env, &client.address, &refund_id)
        .expect("refund event must carry the reason hash");
    assert_eq!(event.reason_hash, Some(reason));
}

#[test]
fn admin_refund_reason_hash_is_stored_and_emitted() {
    let (env, creator, admin, settler, client) = setup_with_settler();
    let (_resource, payment) = settled_payment(
        &env,
        &creator,
        &settler,
        &client,
        "rrhadmin",
        "rrhadm",
        "0xrrhadm",
    );
    let refund_id = String::from_str(&env, "rrhadmin1");
    let reason = String::from_str(&env, "sha256:admin-dispute-1");

    client.record_admin_refund_with_reason(
        &admin,
        &refund_id,
        &payment,
        &creator,
        &100_000i128,
        &String::from_str(&env, "0xrrhadmin1"),
        &Some(reason.clone()),
    );

    let receipt = client.get_refund(&refund_id);
    assert_eq!(receipt.reason_hash, Some(reason.clone()));
    assert!(receipt.admin_override);
    let event = refund_event(&env, &client.address, &refund_id)
        .expect("refund event must carry the reason hash");
    assert_eq!(event.reason_hash, Some(reason));
}

#[test]
fn refund_reason_hash_bounds_are_atomic() {
    let (env, creator, _admin, settler, client) = setup_with_settler();
    let (_resource, payment) = settled_payment(
        &env,
        &creator,
        &settler,
        &client,
        "rrhbounds",
        "rrhbounds",
        "0xrrhbounds",
    );
    let events_before = env.events().all().len();

    let empty_id = String::from_str(&env, "rrhempty");
    let empty_result = client.try_record_creator_refund_reason(
        &creator,
        &empty_id,
        &payment,
        &creator,
        &100_000i128,
        &String::from_str(&env, "0xrrhempty"),
        &Some(String::from_str(&env, "")),
    );
    assert_eq!(empty_result, Err(Ok(Error::RefundReasonHashTooLong)));

    let long_id = String::from_str(&env, "rrhlong");
    let long_result = client.try_record_creator_refund_reason(
        &creator,
        &long_id,
        &payment,
        &creator,
        &100_000i128,
        &String::from_str(&env, "0xrrhlong"),
        &Some(String::from_str(&env, &"a".repeat(65))),
    );
    assert_eq!(long_result, Err(Ok(Error::RefundReasonHashTooLong)));

    for id in [empty_id, long_id] {
        let written = env.as_contract(&client.address, || {
            env.storage()
                .persistent()
                .has(&DataKey::RefundReceipt(id.clone()))
        });
        assert!(!written, "invalid reason hash must not write a receipt");
    }
    assert_eq!(env.events().all().len(), events_before);
}

#[test]
fn refund_reads_from_legacy_storage_have_no_reason_hash() {
    let (env, creator, _admin, settler, client) = setup_with_settler();
    let (resource, payment) = settled_payment(
        &env,
        &creator,
        &settler,
        &client,
        "rrhstored",
        "rrhstored",
        "0xrrhstored",
    );
    let refund_id = String::from_str(&env, "rrhstored1");
    let stored = StoredRefundReceipt {
        refund_id: refund_id.clone(),
        payment_receipt_id: payment,
        resource_id: resource,
        recipient: creator.clone(),
        amount: 100_000i128,
        tx_hash: String::from_str(&env, "0xrrhstored1"),
        initiated_by: creator,
        recorded_at: env.ledger().sequence(),
        admin_override: false,
        remaining_balance: 900_000i128,
    };

    env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .set(&DataKey::RefundReceipt(refund_id.clone()), &stored);
    });

    assert_eq!(client.get_refund(&refund_id).reason_hash, None);
}

#[test]
fn legacy_refund_entry_points_store_no_reason_hash() {
    let (env, creator, _admin, settler, client) = setup_with_settler();
    let (_resource, payment) = settled_payment(
        &env,
        &creator,
        &settler,
        &client,
        "rrhlegacy",
        "rrhlegacy",
        "0xrrhlegacy",
    );
    let refund_id = String::from_str(&env, "rrhlegacy1");

    client.record_creator_refund(
        &creator,
        &refund_id,
        &payment,
        &creator,
        &100_000i128,
        &String::from_str(&env, "0xrrhlegacy1"),
    );

    assert_eq!(client.get_refund(&refund_id).reason_hash, None);
    let event = refund_event(&env, &client.address, &refund_id)
        .expect("legacy refund must still emit an event");
    assert_eq!(event.reason_hash, None);
}
