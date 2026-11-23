// ─── Simulation and Mutation Validation (#1017) ────────────────────────────
//
// Acceptance criteria (from issue):
//   • Shared tests compare simulation results with submitted mutations across
//     valid, invalid, and authorization cases.
//   • Update focused tests and relevant MCP/contract documentation.
//   • Keep changes bounded to the stated behavior and preserve existing client
//     compatibility where applicable.



// ── Simulation succeeds for valid payments ──────────────────────────────────

#[test]
fn simulate_record_payment_matches_stored_receipt() {
    let (env, creator, _admin, settler, client) = setup_with_settlement();
    let resource_id = register_default(&env, &creator, &client, "simres0");
    let payer = Address::generate(&env);
    let amount = 100i128;

    let receipt_id = String::from_str(&env, "receipt1");
    let tx_hash = String::from_str(&env, "txhash1");
    let simulated = client.simulate_record_payment(
        &settler,
        &receipt_id,
        &resource_id,
        &payer,
        &amount,
        &tx_hash,
    );

    client.record_payment(
        &settler,
        &receipt_id,
        &resource_id,
        &payer,
        &amount,
        &tx_hash,
    );
    assert_eq!(simulated, client.get_payment(&receipt_id));
}

// ── Simulation fails for invalid inputs matching mutation behavior ──────────

#[test]
fn simulate_record_payment_fails_for_invalid_resource() {
    let (env, _creator, _admin, settler, client) = setup_with_settlement();
    let payer = Address::generate(&env);
    let amount = 100i128;

    let sim_result = client.try_simulate_record_payment(
        &settler,
        &String::from_str(&env, "receipt1"),
        &String::from_str(&env, "invalid@resource"),
        &payer,
        &amount,
        &String::from_str(&env, "txhash1"),
    );

    let mut_result = client.try_record_payment(
        &settler,
        &String::from_str(&env, "receipt2"),
        &String::from_str(&env, "invalid@resource"),
        &payer,
        &amount,
        &String::from_str(&env, "txhash2"),
    );

    // Both should fail with the same error
    assert_eq!(sim_result, Err(Ok(Error::InvalidResourceId)));
    assert_eq!(mut_result, Err(Ok(Error::InvalidResourceId)));
}

#[test]
fn simulate_record_payment_fails_for_invalid_payment_amount() {
    let (env, creator, _admin, settler, client) = setup_with_settlement();
    let resource_id = register_default(&env, &creator, &client, "simres1");
    let payer = Address::generate(&env);

    let sim_result = client.try_simulate_record_payment(
        &settler,
        &String::from_str(&env, "receipt1"),
        &resource_id,
        &payer,
        &-100i128,
        &String::from_str(&env, "txhash1"),
    );

    let mut_result = client.try_record_payment(
        &settler,
        &String::from_str(&env, "receipt2"),
        &resource_id,
        &payer,
        &-100i128,
        &String::from_str(&env, "txhash2"),
    );

    // Both should fail with the same error
    assert_eq!(sim_result, Err(Ok(Error::InvalidPaymentAmount)));
    assert_eq!(mut_result, Err(Ok(Error::InvalidPaymentAmount)));
}

// ── Simulation respects pause state like mutations ───────────────────────────

#[test]
fn simulate_record_payment_fails_when_paused_like_mutation() {
    let (env, creator, admin, settler, client) = setup_with_settlement();
    let resource_id = register_default(&env, &creator, &client, "simres2");
    let payer = Address::generate(&env);
    let amount = 100i128;

    // Pause contract
    client.set_paused(&admin, &true);

    let sim_result = client.try_simulate_record_payment(
        &settler,
        &String::from_str(&env, "receipt1"),
        &resource_id,
        &payer,
        &amount,
        &String::from_str(&env, "txhash1"),
    );

    let mut_result = client.try_record_payment(
        &settler,
        &String::from_str(&env, "receipt2"),
        &resource_id,
        &payer,
        &amount,
        &String::from_str(&env, "txhash2"),
    );

    // Both should fail with ContractPaused
    assert_eq!(sim_result, Err(Ok(Error::ContractPaused)));
    assert_eq!(mut_result, Err(Ok(Error::ContractPaused)));
}

#[test]
fn simulate_record_payment_fails_when_payment_paused_like_mutation() {
    let (env, creator, admin, settler, client) = setup_with_settlement();
    let resource_id = register_default(&env, &creator, &client, "simres3");
    let payer = Address::generate(&env);
    let amount = 100i128;

    // Pause only payments
    client.set_payment_paused(&admin, &true);

    let sim_result = client.try_simulate_record_payment(
        &settler,
        &String::from_str(&env, "receipt1"),
        &resource_id,
        &payer,
        &amount,
        &String::from_str(&env, "txhash1"),
    );

    let mut_result = client.try_record_payment(
        &settler,
        &String::from_str(&env, "receipt2"),
        &resource_id,
        &payer,
        &amount,
        &String::from_str(&env, "txhash2"),
    );

    // Both should fail with ContractPaused
    assert_eq!(sim_result, Err(Ok(Error::ContractPaused)));
    assert_eq!(mut_result, Err(Ok(Error::ContractPaused)));
}

// ── Simulation does not modify state ────────────────────────────────────────

#[test]
fn simulate_record_payment_does_not_modify_state() {
    let (env, creator, _admin, settler, client) = setup_with_settlement();
    let resource_id = register_default(&env, &creator, &client, "simres4");
    let payer = Address::generate(&env);
    let amount = 100i128;

    // Simulate recording a payment
    let _sim_result = client.simulate_record_payment(
        &settler,
        &String::from_str(&env, "receipt1"),
        &resource_id,
        &payer,
        &amount,
        &String::from_str(&env, "txhash1"),
    );

    // Try to get the payment - it should not exist
    let res = client.try_get_payment(&String::from_str(&env, "receipt1"));
    assert_eq!(res, Err(Ok(Error::NotFound)));
}

// ── Simulation result structure matches receipt structure ───────────────────

#[test]
fn simulate_record_payment_returns_correct_receipt_structure() {
    let (env, creator, _admin, settler, client) = setup_with_settlement();
    let resource_id = register_default(&env, &creator, &client, "simres5");
    let payer = Address::generate(&env);
    let amount = 100i128;
    let receipt_id = String::from_str(&env, "simreceipt");

    let sim_receipt = client.simulate_record_payment(
        &settler,
        &receipt_id,
        &resource_id,
        &payer,
        &amount,
        &String::from_str(&env, "txhash"),
    );

    // Verify all fields
    assert_eq!(sim_receipt.receipt_id, receipt_id);
    assert_eq!(sim_receipt.resource_id, resource_id);
    assert_eq!(sim_receipt.payer, payer);
    assert_eq!(sim_receipt.amount, amount);
    assert_eq!(
        sim_receipt.state,
        PaymentState::Escrowed,
        "Simulated payment should be in Escrowed state"
    );
    assert_eq!(sim_receipt.tx_hash, String::from_str(&env, "txhash"));
}

// ── Simulation error codes match mutation errors ───────────────────────────

#[test]
fn simulate_record_payment_emits_validation_event() {
    let (env, creator, _admin, settler, client) = setup_with_settlement();
    let resource_id = register_default(&env, &creator, &client, "simres6");
    let payer = Address::generate(&env);
    let amount = 100i128;

    // Success case
    client.simulate_record_payment(
        &settler,
        &String::from_str(&env, "receipt1"),
        &resource_id,
        &payer,
        &amount,
        &String::from_str(&env, "txhash1"),
    );

    let all_events = env.events().all();
    let mut found_success = false;
    for i in 0..all_events.len() {
        let (_, topics, _) = all_events.get(i).unwrap();
        let topic = topics
            .get(0)
            .and_then(|value| Symbol::try_from_val(&env, &value).ok());
        if topic == Some(symbol_short!("simvalid")) {
            found_success = true;
            break;
        }
    }
    assert!(
        found_success,
        "simulate_record_payment must emit a 'simvalid' event"
    );
}

// ── Simulation with nonexistent settler matches mutation error ──────────────

#[test]
fn simulate_record_payment_fails_without_settler_role() {
    let (env, creator, _admin, _settler, client) = setup_with_settlement();
    let resource_id = register_default(&env, &creator, &client, "simres7");
    let not_settler = Address::generate(&env);
    let payer = Address::generate(&env);
    let amount = 100i128;

    let sim_result = client.try_simulate_record_payment(
        &not_settler,
        &String::from_str(&env, "receipt1"),
        &resource_id,
        &payer,
        &amount,
        &String::from_str(&env, "txhash1"),
    );

    let mut_result = client.try_record_payment(
        &not_settler,
        &String::from_str(&env, "receipt2"),
        &resource_id,
        &payer,
        &amount,
        &String::from_str(&env, "txhash2"),
    );

    // Both should fail with NotSettler
    assert_eq!(sim_result, Err(Ok(Error::NotSettler)));
    assert_eq!(mut_result, Err(Ok(Error::NotSettler)));
}
