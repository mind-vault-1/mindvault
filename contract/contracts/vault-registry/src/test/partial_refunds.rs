// ─── Partial refund accounting (#990) ───────────────────────────────────────

use crate::test::{register_default, setup_with_settlement};
use crate::{Error, PaymentState, VaultRegistryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup_with_payment<'a>() -> (
    Env,
    Address,
    Address,
    Address,
    VaultRegistryClient<'a>,
    String,
    String,
) {
    let (env, creator, admin, settler, client) = setup_with_settlement();
    let resource_id = register_default(&env, &creator, &client, "refundres");
    let payment_id = String::from_str(&env, "payment1");
    let payer = Address::generate(&env);
    
    client.record_payment(
        &settler,
        &payment_id,
        &resource_id,
        &payer,
        &10_000_000i128,
        &String::from_str(&env, "tx1"),
    );
    client.settle_payment(&settler, &payment_id);
    
    (env, creator, settler, payer, client, resource_id, payment_id)
}

#[test]
fn multiple_partial_refunds_track_cumulative_amount() {
    let (env, creator, _settler, payer, client, _resource_id, payment_id) =
        setup_with_payment();
    
    // Initial state: no refunds
    assert_eq!(client.get_refunded_amount(&payment_id), 0i128);
    assert_eq!(client.get_remaining_refundable(&payment_id), 10_000_000i128);
    
    // First partial refund: 3M
    client.record_creator_refund(
        &creator,
        &String::from_str(&env, "refund1"),
        &payment_id,
        &payer,
        &3_000_000i128,
        &String::from_str(&env, "reftx1"),
    );
    
    assert_eq!(client.get_refunded_amount(&payment_id), 3_000_000i128);
    assert_eq!(client.get_remaining_refundable(&payment_id), 7_000_000i128);
    
    // Second partial refund: 2M
    client.record_creator_refund(
        &creator,
        &String::from_str(&env, "refund2"),
        &payment_id,
        &payer,
        &2_000_000i128,
        &String::from_str(&env, "reftx2"),
    );
    
    assert_eq!(client.get_refunded_amount(&payment_id), 5_000_000i128);
    assert_eq!(client.get_remaining_refundable(&payment_id), 5_000_000i128);
    
    // Third partial refund: 5M (exhausts balance)
    client.record_creator_refund(
        &creator,
        &String::from_str(&env, "refund3"),
        &payment_id,
        &payer,
        &5_000_000i128,
        &String::from_str(&env, "reftx3"),
    );
    
    assert_eq!(client.get_refunded_amount(&payment_id), 10_000_000i128);
    assert_eq!(client.get_remaining_refundable(&payment_id), 0i128);
}

#[test]
fn refund_cannot_exceed_remaining_balance() {
    let (env, creator, _settler, payer, client, _resource_id, payment_id) =
        setup_with_payment();
    
    // Refund 6M
    client.record_creator_refund(
        &creator,
        &String::from_str(&env, "refund1"),
        &payment_id,
        &payer,
        &6_000_000i128,
        &String::from_str(&env, "reftx1"),
    );
    
    // Try to refund 5M more (would exceed 10M total)
    let result = client.try_record_creator_refund(
        &creator,
        &String::from_str(&env, "refund2"),
        &payment_id,
        &payer,
        &5_000_000i128,
        &String::from_str(&env, "reftx2"),
    );
    
    assert_eq!(result, Err(Ok(Error::PaymentAmountMismatch)));
    assert_eq!(client.get_refunded_amount(&payment_id), 6_000_000i128);
    assert_eq!(client.get_remaining_refundable(&payment_id), 4_000_000i128);
}

#[test]
fn refund_receipt_includes_remaining_balance() {
    let (env, creator, _settler, payer, client, _resource_id, payment_id) =
        setup_with_payment();
    
    let refund_id = String::from_str(&env, "refund1");
    client.record_creator_refund(
        &creator,
        &refund_id,
        &payment_id,
        &payer,
        &3_000_000i128,
        &String::from_str(&env, "reftx1"),
    );
    
    let refund = client.get_refund(&refund_id);
    assert_eq!(refund.amount, 3_000_000i128);
    assert_eq!(refund.remaining_balance, 7_000_000i128);
    
    // Second refund
    let refund_id2 = String::from_str(&env, "refund2");
    client.record_creator_refund(
        &creator,
        &refund_id2,
        &payment_id,
        &payer,
        &7_000_000i128,
        &String::from_str(&env, "reftx2"),
    );
    
    let refund2 = client.get_refund(&refund_id2);
    assert_eq!(refund2.amount, 7_000_000i128);
    assert_eq!(refund2.remaining_balance, 0i128);
}

#[test]
fn duplicate_refund_id_rejected() {
    let (env, creator, _settler, payer, client, _resource_id, payment_id) =
        setup_with_payment();
    
    let refund_id = String::from_str(&env, "refund1");
    client.record_creator_refund(
        &creator,
        &refund_id,
        &payment_id,
        &payer,
        &1_000_000i128,
        &String::from_str(&env, "reftx1"),
    );
    
    // Try to use same refund_id again
    let result = client.try_record_creator_refund(
        &creator,
        &refund_id,
        &payment_id,
        &payer,
        &1_000_000i128,
        &String::from_str(&env, "reftx2"),
    );
    
    assert_eq!(result, Err(Ok(Error::ReceiptAlreadyExists)));
}

#[test]
fn admin_override_supports_partial_refunds() {
    let (env, creator, _settler, payer, client, _resource_id, payment_id) =
        setup_with_payment();
    let admin = client.admin().unwrap();
    
    // Advance past refund window
    let deadline = client.get_refund_deadline(&payment_id);
    env.ledger().set_sequence_number(deadline);
    
    // Admin can still do partial refunds
    client.record_admin_refund(
        &admin,
        &String::from_str(&env, "adminref1"),
        &payment_id,
        &payer,
        &2_000_000i128,
        &String::from_str(&env, "admintx1"),
    );
    
    assert_eq!(client.get_refunded_amount(&payment_id), 2_000_000i128);
    assert_eq!(client.get_remaining_refundable(&payment_id), 8_000_000i128);
    
    client.record_admin_refund(
        &admin,
        &String::from_str(&env, "adminref2"),
        &payment_id,
        &payer,
        &3_000_000i128,
        &String::from_str(&env, "admintx2"),
    );
    
    assert_eq!(client.get_refunded_amount(&payment_id), 5_000_000i128);
    assert_eq!(client.get_remaining_refundable(&payment_id), 5_000_000i128);
}

#[test]
fn remaining_refundable_never_negative() {
    let (env, creator, _settler, payer, client, _resource_id, payment_id) =
        setup_with_payment();
    
    // Refund full amount
    client.record_creator_refund(
        &creator,
        &String::from_str(&env, "refundfull"),
        &payment_id,
        &payer,
        &10_000_000i128,
        &String::from_str(&env, "reftxfull"),
    );
    
    // Remaining should be 0, not negative
    assert_eq!(client.get_remaining_refundable(&payment_id), 0i128);
}

#[test]
fn refunds_work_independently_across_payments() {
    let (env, creator, settler, client) = setup_with_settlement();
    let resource_id = register_default(&env, &creator, &client, "multiref");
    let payer = Address::generate(&env);
    
    // Two separate payments
    let payment1 = String::from_str(&env, "pay1");
    let payment2 = String::from_str(&env, "pay2");
    
    client.record_payment(
        &settler,
        &payment1,
        &resource_id,
        &payer,
        &5_000_000i128,
        &String::from_str(&env, "tx1"),
    );
    client.settle_payment(&settler, &payment1);
    
    client.record_payment(
        &settler,
        &payment2,
        &resource_id,
        &payer,
        &8_000_000i128,
        &String::from_str(&env, "tx2"),
    );
    client.settle_payment(&settler, &payment2);
    
    // Refund from payment 1
    client.record_creator_refund(
        &creator,
        &String::from_str(&env, "ref1"),
        &payment1,
        &payer,
        &2_000_000i128,
        &String::from_str(&env, "reftx1"),
    );
    
    // Refund from payment 2
    client.record_creator_refund(
        &creator,
        &String::from_str(&env, "ref2"),
        &payment2,
        &payer,
        &3_000_000i128,
        &String::from_str(&env, "reftx2"),
    );
    
    // Each payment tracks its own refunds
    assert_eq!(client.get_refunded_amount(&payment1), 2_000_000i128);
    assert_eq!(client.get_remaining_refundable(&payment1), 3_000_000i128);
    
    assert_eq!(client.get_refunded_amount(&payment2), 3_000_000i128);
    assert_eq!(client.get_remaining_refundable(&payment2), 5_000_000i128);
}
