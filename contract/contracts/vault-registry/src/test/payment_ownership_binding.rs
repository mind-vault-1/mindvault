// ─── Receipt ownership binding (#1241) ─────────────────────────────────────

#[test]
fn settle_rejects_receipt_after_resource_ownership_transfer() {
    let (env, creator, _admin, settler, client) = setup_with_settler();
    let id = register_default(&env, &creator, &client, "bindsettle");
    let new_creator = Address::generate(&env);
    let payer = Address::generate(&env);
    let receipt_id = String::from_str(&env, "bindrcpt1");
    let tx_hash = String::from_str(&env, "bindtx1");

    client.record_payment(
        &settler,
        &receipt_id,
        &id,
        &payer,
        &100i128,
        &tx_hash,
    );
    client.transfer_ownership(&id, &new_creator);

    assert_eq!(
        client.try_settle_payment(&settler, &receipt_id),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(client.get_payment(&receipt_id).state, PaymentState::Escrowed);
    assert!(client.try_get_refund_deadline(&receipt_id).is_err());
    assert_eq!(client.get_refunded_amount(&receipt_id), 0i128);
}

#[test]
fn refund_rejects_receipt_after_resource_ownership_transfer() {
    let (env, creator, admin, settler, client) = setup_with_settler();
    let id = register_default(&env, &creator, &client, "bindrefund");
    let new_creator = Address::generate(&env);
    let payer = Address::generate(&env);
    let receipt_id = String::from_str(&env, "bindrcpt2");

    client.record_payment(
        &settler,
        &receipt_id,
        &id,
        &payer,
        &100i128,
        &String::from_str(&env, "bindtx2"),
    );
    client.settle_payment(&settler, &receipt_id);
    client.transfer_ownership(&id, &new_creator);

    // Neither the previous owner nor the current one can move the refund,
    // and the admin override must not bypass the receipt binding either.
    assert_eq!(
        client.try_record_creator_refund(
            &creator,
            &String::from_str(&env, "bindrefd2a"),
            &receipt_id,
            &payer,
            &10i128,
            &String::from_str(&env, "bindrtx2a"),
        ),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        client.try_record_creator_refund(
            &new_creator,
            &String::from_str(&env, "bindrefd2b"),
            &receipt_id,
            &payer,
            &10i128,
            &String::from_str(&env, "bindrtx2b"),
        ),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(
        client.try_record_admin_refund(
            &admin,
            &String::from_str(&env, "bindrefd2c"),
            &receipt_id,
            &payer,
            &10i128,
            &String::from_str(&env, "bindrtx2c"),
        ),
        Err(Ok(Error::Unauthorized))
    );

    assert!(client
        .try_get_refund(&String::from_str(&env, "bindrefd2a"))
        .is_err());
    assert_eq!(client.get_refunded_amount(&receipt_id), 0i128);
}

#[test]
fn idempotent_retry_keeps_the_original_creator_binding() {
    let (env, creator, _admin, settler, client) = setup_with_settler();
    let id = register_default(&env, &creator, &client, "bindretry");
    let new_creator = Address::generate(&env);
    let payer = Address::generate(&env);
    let receipt_id = String::from_str(&env, "bindrcpt3");
    let tx_hash = String::from_str(&env, "bindtx3");

    let first = client.record_payment_idempotent(
        &settler,
        &receipt_id,
        &id,
        &payer,
        &100i128,
        &tx_hash,
    );
    let retry = client.record_payment_idempotent(
        &settler,
        &receipt_id,
        &id,
        &payer,
        &100i128,
        &tx_hash,
    );
    assert_eq!(first, retry);

    client.transfer_ownership(&id, &new_creator);
    assert_eq!(
        client.try_settle_payment(&settler, &receipt_id),
        Err(Ok(Error::Unauthorized))
    );
}

#[test]
fn receipt_binding_is_scoped_to_its_own_resource_id() {
    let (env, creator, _admin, settler, client) = setup_with_settler();
    let paid_id = register_default(&env, &creator, &client, "bindresca");
    let other_id = register_default(&env, &creator, &client, "bindrescb");
    let other_creator = Address::generate(&env);
    let payer = Address::generate(&env);
    let receipt_id = String::from_str(&env, "bindrcpt4");

    client.record_payment(
        &settler,
        &receipt_id,
        &paid_id,
        &payer,
        &100i128,
        &String::from_str(&env, "bindtx4"),
    );
    client.transfer_ownership(&other_id, &other_creator);

    client.settle_payment(&settler, &receipt_id);
    assert_eq!(client.get_payment(&receipt_id).state, PaymentState::Settled);

    assert_eq!(
        client.try_record_creator_refund(
            &other_creator,
            &String::from_str(&env, "bindrefd4"),
            &receipt_id,
            &payer,
            &10i128,
            &String::from_str(&env, "bindrtx4"),
        ),
        Err(Ok(Error::Unauthorized))
    );
}
