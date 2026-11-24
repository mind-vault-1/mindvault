// Focused regression tests for #987, #988 and #993.

fn setup_settled_payment<'a>() -> (
    Env,
    Address,
    Address,
    Address,
    VaultRegistryClient<'a>,
    String,
) {
    let (env, creator, _admin, settler, client) = setup_with_settler();
    let resource_id = register_priced(&env, &creator, &client, "rfnd987", 1_000_000);
    let payment_id = String::from_str(&env, "rfndpay987");
    let payer = Address::generate(&env);
    client.record_payment(
        &settler,
        &payment_id,
        &resource_id,
        &payer,
        &1_000_000i128,
        &String::from_str(&env, "rfndtx987"),
    );
    client.settle_payment(&settler, &payment_id);
    (env, creator, settler, payer, client, payment_id)
}

fn record_refund(
    env: &Env,
    client: &VaultRegistryClient<'_>,
    creator: &Address,
    payer: &Address,
    payment_id: &String,
    refund_id: &str,
    amount: i128,
    tx_hash: &str,
) {
    client.record_creator_refund(
        creator,
        &String::from_str(&env, refund_id),
        payment_id,
        payer,
        &amount,
        &String::from_str(&env, tx_hash),
    );
}

#[test]
fn full_refund_is_terminal_for_settlement_and_later_refunds() {
    let (env, creator, settler, payer, client, payment_id) = setup_settled_payment();

    assert!(!client.is_payment_fully_refunded(&payment_id));
    record_refund(
        &env,
        &client,
        &creator,
        &payer,
        &payment_id,
        "rfnd987full",
        1_000_000,
        "rfndrtx987full",
    );
    assert!(client.is_payment_fully_refunded(&payment_id));
    assert_eq!(client.get_refunded_amount(&payment_id), 1_000_000);
    assert_eq!(client.get_remaining_refundable(&payment_id), 0);

    let events_before = env.events().all().len();
    assert_eq!(
        client.try_settle_payment(&settler, &payment_id),
        Err(Ok(Error::InvalidPaymentTransition))
    );
    assert_eq!(
        client.try_record_creator_refund(
            &creator,
            &String::from_str(&env, "rfnd987again"),
            &payment_id,
            &payer,
            &1i128,
            &String::from_str(&env, "rfndrtx987again"),
        ),
        Err(Ok(Error::InvalidPaymentTransition))
    );
    assert_eq!(env.events().all().len(), events_before);
    assert_eq!(client.get_refunded_amount(&payment_id), 1_000_000);
}

#[test]
fn interleaved_partial_refunds_and_settle_retries_keep_balances_consistent() {
    let (env, creator, settler, payer, client, payment_id) = setup_settled_payment();

    record_refund(
        &env,
        &client,
        &creator,
        &payer,
        &payment_id,
        "rfnd987part1",
        600_000,
        "rfndrtx987p1",
    );
    assert!(!client.is_payment_fully_refunded(&payment_id));
    let events_before = env.events().all().len();
    assert_eq!(
        client.try_settle_payment(&settler, &payment_id),
        Err(Ok(Error::InvalidPaymentTransition))
    );
    assert_eq!(env.events().all().len(), events_before);
    assert_eq!(client.get_remaining_refundable(&payment_id), 400_000);

    record_refund(
        &env,
        &client,
        &creator,
        &payer,
        &payment_id,
        "rfnd987part2",
        400_000,
        "rfndrtx987p2",
    );
    assert!(client.is_payment_fully_refunded(&payment_id));
    assert_eq!(client.get_remaining_refundable(&payment_id), 0);
    assert_eq!(
        client.try_record_creator_refund(
            &creator,
            &String::from_str(&env, "rfnd987later"),
            &payment_id,
            &payer,
            &1i128,
            &String::from_str(&env, "rfndrtx987later"),
        ),
        Err(Ok(Error::InvalidPaymentTransition))
    );
}

#[test]
fn refund_before_settlement_is_rejected_without_writing() {
    let (env, creator, settler, payer, client, payment_id) = setup_settled_payment();
    let unsettled = String::from_str(&env, "rfndpay987unsettled");
    let resource_id = client.get_payment(&payment_id).resource_id;
    client.record_payment(
        &settler,
        &unsettled,
        &resource_id,
        &payer,
        &1_000_000i128,
        &String::from_str(&env, "rfndtx987unsettled"),
    );

    assert_eq!(
        client.try_record_creator_refund(
            &creator,
            &String::from_str(&env, "rfnd987early"),
            &unsettled,
            &payer,
            &1i128,
            &String::from_str(&env, "rfndrtx987early"),
        ),
        Err(Ok(Error::InvalidPaymentTransition))
    );
    assert_eq!(
        env.events().all().len(),
        0,
        "a rejected refund must not emit events"
    );
    assert!(!client.is_payment_fully_refunded(&unsettled));
}

#[test]
fn duplicate_refund_id_keeps_its_existing_stable_error() {
    let (env, creator, _settler, payer, client, payment_id) = setup_settled_payment();
    record_refund(
        &env,
        &client,
        &creator,
        &payer,
        &payment_id,
        "rfnd987dup",
        100_000,
        "rfndrtx987dup1",
    );
    assert_eq!(
        client.try_record_creator_refund(
            &creator,
            &String::from_str(&env, "rfnd987dup"),
            &payment_id,
            &payer,
            &100_000,
            &String::from_str(&env, "rfndrtx987dup2"),
        ),
        Err(Ok(Error::ReceiptAlreadyExists))
    );
}

#[test]
fn invalid_refund_ids_fail_before_auth_or_storage_access() {
    let (env, owner, stranger, client, _resource_id) = setup_strict_auth();
    let empty = String::from_str(&env, "");
    let payment_id = String::from_str(&env, "rfndpay988");
    let tx_hash = String::from_str(&env, "rfndtx988");

    // No auth is mocked: if `require_auth` ran before validation this would
    // fail with an auth error instead of the stable receipt-id error.
    assert_eq!(
        client.try_record_creator_refund(
            &stranger,
            &empty,
            &payment_id,
            &stranger,
            &1i128,
            &tx_hash,
        ),
        Err(Ok(Error::InvalidReceiptId))
    );
    assert_eq!(
        client.try_record_creator_refund(
            &stranger,
            &String::from_str(&env, "rfnd988"),
            &empty,
            &stranger,
            &1i128,
            &tx_hash,
        ),
        Err(Ok(Error::InvalidReceiptId))
    );

    // No admin exists in storage: an admin lookup before validation would
    // return `AdminNotSet`, so this proves validation comes first.
    assert_eq!(
        client.try_record_admin_refund(
            &stranger,
            &empty,
            &payment_id,
            &stranger,
            &1i128,
            &tx_hash,
        ),
        Err(Ok(Error::InvalidReceiptId))
    );
    assert_eq!(
        client.try_record_admin_refund_with_reason(
            &stranger,
            &String::from_str(&env, "rfnd988"),
            &empty,
            &stranger,
            &1i128,
            &tx_hash,
            &None,
        ),
        Err(Ok(Error::InvalidReceiptId))
    );
    assert_eq!(
        client.try_record_creator_refund_reason(
            &stranger,
            &empty,
            &payment_id,
            &stranger,
            &1i128,
            &tx_hash,
            &None,
        ),
        Err(Ok(Error::InvalidReceiptId))
    );
    let _ = owner;
}

#[test]
fn refund_id_length_boundaries_follow_payment_receipt_rules() {
    let (env, creator, _settler, payer, client, payment_id) = setup_settled_payment();
    let max = String::from_str(&env, &"a".repeat(64));
    let over = String::from_str(&env, &"a".repeat(65));
    let tx_hash = String::from_str(&env, "rfndrtx988max");

    assert_eq!(
        client.try_record_creator_refund(
            &creator,
            &over,
            &payment_id,
            &payer,
            &1i128,
            &tx_hash,
        ),
        Err(Ok(Error::InvalidReceiptId))
    );
    assert_eq!(
        client.try_record_creator_refund(
            &creator,
            &String::from_str(&env, "rfnd988ok"),
            &over,
            &payer,
            &1i128,
            &tx_hash,
        ),
        Err(Ok(Error::InvalidReceiptId)) // over-long payment receipt id
    );

    // A 64-byte refund id is accepted (with a valid payment receipt id).
    client.record_creator_refund(
        &creator,
        &max,
        &payment_id,
        &payer,
        &1i128,
        &tx_hash,
    );
    assert_eq!(client.get_refund(&max).amount, 1);
    assert!(!client.is_payment_fully_refunded(&payment_id));
}

#[test]
fn royalty_opt_out_defaults_off_and_is_creator_only() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "royopt993a");
    client.register(
        &creator,
        &id,
        &1_000_000i128,
        &String::from_str(&env, "ipfs://royopt"),
        &empty_tags(&env),
    );
    assert!(!client.get_royalty_opt_out(&id));

    env.mock_auths(&[]);
    assert!(client.try_set_royalty_opt_out(&id, &true).is_err());
    env.mock_all_auths();

    client.set_royalty_opt_out(&id, &true);
    assert!(client.get_royalty_opt_out(&id));
    client.set_royalty_opt_out(&id, &false);
    assert!(!client.get_royalty_opt_out(&id));
}

#[test]
fn royalty_opt_out_emits_an_auditable_change_event() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "royopt993b");
    client.register(
        &creator,
        &id,
        &1_000_000i128,
        &String::from_str(&env, "ipfs://royopt"),
        &empty_tags(&env),
    );

    client.set_royalty_opt_out(&id, &true);
    let first: (Address, bool, bool) = find_event(&env, &client.address, "royopt").unwrap();
    assert_eq!(first, (creator.clone(), false, true));

    client.set_royalty_opt_out(&id, &false);
    let latest: (Address, bool, bool) = find_event(&env, &client.address, "royopt").unwrap();
    assert_eq!(latest, (creator.clone(), true, false));

    // SDK 22 keeps only the most recent invocation's events, so each change
    // is checked right after the call that emits it.
    client.set_royalty_opt_out(&id, &true);
    let third: (Address, bool, bool) = find_event(&env, &client.address, "royopt").unwrap();
    assert_eq!(third, (creator, false, true));
}

#[test]
fn royalty_opt_out_is_independent_of_recipient_override() {
    let (env, creator, client) = setup();
    let id = String::from_str(&env, "royopt993c");
    client.register(
        &creator,
        &id,
        &1_000_000i128,
        &String::from_str(&env, "ipfs://royopt"),
        &empty_tags(&env),
    );
    let recipient = Address::generate(&env);

    client.set_royalty_opt_out(&id, &true);
    client.set_royalty_recipient(&id, &Some(recipient.clone()));
    assert_eq!(client.get(&id).royalty_recipient, Some(recipient));
    client.set_royalty_recipient(&id, &None);
    assert!(client.get_royalty_opt_out(&id));
}
